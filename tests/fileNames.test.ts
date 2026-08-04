import assert from 'node:assert/strict'
import test from 'node:test'
import { safeFileName } from '../src/fileNames'

test('export file names are valid across Windows and macOS', () => {
  assert.equal(safeFileName('A/B:C*D?'), 'A_B_C_D_')
  assert.equal(safeFileName('CON'), '_CON')
  assert.equal(safeFileName('title...   '), 'title')
  assert.equal(safeFileName('***'), '___')
  assert.equal(safeFileName('...'), 'screenplay')
})

test('export file names never split non-BMP characters at the length boundary', () => {
  const name = safeFileName(`${'a'.repeat(63)}🎬tail`, 64)
  assert.equal(Array.from(name).length, 64)
  assert.equal(name.endsWith('🎬'), true)
  assert.equal(name.includes('\uFFFD'), false)
})
