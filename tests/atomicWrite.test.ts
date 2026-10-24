import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

async function loadWriter(fileSystem = fs, platform = process.platform, delay = setTimeout) {
  const source = await fs.readFile('electron/main.cjs', 'utf8')
  const start = source.indexOf('async function atomicWriteFileWithAccess(')
  const end = source.indexOf('\nfunction loadPdfParser', start)
  assert.ok(start >= 0 && end > start)
  return runInNewContext(`(${source.slice(start, end)})`, { fs: fileSystem, path, process: { pid: process.pid, platform }, Date, Math, setTimeout: delay }) as (name: string, content: string, encoding: string) => Promise<void>
}
test('atomic writer replaces existing files on the current OS without pre-deleting the original', async () => {
  await fs.mkdir('tmp', { recursive: true })
  const directory = await fs.mkdtemp(path.resolve('tmp', 'atomic-write-'))
  const target = path.join(directory, 'existing.txt')
  await fs.writeFile(target, 'old')
  const write = await loadWriter()
  await write(target, 'new', 'utf8')
  assert.equal(await fs.readFile(target, 'utf8'), 'new')
})
test('transient Windows sharing failures retry the atomic replacement without deleting the original', async () => {
  const directory = await fs.mkdtemp(path.resolve('tmp', 'atomic-retry-'))
  const target = path.join(directory, 'existing.txt')
  await fs.writeFile(target, 'original')
  let attempts = 0
  const write = await loadWriter({ ...fs, rename: async (from, to) => {
    assert.equal(await fs.readFile(target, 'utf8'), 'original')
    if (++attempts < 3) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' })
    await fs.rename(from, to)
  } }, 'win32', ((callback: () => void) => { callback(); return 0 }) as unknown as typeof setTimeout)
  await write(target, 'new', 'utf8')
  assert.equal(attempts, 3)
  assert.equal(await fs.readFile(target, 'utf8'), 'new')
})
test('persistent sharing failures stop after bounded retries and preserve the original', async () => {
  const directory = await fs.mkdtemp(path.resolve('tmp', 'atomic-persistent-'))
  const target = path.join(directory, 'existing.txt')
  await fs.writeFile(target, 'original')
  let attempts = 0
  const write = await loadWriter({ ...fs, rename: async () => {
    attempts += 1
    throw Object.assign(new Error('busy'), { code: 'EBUSY' })
  } }, 'win32', ((callback: () => void) => { callback(); return 0 }) as unknown as typeof setTimeout)
  await assert.rejects(write(target, 'new', 'utf8'), /busy/u)
  assert.equal(attempts, 6)
  assert.equal(await fs.readFile(target, 'utf8'), 'original')
  assert.deepEqual(await fs.readdir(directory), ['existing.txt'])
})
test('a sharing retry refuses to overwrite another program edit', async () => {
  const directory = await fs.mkdtemp(path.resolve('tmp', 'atomic-conflict-'))
  const target = path.join(directory, 'existing.txt')
  await fs.writeFile(target, 'original')
  let attempts = 0
  const write = await loadWriter({ ...fs, rename: async () => {
    attempts += 1
    await fs.writeFile(target, 'external edit remains')
    throw Object.assign(new Error('locked'), { code: 'EACCES' })
  } }, 'win32', ((callback: () => void) => { callback(); return 0 }) as unknown as typeof setTimeout)
  await assert.rejects(write(target, 'new', 'utf8'), /其他程序/u)
  assert.equal(attempts, 1)
  assert.equal(await fs.readFile(target, 'utf8'), 'external edit remains')
  assert.deepEqual(await fs.readdir(directory), ['existing.txt'])
})
test('a failed atomic rename preserves the old file and removes only its new temporary copy', async () => {
  await fs.mkdir('tmp', { recursive: true })
  const directory = await fs.mkdtemp(path.resolve('tmp', 'atomic-fail-'))
  const target = path.join(directory, 'existing.txt')
  await fs.writeFile(target, 'original')
  const write = await loadWriter({ ...fs, rename: async () => { throw new Error('EPERM simulation') } })
  await assert.rejects(write(target, 'changed', 'utf8'), /EPERM/u)
  assert.equal(await fs.readFile(target, 'utf8'), 'original')
  assert.deepEqual(await fs.readdir(directory), ['existing.txt'])
})
