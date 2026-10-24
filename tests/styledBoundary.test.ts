import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, getFormat } from '../src/formats'
import { displayElement, inlineDialogueElements, wrapStyledText } from '../src/styledLayout'
import { layoutScreenplay, wrapMeasuredText } from '../src/layoutEngine'
import { patchTextRange, TextRunLimitError, normalizeTextRuns } from '../src/textStyles'
import { createDefaultProject } from '../src/sample'

test('styled empty and trailing lines match plain paragraph newline semantics', () => {
  for (const text of ['', '\n', '\n\n', 'A\n', 'A\n\n', '\nA\n\n', '\r\n', 'A\r\n\r\n']) {
    const element = { ...createElement('action', text), textRuns: text ? [{ start: 0, end: text.length, bold: true }] : undefined }
    const measure = (value: string) => Array.from(value).length
    const plain = wrapMeasuredText(text, 100, measure, 'zh-CN')
    const styled = wrapStyledText(element, 100, measure, {})
    assert.deepEqual(styled.lines, plain, JSON.stringify(text))
    assert.equal(styled.lines.length, styled.lineRuns.length)
  }
})

test('an annotation overflow is explicit and leaves its source text and ranges unchanged', () => {
  const text = '中'.repeat(20000)
  const element = { ...createElement('action', text), textRuns: Array.from({ length: 10000 }, (_, index) => ({ start: index * 2, end: index * 2 + 2, bold: Boolean(index % 2) })) }
  const before = JSON.stringify(element)
  assert.throws(() => patchTextRange(element, 1, 2, { italic: true }), TextRunLimitError)
  assert.equal(JSON.stringify(element), before)
  assert.throws(() => normalizeTextRuns(Array.from({ length: 10001 }, () => ({ start: 0, end: 1, bold: true })), 1), TextRunLimitError)
})

test('applying one uniform style at the annotation limit compacts rather than throwing', () => {
  const text = '中'.repeat(10000)
  const element = { ...createElement('action', text), textRuns: Array.from({ length: text.length }, (_, index) => ({ start: index, end: index + 1, bold: Boolean(index % 2) })) }
  const patched = patchTextRange(element, 0, text.length, { bold: true })
  assert.equal(patched.text, text)
  assert.deepEqual(patched.textRuns, [{ start: 0, end: text.length, bold: true }])
})

test('uppercase display preserves dense valid ranges without treating derived runs as saved annotations', () => {
  const text = 'a '.repeat(6000)
  const element = { ...createElement('character', text), textRuns: Array.from({ length: 6000 }, (_, i) => ({ start: i * 2, end: i * 2 + 1, bold: true })) }
  const before = JSON.stringify(element)
  const displayed = displayElement(element, true, 'en-US')
  const wrapped = wrapStyledText(displayed, 500, value => value.length, {})
  assert.equal(wrapped.lineRuns.flat().map(part => part.text).join(''), text.toUpperCase())
  assert.equal(wrapped.lineRuns.flat().filter(part => part.style.bold).map(part => part.text).join(''), 'A'.repeat(6000))
  assert.equal(JSON.stringify(element), before)
})

test('inline dialogue renders two independently valid dense paragraphs without losing text or styles', () => {
  const text = '中'.repeat(6000)
  const runs = Array.from({ length: 6000 }, (_, i) => ({ start: i, end: i + 1, bold: Boolean(i % 2), fontFamily: i % 2 ? 'SimSun' : 'SimHei' }))
  const project = { ...createDefaultProject(), formatId: 'eastAsia' as const, eastAsianDialogueStyle: 'inline' as const, elements: [{ ...createElement('character', text), textRuns: runs }, { ...createElement('dialogue', text), textRuns: runs }] }
  const before = JSON.stringify(project)
  const inline = inlineDialogueElements(project)[0]
  assert.ok(inline.textRuns!.length > 10000, 'Fixture must exercise a derived run count over the persistence limit')
  const layout = layoutScreenplay(project, getFormat('eastAsia'))
  const parts = layout.pages.flatMap(page => page.blocks).filter(block => !block.synthetic).flatMap(block => block.lineRuns ?? []).flat()
  assert.equal(parts.map(part => part.text).join(''), text + '\uff1a' + text)
  assert.equal(parts.filter(part => part.style.fontFamily === 'SimSun').map(part => part.text).join(''), '中'.repeat(6000))
  assert.equal(parts.filter(part => part.style.fontFamily === 'SimHei').map(part => part.text).join(''), '中'.repeat(6000))
  assert.equal(JSON.stringify(project), before)
  assert.throws(() => normalizeTextRuns(inline.textRuns, inline.text.length), TextRunLimitError, 'Derived output must not weaken saved-file limits')
})
