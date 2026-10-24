import assert from 'node:assert/strict'
import test from 'node:test'
import { patchTextRange, textSegments, sliceElementText, normalizeTextRuns, remapTextRuns } from '../src/textStyles'
import { normalizeScriptProject } from '../src/projectMigration'
import { serializeProjectForSave } from '../src/projectSerialization'
import { createDefaultProject } from '../src/sample'
import { createElement, getFormat } from '../src/formats'
import { fontDisplayName, isSelectableFont } from '../src/fontFamilies'
import { layoutScreenplay } from '../src/layoutEngine'
import { displayElement, inlineDialogueElements, wrapStyledText } from '../src/styledLayout'

test('partial styles overlap without changing text or unselected characters', () => {
  const original = createElement('action', '郭然看向窗外……')
  const bold = patchTextRange(original, 0, 2, { bold: true })
  const mixed = patchTextRange(bold, 1, 4, { italic: true })
  assert.equal(mixed.text, original.text)
  assert.deepEqual(textSegments(mixed).map(s => [s.text, s.style]), [['郭', { bold: true }], ['然', { bold: true, italic: true }], ['看向', { italic: true }], ['窗外……', {}]])
  assert.deepEqual(sliceElementText(mixed, 1, 4).textRuns, [{ start: 0, end: 1, bold: true, italic: true }, { start: 1, end: 3, italic: true }])
})

test('Unicode text and partial styles survive JSON save reopen independently of chosen font', () => {
  for (const fontFamily of ['SimSun', '宋体', 'Microsoft YaHei', 'Courier Prime']) {
    const project = { ...createDefaultProject(), fontFamily, eastAsianDialogueStyle: 'inline' as const, elements: [patchTextRange(createElement('action', '中文�繁體……𠮷😀 English'), 0, 2, { bold: true, underline: true })] }
    const opened = normalizeScriptProject(JSON.parse(serializeProjectForSave(project)))
    assert.equal(opened.fontFamily, fontFamily)
    assert.deepEqual(opened.elements, project.elements)
    assert.equal(opened.eastAsianDialogueStyle, 'inline')
  }
})

test('range sanitization rejects out of bounds and clamps restored ranges', () => {
  assert.deepEqual(normalizeTextRuns([{ start: -1, end: 5, bold: true }, { start: 1, end: 100, italic: true }], 4), [{ start: 1, end: 4, italic: true }])
  const element = patchTextRange(createElement('action', '人物走向门口'), 2, 6, { underline: true })
  assert.deepEqual(remapTextRuns(element, '人物突然走向门口'), [{ start: 4, end: 8, underline: true }])
})

test('Chinese font labels never change stored CSS family and hide internal font subsets', () => {
  assert.equal(fontDisplayName('SimSun'), '宋体')
  assert.equal(fontDisplayName('SimHei'), '黑体')
  assert.equal(isSelectableFont('w_MSCS-ExtB'), false)
  assert.equal(fontDisplayName('����'), '无法识别的旧字体')
  assert.equal(isSelectableFont('思源宋体 CN'), true)
})

test('east Asian inline dialogue joins display only and preserves original structured paragraphs', () => {
  const project = { ...createDefaultProject(), formatId: 'eastAsia' as const, eastAsianDialogueStyle: 'inline' as const, elements: [createElement('character', '郭然'), createElement('dialogue', '我们走吧。')] }
  const original = JSON.stringify(project.elements)
  assert.equal(inlineDialogueElements(project)[0].text, '郭然：我们走吧。')
  const blocks = layoutScreenplay(project, getFormat('eastAsia')).pages.flatMap(page => page.blocks)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].text, '郭然：我们走吧。')
  assert.equal(JSON.stringify(project.elements), original)
  project.elements[0].textRuns = [{ start: 0, end: 2, italic: true }]
  const inline = inlineDialogueElements(project)[0]
  assert.equal(textSegments(inline).find(segment => segment.text === '郭然')?.style.italic, true)
})

test('mixed font metrics, explicit newlines, graphemes, and uppercase expansions keep style ranges', () => {
  const source = patchTextRange(createElement('action', 'ABC你好\n\n𠮷😀'), 3, 5, { bold: true })
  const wrapped = wrapStyledText(source, 5, (text, style) => Array.from(text).length * (style?.bold ? 2 : 1), {})
  assert.ok(wrapped.lines.length >= 3)
  assert.equal(wrapped.lineRuns.flat().filter(part => part.style.bold).map(part => part.text).join(''), '你好')
  assert.equal(wrapped.lineRuns.flat().map(part => part.text).join(''), 'ABC你好𠮷😀')
  const upper = displayElement(patchTextRange(createElement('character', 'weiß'), 3, 4, { bold: true }), true, 'en-US')
  assert.equal(upper.text, 'WEISS')
  assert.equal(textSegments(upper).find(part => part.style.bold)?.text, 'SS')
})

test('pagination fragments retain every styled character without duplication', () => {
  const project = createDefaultProject()
  const element = patchTextRange(createElement('action', '中文姓名与英文 English '.repeat(600)), 0, 500, { bold: true, italic: true })
  project.elements = [element]
  const result = layoutScreenplay(project, getFormat('hollywood'))
  assert.ok(result.pages.length > 1)
  assert.equal(result.pages.flatMap(page => page.blocks).flatMap(block => block.lineRuns ?? []).flat().map(part => part.text).join(''), element.text)
})
