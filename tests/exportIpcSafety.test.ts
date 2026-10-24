import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

type Result = { canceled: boolean; filePath?: string }
type Payload = { html?: string; content?: string; protectFilePath?: string; suggestedName?: string; project?: string; sourcePath?: string }
async function pdfHandler(destination?: string) {
  const source = await fs.readFile('electron/main.cjs', 'utf8')
  const start = source.indexOf('function registerIpc() {'), end = source.indexOf('\nfunction normalizeDesktopLocale(', start)
  assert.ok(start >= 0 && end > start)
  const handlers = new Map<string, (event: unknown, payload: Payload) => Promise<Result>>()
  let renders = 0
  const register = runInNewContext(`(${source.slice(start, end)})`, {
    ipcMain: { handle: (name: string, fn: (event: unknown, payload: Payload) => Promise<Result>) => handlers.set(name, fn) },
    require: createRequire(path.resolve('electron/main.cjs')), fs, path,
    assertBackupDestination: createRequire(path.resolve('electron/main.cjs'))('./backupDestination.cjs').assertBackupDestination,
    withFileAccess: async (_files: string[], operation: () => unknown) => operation(),
    ensureProjectFolder: async () => true,
    maxIpcTextBytes: 1024 * 1024, maxProjectFileBytes: 1024 * 1024,
    assertTextPayload: (value: unknown) => { assert.equal(typeof value, 'string') },
    showSaveDialogFor: async () => destination ? { canceled: false, filePath: destination } : { canceled: true },
    renderPdf: async () => { renders++; return Buffer.from('%PDF-synthetic') },
    buildPortableProject: async () => ({ bytes: Buffer.from('ZIP-synthetic'), manifest: { issues: [], assetCount: 0 } }),
    applicationLocale: 'zh-CN',
    atomicWriteFile: async (file: string, data: Buffer) => fs.writeFile(file, data),
  })
  register()
  return { run: handlers.get('export:pdf')!, portable: handlers.get('project:exportPortable')!, renderCount: () => renders }
}

test('PDF export refuses the current project destination before rendering or writing', async () => {
  await fs.mkdir('tmp', { recursive: true })
  const folder = await fs.mkdtemp(path.resolve('tmp', 'pdf-source-protection-'))
  const original = path.join(folder, 'original.ssproj'), manuscript = '{"elements":[{"text":"Synthetic original"}]}'
  await fs.writeFile(original, manuscript)
  const handler = await pdfHandler(original)
  await assert.rejects(handler.run({}, { html: '<html>synthetic</html>', protectFilePath: original, suggestedName: 'script.pdf' }))
  assert.equal(await fs.readFile(original, 'utf8'), manuscript)
  assert.equal(handler.renderCount(), 0)
})

test('PDF export refuses source aliases but allows a separate output and cancel does no work', async () => {
  const folder = await fs.mkdtemp(path.resolve('tmp', 'pdf-output-protection-'))
  const original = path.join(folder, 'original.ssproj'), alias = path.join(folder, 'alias.pdf'), output = path.join(folder, 'separate.pdf')
  await fs.writeFile(original, 'original'); await fs.link(original, alias)
  const linked = await pdfHandler(alias)
  await assert.rejects(linked.run({}, { html: '<html/>', protectFilePath: original }))
  assert.equal(await fs.readFile(original, 'utf8'), 'original')
  const separate = await pdfHandler(output)
  assert.equal((await separate.run({}, { html: '<html/>', protectFilePath: original })).canceled, false)
  assert.equal(await fs.readFile(output, 'utf8'), '%PDF-synthetic')
  const canceled = await pdfHandler()
  assert.equal((await canceled.run({}, { html: '<html/>', protectFilePath: original })).canceled, true)
  assert.equal(canceled.renderCount(), 0)
  assert.equal(await fs.readFile(original, 'utf8'), 'original')
})

test('portable project packaging cannot replace its source project', async () => {
  const folder = await fs.mkdtemp(path.resolve('tmp', 'portable-output-protection-'))
  const original = path.join(folder, 'original.ssproj'), output = path.join(folder, 'separate.sspack')
  await fs.writeFile(original, 'original')
  const same = await pdfHandler(original)
  await assert.rejects(same.portable({}, { project: '{}', sourcePath: original, suggestedName: 'script.sspack' }))
  assert.equal(await fs.readFile(original, 'utf8'), 'original')
  const separate = await pdfHandler(output)
  assert.equal((await separate.portable({}, { project: '{}', sourcePath: original })).canceled, false)
  assert.equal(await fs.readFile(output, 'utf8'), 'ZIP-synthetic')
})
