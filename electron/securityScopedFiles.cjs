const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { readBoundedJsonFile } = require('./snapshotSafety.cjs')

function failure(code) {
  const messages = {
    store: '文件授权记录无法安全读取或保存，稿件未因此覆盖。请保留当前内容并重新授权，或检查磁盘空间。',
    selection: '没有取得有效的文件授权，请重新选择文件或文件夹。',
    scope: '文件授权已失效，请重新选择文件或其保存文件夹。',
    directory: '请选择当前文件实际所在的保存文件夹。取消不会改动原稿。',
  }
  const error = new Error(messages[code])
  error.code = `ERR_SCREENPLAY_AUTHORIZATION_${code.toUpperCase()}`
  return error
}

function createSecurityScopedFiles({ enabled, app, storePath, containerPaths = [], io = fs, readJson = readBoundedJsonFile, maximumEntries = 2048 }) {
  const normalize = value => {
    if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw failure('selection')
    return path.normalize(value)
  }
  const contains = (directory, target) => {
    const relative = path.relative(directory, target)
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  }
  const internal = target => containerPaths.some(directory => contains(normalize(directory), target))
  const valid = record => record && typeof record.directory === 'boolean'
    && typeof record.bookmark === 'string' && record.bookmark.length > 0 && record.bookmark.length <= 256 * 1024
    && /^[A-Za-z0-9+/]+={0,2}$/.test(record.bookmark)
    && normalize(record.path) === record.path
  let records = []
  let ready
  let writeQueue = Promise.resolve()
  const active = new Map()
  const prompts = new Map()

  function load() {
    if (!enabled) return Promise.resolve()
    if (!ready) {
      const pending = (async () => {
        try {
          const value = await readJson(storePath, 8 * 1024 * 1024)
          if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > maximumEntries
            || !value.entries.every(valid) || new Set(value.entries.map(entry => `${entry.directory}:${entry.path}`)).size !== value.entries.length) throw failure('store')
          records = value.entries
        } catch (error) {
          if (error.code !== 'ENOENT') throw failure('store')
        }
      })()
      ready = pending
      // A failed read must not permanently block later authorization attempts.
      pending.catch(() => { if (ready === pending) ready = undefined })
    }
    return ready
  }

  function rememberSelection(result, directory = false) {
    if (!enabled || result.canceled) return Promise.resolve()
    const paths = result.filePaths ?? (result.filePath ? [result.filePath] : [])
    const bookmarks = result.bookmarks ?? (result.bookmark ? [result.bookmark] : [])
    let selected
    try {
      if (!paths.length || paths.length !== bookmarks.length) throw failure('selection')
      selected = paths.map((file, index) => ({ path: normalize(file), directory, bookmark: bookmarks[index] }))
      if (!selected.every(valid)) throw failure('selection')
    } catch { return Promise.reject(failure('selection')) }
    const task = writeQueue.catch(() => {}).then(async () => {
      await load()
      const merged = new Map(records.map(record => [`${record.directory}:${record.path}`, record]))
      for (const record of selected) merged.set(`${record.directory}:${record.path}`, record)
      const entries = [...merged.values()]
      const serialized = JSON.stringify({ version: 1, entries })
      if (entries.length > maximumEntries || Buffer.byteLength(serialized) > 8 * 1024 * 1024) throw failure('store')
      const temporary = path.join(path.dirname(storePath), `.file-authorization-${randomUUID()}.tmp`)
      try {
        await io.mkdir(path.dirname(storePath), { recursive: true })
        await io.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await io.rename(temporary, storePath)
        records = entries
      } catch { throw failure('store') }
      finally { await io.rm(temporary, { force: true }).catch(() => {}) }
    })
    writeQueue = task
    return task
  }

  async function withAccess(paths, operation) {
    if (!enabled) return operation()
    const targets = paths.filter(Boolean).map(normalize).filter(target => !internal(target))
    if (!targets.length) return operation()
    await load()
    const acquired = []
    let result
    let failed = false
    let operationError
    let stopFailed = false
    try {
      for (const target of targets) {
        const candidates = records.filter(record => record.directory ? contains(record.path, target) : record.path === target)
          .sort((a, b) => b.path.length - a.path.length)
        // Finder and current open panels can supply implicit, nonpersistent access.
        if (!candidates.length) continue
        let authorized = false
        for (const { bookmark } of candidates) {
          let scope = active.get(bookmark)
          if (!scope) {
            let stop
            try { stop = app.startAccessingSecurityScopedResource(bookmark) } catch { continue }
            if (typeof stop !== 'function') continue
            scope = { stop, count: 0 }
            active.set(bookmark, scope)
          }
          scope.count += 1
          acquired.push([bookmark, scope])
          authorized = true
          break
        }
        if (!authorized) throw failure('scope')
      }
      result = await operation()
    } catch (error) {
      failed = true
      operationError = error
    } finally {
      for (const [bookmark, scope] of acquired.reverse()) {
        scope.count -= 1
        if (scope.count === 0) {
          active.delete(bookmark)
          try { scope.stop() } catch { stopFailed = true }
        }
      }
    }
    if (failed) throw operationError
    if (stopFailed) throw failure('scope')
    return result
  }

  async function ensureDirectoryAccess(directory, chooseDirectory, { readOnly = false } = {}) {
    if (!enabled) return true
    const target = normalize(directory)
    if (internal(target)) return true
    await load()
    if (records.some(record => record.directory && contains(record.path, target))) {
      try {
        await withAccess([target], () => io.access(target, readOnly ? 4 : 2))
        return true
      } catch (error) {
        if (!['ERR_SCREENPLAY_AUTHORIZATION_SCOPE', 'EACCES', 'EPERM', 'ENOENT'].includes(error.code)) throw error
      }
    }
    if (!prompts.has(target)) {
      const request = (async () => {
        const result = await chooseDirectory(target)
        if (result.canceled) return false
        if (result.filePaths?.length !== 1 || normalize(result.filePaths[0]) !== target) throw failure('directory')
        await rememberSelection(result, true)
        await withAccess([target], () => io.access(target, readOnly ? 4 : 2))
        return true
      })()
      prompts.set(target, request)
      request.finally(() => prompts.delete(target)).catch(() => {})
    }
    return prompts.get(target)
  }

  return { rememberSelection, withAccess, ensureDirectoryAccess }
}

module.exports = { createSecurityScopedFiles }
