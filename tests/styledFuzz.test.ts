import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from '../src/formats'
import { wrapStyledText } from '../src/styledLayout'
import { textSegments } from '../src/textStyles'

test('seeded multilingual styled wrapping never loses or duplicates non-newline characters', () => {
  let seed = 0x1037
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed }
  const tokens = ['a', '中', '\n', '\r\n', 'e\u0301', '𠮷', '👩‍💻', ' ', '，', '…', '한', 'あ']
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (let sample = 0; sample < 1200; sample++) {
    const text = Array.from({ length: 1 + next() % 40 }, () => tokens[next() % tokens.length]).join('')
    const textRuns = Array.from({ length: next() % 12 }, (_, index) => {
      const start = next() % text.length
      return { start, end: Math.min(text.length, start + 1 + next() % 12), bold: Boolean(index % 2), italic: Boolean(index % 3) }
    })
    const element = { ...createElement('action', text), textRuns }
    const before = JSON.stringify(element)
    const width = 1 + next() % 20
    const wrapped = wrapStyledText(element, width, (value, style) => Array.from(segmenter.segment(value)).length * (style?.bold ? 2 : 1), {})
    assert.equal(wrapped.lineRuns.flat().map(part => part.text).join(''), text.replace(/\r?\n/g, ''), `sample ${sample}`)
    assert.equal(wrapped.lines.length, wrapped.lineRuns.length)
    assert.equal(textSegments(element).map(part => part.text).join(''), text)
    assert.equal(JSON.stringify(element), before)
    assert.ok(wrapped.lines.length <= text.length + 1)
  }
})
