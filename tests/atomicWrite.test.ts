import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

async function loadWriter(fileSystem = fs) {
  const source = await fs.readFile('electron/main.cjs', 'utf8')
  const start = source.indexOf('async function atomicWriteFile(')
  const end = source.indexOf('\nfunction loadPdfParser', start)
  assert.ok(start >= 0 && end > start)
  return runInNewContext(`(${source.slice(start, end)})`, { fs: fileSystem, path, process, Date, Math }) as (name: string, content: string, encoding: string) => Promise<void>
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
