import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { cleanFontName, uniqueFontNames } = require('../electron/fontNames.cjs')

test('system font cleanup preserves legitimate family punctuation and international names', () => {
  assert.equal(cleanFontName('Baskerville & Co Regular'), 'Baskerville & Co')
  assert.equal(cleanFontName('思源黑体 (OpenType)'), '思源黑体')
  assert.equal(cleanFontName('Noto  Sans\u0000  CJK'), 'Noto Sans CJK')
})

test('font enumeration removes empty and duplicate family names', () => {
  assert.deepEqual(uniqueFontNames(['Courier Prime Regular', 'Courier Prime', '', null]), ['Courier Prime'])
})
