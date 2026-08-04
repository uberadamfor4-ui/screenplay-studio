import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getFormat,
  getScreenplayCharacterWidth,
  getScreenplayFontStack,
  getScreenplayLineHeight,
  wrapElementText,
  wrapTextToScreenplayLines,
} from '../src/formats'

const hollywood = getFormat('hollywood')

test('Hollywood typography uses a 12pt, 10-pitch, six-lines-per-inch grid', () => {
  assert.equal(getScreenplayLineHeight(12), 16)
  assert.equal(getScreenplayCharacterWidth(12), 9.6)
  assert.match(getScreenplayFontStack('Courier New', hollywood), /^"Courier Prime"/)
  assert.match(getScreenplayFontStack('Arial', hollywood, 'en-US', true), /^"Arial", "Courier Prime"/)
  const hostileFont = getScreenplayFontStack('Arial"; background:url(https://example.invalid/x)\n', hollywood, 'en-US', true)
  assert.doesNotMatch(hostileFont, /background:url|https:|;\s*background|\r|\n/u)
  assert.match(getScreenplayFontStack('方正·兰亭黑 Pro', hollywood, 'zh-CN', true), /^"方正·兰亭黑 Pro"/)
})

test('Hollywood page and dialogue dimensions match the professional template', () => {
  assert.deepEqual(hollywood.page, {
    kind: 'letter',
    width: 816,
    height: 1056,
    marginTop: 96,
    marginRight: 96,
    marginBottom: 96,
    marginLeft: 144,
  })
  assert.equal(hollywood.elements.dialogue.marginLeft, 96)
  assert.equal(hollywood.elements.dialogue.width, 336)
  assert.equal(hollywood.elements.character.marginLeft, 240)
  assert.equal(hollywood.elements.character.align, 'left')
  assert.equal(hollywood.elements.parenthetical.width, 144)
})

test('English action wraps at 60 ten-pitch characters', () => {
  const layout = hollywood.elements.action
  assert.equal(wrapElementText({ text: 'A'.repeat(60) }, layout, 12).length, 1)
  assert.deepEqual(wrapElementText({ text: 'A'.repeat(61) }, layout, 12).map((line) => line.length), [60, 1])
})

test('CJK action and dialogue use the actual 12pt full-width glyph metric', () => {
  const action = hollywood.elements.action
  const dialogue = hollywood.elements.dialogue
  assert.equal(wrapElementText({ text: '中'.repeat(36) }, action, 12).length, 1)
  assert.deepEqual(wrapElementText({ text: '中'.repeat(37) }, action, 12).map((line) => line.length), [36, 1])
  assert.equal(wrapElementText({ text: '中'.repeat(21) }, dialogue, 12).length, 1)
  assert.deepEqual(wrapElementText({ text: '中'.repeat(22) }, dialogue, 12).map((line) => line.length), [21, 1])
})

test('Hangul syllables use wide-glyph wrapping in editor previews', () => {
  assert.deepEqual(wrapTextToScreenplayLines('한글한글', 5), ['한글한', '글'])
})
