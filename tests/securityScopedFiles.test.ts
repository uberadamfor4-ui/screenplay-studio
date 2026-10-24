import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createSecurityScopedFiles } = require('../electron/securityScopedFiles.cjs')
const bookmark = (value: string) => Buffer.from(value).toString('base64')

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.join(process.cwd(), 'tmp', 'mas-file-authorizations')
  await fs.mkdir(base, { recursive: true })
  const directory = await fs.mkdtemp(path.join(base, 'case-'))
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }) })
  const storePath = path.join(directory, 'container', 'bookmarks.json')
  const folder = path.join(directory, 'project')
  await fs.mkdir(folder)
  const calls: string[] = []
  const app = { startAccessingSecurityScopedResource(value: string) { calls.push(`start:${value}`); return () => { calls.push(`stop:${value}`) } } }
  const options = { enabled: true, app, storePath, containerPaths: [path.dirname(storePath)] }
  return { directory, folder, storePath, calls, options, create: (overrides = {}) => createSecurityScopedFiles({ ...options, ...overrides }) }
}

test('non-store builds do not touch authorization storage or native APIs', async () => {
  const access = createSecurityScopedFiles({ enabled: false })
  assert.equal(await access.withAccess([undefined], () => 42), 42)
  assert.equal(await access.ensureDirectoryAccess(undefined), true)
  await access.rememberSelection({})
})

test('selected folders survive restart and access is stopped on success and exceptions', async t => {
  const f = await fixture(t)
  await f.create().rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('folder')] }, true)
  const afterRestart = f.create()
  assert.equal(await afterRestart.withAccess([path.join(f.folder, 'draft.ssproj')], () => 'content'), 'content')
  await assert.rejects(afterRestart.withAccess([f.folder], () => { throw new Error('read failed') }))
  assert.deepEqual(f.calls, [`start:${bookmark('folder')}`, `stop:${bookmark('folder')}`, `start:${bookmark('folder')}`, `stop:${bookmark('folder')}`])
})

test('canceled or mismatched folder authorization cannot create a project or persist a grant', async t => {
  const f = await fixture(t)
  const access = f.create()
  const draft = path.join(f.folder, 'draft.ssproj')
  assert.equal(await access.ensureDirectoryAccess(f.folder, async () => ({ canceled: true })), false)
  await assert.rejects(access.ensureDirectoryAccess(f.folder, async () => ({ canceled: false, filePaths: [f.directory], bookmarks: [bookmark('too-broad')] })))
  await assert.rejects(fs.stat(f.storePath), { code: 'ENOENT' })
  await assert.rejects(fs.stat(draft), { code: 'ENOENT' })
})

test('folder containment does not authorize a same-prefix sibling', async t => {
  const f = await fixture(t)
  const access = f.create()
  await access.rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('folder')] }, true)
  let prompts = 0
  assert.equal(await access.ensureDirectoryAccess(`${f.folder}-other`, async () => { prompts++; return { canceled: true } }), false)
  assert.equal(prompts, 1)
})

test('storage failure preserves the previous grants and can be retried without losing earlier records', async t => {
  const f = await fixture(t)
  await f.create().rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('original')] }, true)
  const before = await fs.readFile(f.storePath, 'utf8')
  let fail = true
  const access = f.create({ io: { ...fs, rename: async (...args: Parameters<typeof fs.rename>) => { if (fail) throw Object.assign(new Error('full'), { code: 'ENOSPC' }); return fs.rename(...args) } } })
  const other = path.join(f.folder, 'other.ssproj')
  await assert.rejects(access.rememberSelection({ filePaths: [other], bookmarks: [bookmark('other')] }), { code: 'ERR_SCREENPLAY_AUTHORIZATION_STORE' })
  assert.equal(await fs.readFile(f.storePath, 'utf8'), before)
  fail = false
  await access.rememberSelection({ filePaths: [other], bookmarks: [bookmark('other')] })
  assert.equal(JSON.parse(await fs.readFile(f.storePath, 'utf8')).entries.length, 2)
})

test('corrupted authorization files are retained, never silently replaced', async t => {
  const f = await fixture(t)
  await fs.mkdir(path.dirname(f.storePath), { recursive: true })
  await fs.writeFile(f.storePath, '{invalid-original')
  const access = f.create()
  await assert.rejects(access.rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('new')] }, true))
  assert.equal(await fs.readFile(f.storePath, 'utf8'), '{invalid-original')
})

test('overlapping operations share a scope and release it only after all operations finish', async t => {
  const f = await fixture(t)
  const access = f.create()
  await access.rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('shared')] }, true)
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const first = access.withAccess([f.folder], async () => { entered(); await hold })
  await started
  await access.withAccess([f.folder], () => assert.equal(f.calls.length, 1))
  assert.equal(f.calls.length, 1)
  release(); await first
  assert.equal(f.calls.length, 2)
})

test('simultaneous selections merge instead of overwriting each other', async t => {
  const f = await fixture(t)
  const access = f.create()
  await Promise.all(['a', 'b'].map(name => access.rememberSelection({ filePaths: [path.join(f.folder, name)], bookmarks: [bookmark(name)] })))
  const entries = JSON.parse(await fs.readFile(f.storePath, 'utf8')).entries
  assert.deepEqual(entries.map((entry: { path: string }) => path.basename(entry.path)).sort(), ['a', 'b'])
})

test('stale scope prompts for the exact directory and replaces only that grant', async t => {
  const f = await fixture(t)
  await f.create().rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('stale')] }, true)
  const access = f.create({ app: { startAccessingSecurityScopedResource(value: string) { if (value === bookmark('stale')) throw new Error('stale'); return () => {} } } })
  let prompts = 0
  assert.equal(await access.ensureDirectoryAccess(f.folder, async () => { prompts++; return { canceled: false, filePaths: [f.folder], bookmarks: [bookmark('fresh')] } }), true)
  assert.equal(prompts, 1)
  assert.equal(JSON.parse(await fs.readFile(f.storePath, 'utf8')).entries[0].bookmark, bookmark('fresh'))
})

test('missing bookmark data and invalid records do not produce a saved grant', async t => {
  const f = await fixture(t)
  const access = f.create()
  for (const result of [{ filePaths: [f.folder] }, { filePaths: [f.folder], bookmarks: ['private string with spaces'] }, { filePaths: [f.folder, f.folder], bookmarks: [bookmark('only-one')] }]) {
    await assert.rejects(access.rememberSelection(result))
  }
  await assert.rejects(fs.stat(f.storePath), { code: 'ENOENT' })
})

test('a corrupted external authorization store cannot block container autosave', async t => {
  const f = await fixture(t)
  await fs.mkdir(path.dirname(f.storePath), { recursive: true })
  await fs.writeFile(f.storePath, '{invalid')
  const internal = path.join(path.dirname(f.storePath), 'recovery.json')
  await f.create().withAccess([internal], () => fs.writeFile(internal, 'saved-local-recovery'))
  assert.equal(await fs.readFile(internal, 'utf8'), 'saved-local-recovery')
})

test('a stale exact-file grant can fall back to a valid parent-folder grant', async t => {
  const f = await fixture(t)
  const file = path.join(f.folder, 'draft.ssproj')
  const access = f.create({ app: { startAccessingSecurityScopedResource(value: string) { if (value === bookmark('stale-file')) throw new Error('stale'); return () => {} } } })
  await access.rememberSelection({ filePaths: [file], bookmarks: [bookmark('stale-file')] })
  await access.rememberSelection({ filePaths: [f.folder], bookmarks: [bookmark('parent')] }, true)
  assert.equal(await access.withAccess([file], () => 42), 42)
})
