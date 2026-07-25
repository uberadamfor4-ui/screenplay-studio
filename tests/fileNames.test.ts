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
