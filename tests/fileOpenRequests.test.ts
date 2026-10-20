import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { projectPathsFromArguments, createFileOpenQueue } = require('../electron/fileOpenRequests.cjs')

test('external project arguments preserve Windows Unicode and spaces and ignore switches and URLs', () => {
  assert.deepEqual(projectPathsFromArguments(['app.exe', '--user-data-dir=D:\\fake.ssproj', 'D:\\中文 空格\\最新.SSPROJ', 'relative.fdx', 'https://example.com/data.json', 'bad\0.ssproj', 'plain.txt'], 'D:\\scripts', 'win32'), ['D:\\中文 空格\\最新.SSPROJ', 'D:\\scripts\\relative.fdx'])
})

test('external project arguments accept native Mac document events without treating protocols as paths', () => {
  assert.deepEqual(projectPathsFromArguments(['/Users/example/中文 稿.ssproj', 'next.json', 'file:///tmp/no.ssproj'], '/tmp', 'darwin'), ['/Users/example/中文 稿.ssproj', '/tmp/next.json'])
})

test('external opening waits for an exact acknowledgement and a later request cannot consume an earlier one', () => {
  const queue = createFileOpenQueue('win32')
  queue.add(['D:\\A.ssproj', 'd:\\a.ssproj', 'D:\\B.ssproj'])
  const first = queue.peek()
  assert.equal(queue.acknowledge(first.requestId + 1), false)
  assert.equal(queue.peek(), first)
  assert.equal(queue.acknowledge(first.requestId), true)
  assert.equal(queue.peek().filePath, 'D:\\B.ssproj')
  queue.acknowledge(queue.peek().requestId)
  queue.add(['D:\\A.ssproj'])
  assert.ok(queue.peek().requestId > first.requestId)
})

test('pending external projects are bounded without discarding their existing order', () => {
  const queue = createFileOpenQueue()
  assert.equal(queue.add(Array.from({ length: 20 }, (_, i) => `/tmp/${i}.ssproj`)), 4)
  for (let i = 0; i < 16; i++) { assert.equal(queue.peek().filePath, `/tmp/${i}.ssproj`); queue.acknowledge(queue.peek().requestId) }
  assert.equal(queue.peek(), undefined)
})
