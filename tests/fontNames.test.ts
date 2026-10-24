import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { cleanFontName, uniqueFontNames, collectFontNames } = require('../electron/fontNames.cjs')

test('system font cleanup preserves legitimate family punctuation and international names', () => {
  assert.equal(cleanFontName('Baskerville & Co Regular'), 'Baskerville & Co')
  assert.equal(cleanFontName('思源黑体 (OpenType)'), '思源黑体')
  assert.equal(cleanFontName('Noto  Sans\u0000  CJK'), 'Noto Sans CJK')
})

test('Mac inventory reads CSS families instead of filenames, display names, or PostScript faces', () => {
  const names: string[] = []
  collectFontNames({ SPFontsDataType: [{ _name: 'Songti.ttc', typefaces: [{ family: 'Songti SC', full_name: 'Songti SC Bold', postscript_name: 'STSongti-SC-Bold' }, { family: 'Songti SC', display_name: 'Songti SC Regular' }] }] }, names)
  assert.deepEqual(uniqueFontNames(names), ['Songti SC'])
  const unavailable: string[] = []
  collectFontNames({ _name: 'Songti.ttc', display_name: 'Songti SC Bold' }, unavailable)
  assert.deepEqual(unavailable, [])
})

test('font enumeration removes empty and duplicate family names', () => {
  assert.deepEqual(uniqueFontNames(['Courier Prime Regular', 'Courier Prime', '', null]), ['Courier Prime'])
})
