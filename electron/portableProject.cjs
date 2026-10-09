const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { fileURLToPath } = require('node:url')
const JSZip = require('jszip')
const crc32 = require('jszip/lib/crc32')

const limits = Object.freeze({ archive: 512 * 1024 * 1024, project: 32 * 1024 * 1024, asset: 100 * 1024 * 1024, total: 500 * 1024 * 1024, entries: 1002 })
const extensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.pdf', '.mp3', '.wav', '.m4a', '.mp4', '.mov'])
function error(code) { throw new Error(`portable:${code}`) }
function parseProject(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > limits.project) error('invalid-project')
  const project = JSON.parse(source)
  if (!project || !Array.isArray(project.elements) || project.elements.length > 5000) error('invalid-project')
  return project
}
function references(project) {
  const refs = []
  const prod = project.production
  if (!prod || typeof prod !== 'object') return refs
  for (const name of ['locations', 'assets', 'shots']) {
    const items = prod[name]
    if (items !== undefined && (!Array.isArray(items) || items.length > 10000)) error('invalid-project')
    for (const item of items ?? []) {
      if (!item || typeof item !== 'object') error('invalid-project')
      if (name === 'shots') {
        if (typeof item.storyboardPath === 'string' && item.storyboardPath) refs.push({ value: item.storyboardPath, set: value => { item.storyboardPath = value } })
      } else if (item.photoPaths !== undefined) {
        if (!Array.isArray(item.photoPaths) || item.photoPaths.length > 20000) error('invalid-project')
        item.photoPaths.forEach((value, index) => { if (typeof value === 'string' && value) refs.push({ value, set: next => { item.photoPaths[index] = next } }) })
      }
    }
  }
  if (refs.length > 10000) error('too-many-assets')
  return refs
}
function resolveAsset(value, sourcePath) {
  let local = value
  if (/^file:/iu.test(value)) { try { local = fileURLToPath(value) } catch { return undefined } }
  if (/^(?:[a-z]+:)?\/\//iu.test(local) || /^\\\\/u.test(local) || /^[a-z]+:/iu.test(local) && !/^[a-z]:[\\/]/iu.test(local)) return undefined
  if (!extensions.has(path.extname(local).toLowerCase())) return undefined
  if (path.isAbsolute(local)) return local
  const resolved = sourcePath ? path.resolve(path.dirname(sourcePath), local) : undefined
  return resolved && !/^(?:\\\\|\/\/)/u.test(resolved) ? resolved : undefined
}
async function readBoundedFile(filePath, cap) {
  const handle = await fs.open(filePath, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > cap) error('size-limit')
    const bytes = Buffer.allocUnsafe(stat.size + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    const after = await handle.stat()
    if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) error('source-changed')
    return bytes.subarray(0, length)
  } finally { await handle.close() }
}
async function buildPortableProject(source, sourcePath) {
  const project = parseProject(source)
  const zip = new JSZip()
  const issues = []
  const packed = new Map()
  const skipped = new Set()
  let total = 0
  for (const ref of references(project)) {
    const local = resolveAsset(ref.value, sourcePath)
    if (local && packed.has(local)) { ref.set(packed.get(local)); continue }
    if (skipped.has(ref.value)) { ref.set(''); continue }
    let stat
    if (local) { try { stat = await fs.stat(local) } catch { /* Missing assets are reported in the manifest. */ } }
    if (!local || !stat?.isFile()) {
      const name = path.basename(ref.value.replace(/\\/gu, '/')).slice(0, 200)
      issues.push({ code: local ? 'missing' : 'unsupported', name })
      skipped.add(ref.value); ref.set(''); continue
    }
    if (stat.size > limits.asset || total + stat.size > limits.total || packed.size >= limits.entries - 2) error('size-limit')
    const bytes = await readBoundedFile(local, Math.min(limits.asset, limits.total - total))
    if (bytes.length > limits.asset || total + bytes.length > limits.total) error('size-limit')
    const name = `assets/${String(packed.size + 1).padStart(6, '0')}${path.extname(local).toLowerCase()}`
    zip.file(name, bytes, { createFolders: false })
    packed.set(local, name); ref.set(name); total += bytes.length
  }
  const fontNames = [...new Set([project.fontFamily, ...project.elements.map(x => x.textStyle?.fontFamily)].filter(x => typeof x === 'string'))]
  const manifest = { kind: 'screenplay-portable', version: 1, assetCount: packed.size, fonts: fontNames, issues }
  const serialized = JSON.stringify(project)
  if (Buffer.byteLength(serialized) > limits.project) error('invalid-project')
  zip.file('project.ssproj', serialized)
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  // STORE keeps packing predictable for already-compressed media, without a long CPU-bound compression step.
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
  if (bytes.length > limits.archive) error('size-limit')
  return { bytes, manifest }
}
async function boundedEntry(entry, cap) {
  const expected = Number(entry._data?.uncompressedSize)
  if (!Number.isSafeInteger(expected) || expected < 0 || expected > cap) error('size-limit')
  return new Promise((resolve, reject) => {
    const stream = entry.internalStream('nodebuffer')
    const chunks = []; let total = 0; let crc = 0; let stopped = false
    const stop = () => { if (stopped) return; stopped = true; stream.pause(); reject(new Error('portable:corrupt-entry')) }
    stream.on('data', chunk => { if (stopped) return; total += chunk.length; if (total > expected || total > cap) stop(); else { crc = crc32(chunk, crc); chunks.push(chunk) } })
      .on('error', stop).on('end', () => { if (!stopped) { if (total !== expected || crc !== entry._data.crc32) stop(); else resolve(Buffer.concat(chunks)) } }).resume()
  })
}
function validName(name) { return name === 'project.ssproj' || name === 'manifest.json' || /^assets\/\d{6}\.[a-z0-9]+$/u.test(name) && extensions.has(path.posix.extname(name)) }
async function inspectPortableArchive(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > limits.archive) error('size-limit')
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false })
  const entries = Object.values(zip.files)
  if (entries.length > limits.entries || !zip.file('project.ssproj') || !zip.file('manifest.json')) error('invalid-archive')
  let total = 0
  for (const entry of entries) {
    if (entry.dir || !validName(entry.name) || entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) error('unsafe-path')
    const size = Number(entry._data?.uncompressedSize)
    if (!Number.isSafeInteger(size) || size < 0 || size > (entry.name === 'project.ssproj' ? limits.project : entry.name === 'manifest.json' ? 1024 * 1024 : limits.asset)) error('size-limit')
    total += size
    if (total > limits.total + limits.project + 1024 * 1024) error('size-limit')
  }
  const content = (await boundedEntry(zip.file('project.ssproj'), limits.project)).toString('utf8')
  const project = parseProject(content)
  const manifest = JSON.parse((await boundedEntry(zip.file('manifest.json'), 1024 * 1024)).toString('utf8'))
  if (manifest.kind !== 'screenplay-portable' || manifest.version !== 1 || !Array.isArray(manifest.fonts) || !Array.isArray(manifest.issues) || manifest.issues.length > 10000) error('invalid-archive')
  const assetNames = new Set(entries.filter(x => x.name.startsWith('assets/')).map(x => x.name))
  if (manifest.assetCount !== assetNames.size) error('invalid-archive')
  for (const ref of references(project)) if (!assetNames.has(ref.value)) error('missing-asset')
  return { entries, content, manifest }
}
async function extractPortableProject(bytes, parentDirectory, validateProject = async () => {}) {
  const inspected = await inspectPortableArchive(bytes)
  await validateProject(inspected.content)
  const base = await fs.realpath(parentDirectory)
  const staging = await fs.mkdtemp(path.join(base, '.screenplay-import-'))
  const destination = path.join(base, `Screenplay-${Date.now()}-${randomUUID().slice(0, 8)}`)
  try {
    for (const entry of inspected.entries) {
      const target = path.resolve(staging, entry.name)
      const relative = path.relative(staging, target)
      if (relative.startsWith('..') || path.isAbsolute(relative)) error('unsafe-path')
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await boundedEntry(entry, entry.name === 'project.ssproj' ? limits.project : entry.name === 'manifest.json' ? 1024 * 1024 : limits.asset), { flag: 'wx' })
    }
    await fs.rename(staging, destination)
    return { content: inspected.content, filePath: path.join(destination, 'project.ssproj'), manifest: inspected.manifest }
  } catch (err) {
    // Only this freshly-created, checked staging directory is removed on failure.
    if (path.dirname(staging) === base && path.basename(staging).startsWith('.screenplay-import-')) await fs.rm(staging, { recursive: true, force: true })
    throw err
  }
}
module.exports = { buildPortableProject, inspectPortableArchive, extractPortableProject, resolveAsset, readBoundedFile, limits }
