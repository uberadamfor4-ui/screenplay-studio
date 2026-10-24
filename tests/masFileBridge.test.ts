import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const root = process.cwd()
const mainFile = path.join(root, 'electron/main.cjs')
const source = await fs.readFile(mainFile, 'utf8')
const bookmark = Buffer.from('synthetic-mas-directory').toString('base64')

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.join(root, 'tmp', 'mas-bridge')
  await fs.mkdir(base, { recursive: true })
  const directory = await fs.mkdtemp(path.join(base, 'case-'))
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }) })
  const folder = path.join(directory, 'script'), profile = path.join(directory, 'profile')
  await fs.mkdir(folder); await fs.mkdir(profile)
  const file = path.join(folder, 'script.ssproj')
  const state = { directoryPrompts: 0, savePrompts: 0, cancel: false, starts: 0, stops: 0 }
  const load = () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
    const app = { setName() {}, on() {}, requestSingleInstanceLock: () => true, isPackaged: false, isReady: () => true,
      whenReady: () => ({ then() {} }), getPath: () => profile,
      startAccessingSecurityScopedResource() { state.starts++; return () => { state.stops++ } },
    }
    const dialog = {
      async showSaveDialog(options: { securityScopedBookmarks?: boolean }) {
        state.savePrompts++
        assert.equal(options.securityScopedBookmarks, false, 'save panels must not create placeholder files')
        return { canceled: false, filePath: file }
      },
      async showOpenDialog(options: { securityScopedBookmarks?: boolean }) {
        state.directoryPrompts++
        assert.equal(options.securityScopedBookmarks, true)
        return state.cancel ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [folder], bookmarks: [bookmark] }
      },
    }
    const electron = { app, dialog, BrowserWindow: { fromWebContents: () => undefined, getAllWindows: () => [] }, ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(key, handler) } }
    const context = { require: (name: string) => name === 'electron' ? electron : require(name.startsWith('./') ? path.resolve(path.dirname(mainFile), name) : name),
      __dirname: path.dirname(mainFile), process: { ...process, platform: 'darwin', mas: true, argv: ['synthetic', 'app'], cwd: () => directory },
      setTimeout, clearTimeout, Buffer, console, globalThis: {} as { bridge: { atomicWriteFile: (file: string, data: string, encoding: string) => Promise<void> } },
    }
    runInNewContext(`${source}\nregisterIpc();globalThis.bridge={atomicWriteFile};`, context)
    return { call: (key: string, payload: unknown) => handlers.get(key)!({ sender: { id: 1 } }, payload), bridge: context.globalThis.bridge }
  }
  return { directory, folder, profile, file, state, load }
}

test('MAS save authorizes once, preserves UTF-8/local formatting and overwrites the original after restart', async t => {
  const f = await fixture(t)
  const one = f.load()
  const content = JSON.stringify({ title: '虚构测试', elements: [{ text: '省略号……角色甲', textRuns: [{ start: 0, end: 3, bold: true, italic: true, underline: true }] }] })
  assert.equal((await one.call('file:saveText', { content, suggestedName: 'script.ssproj' }) as { canceled: boolean }).canceled, false)
  assert.equal(await fs.readFile(f.file, 'utf8'), content)
  assert.equal(f.state.directoryPrompts, 1)
  const two = f.load()
  await two.call('file:saveText', { content: `${content}\n`, filePath: f.file })
  assert.equal(await fs.readFile(f.file, 'utf8'), `${content}\n`)
  assert.equal(f.state.savePrompts, 1)
  assert.equal(f.state.directoryPrompts, 1)
  assert.equal(f.state.starts, f.state.stops)
})

test('canceling MAS folder access leaves both the original and a nonexistent new file untouched', async t => {
  const f = await fixture(t)
  f.state.cancel = true
  const app = f.load()
  const result = await app.call('file:saveText', { content: 'new content', suggestedName: 'script.ssproj' }) as { canceled: boolean }
  assert.equal(result.canceled, true)
  await assert.rejects(fs.stat(f.file), { code: 'ENOENT' })
  await fs.writeFile(f.file, 'original')
  assert.equal((await app.call('file:saveText', { filePath: f.file, content: 'overwrite' }) as { canceled: boolean }).canceled, true)
  assert.equal(await fs.readFile(f.file, 'utf8'), 'original')
})

test('protected original cannot be overwritten as a backup after MAS authorization', async t => {
  const f = await fixture(t)
  await fs.writeFile(f.file, 'original')
  await assert.rejects(f.load().call('file:saveText', { filePath: f.file, protectFilePath: f.file, content: 'backup-overwrite' }))
  assert.equal(await fs.readFile(f.file, 'utf8'), 'original')
  assert.equal(f.state.starts, f.state.stops)
})
