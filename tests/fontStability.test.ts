import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFontCatalog, canonicalFontFamily, changeProjectFont, fontFallbacks, fontKey, isFontAvailable, projectFontFamilies, readStoredInlineFont } from '../src/fontFamilies'
import { createElement, getFormat, getScreenplayFontStack } from '../src/formats'
import { createDefaultProject } from '../src/sample'
import { textSegments, patchTextRange, remapTextRuns } from '../src/textStyles'
import { normalizeScriptProject } from '../src/projectMigration'
import { serializeProjectForSave } from '../src/projectSerialization'
import { handoffWarnings } from '../src/workflowReview'

test('catalog contains detected families and bundled fonts, deduplicates aliases, and hides internal subsets', () => {
  const catalog = buildFontCatalog(['宋体', 'SimSun', 'simSUN', ' 黑体 ', 'w_MSCS-ExtB', ' @SimSun', '����'])
  assert.equal(catalog.filter(font => fontKey(font) === 'simsun').length, 1)
  assert.ok(catalog.includes('Courier Prime') && catalog.includes('Screenplay CJK'))
  assert.equal(catalog.some(font => /w_MSCS|@|�/.test(font)), false)
  assert.equal(catalog.includes('Arial'), false)
  assert.equal(canonicalFontFamily('宋体'), 'SimSun')
})

test('font availability uses aliases and exact bundled names rather than Courier substring', () => {
  assert.equal(isFontAvailable('宋体', ['SimSun']), true)
  assert.equal(isFontAvailable('SimSun', ['宋体']), true)
  assert.equal(isFontAvailable('Screenplay CJK SC', []), true)
  assert.equal(isFontAvailable('Courier New', []), false)
  assert.equal(isFontAvailable('Courier Custom', []), false)
})

test('serif and calligraphic fallbacks precede the bundled sans font on Windows and Mac', () => {
  const fallbacks = fontFallbacks('宋体')
  assert.equal(fallbacks[0], 'SimSun')
  assert.ok(fallbacks.indexOf('Songti SC') < fallbacks.indexOf('Screenplay CJK'))
  assert.ok(fontFallbacks('楷体').includes('Kaiti SC'))
  assert.ok(!fontFallbacks('Noto Sans CJK SC').includes('SimSun'))
  assert.match(getScreenplayFontStack('宋体', getFormat('hollywood'), 'zh-CN', true), /^"SimSun", "Songti SC"/)
  assert.match(getScreenplayFontStack('宋体', getFormat('hollywood')), /^"Courier Prime"/)
  assert.doesNotMatch(getScreenplayFontStack('Bad";font-size:900px', getFormat('audio')), /;|900px:/)
})

test('font change is a no-op when identical and otherwise preserves text and emphasis', () => {
  const project = { ...createDefaultProject(), fontFamily: 'SimSun', elements: [createElement('action', '中文……𠮷😀') ] }
  assert.equal(changeProjectFont(project, '宋体'), project)
  assert.equal(changeProjectFont(project, 'w_MSCS-ExtB'), project)
  project.elements[0].textStyle = { italic: true, fontFamily: 'Arial' }
  project.elements[0].textRuns = [{ start: 0, end: 2, bold: true, fontFamily: 'SimHei' }]
  const changed = changeProjectFont(project, '黑体')
  assert.equal(changed.fontFamily, 'SimHei')
  assert.equal(changed.elements[0].text, project.elements[0].text)
  assert.deepEqual(changed.elements[0].textStyle, { italic: true })
  assert.deepEqual(changed.elements[0].textRuns, [{ start: 0, end: 2, bold: true }])
  assert.equal(project.elements[0].textStyle.fontFamily, 'Arial')
})

test('missing font names survive save and reopen without replacing original content', () => {
  const project = { ...createDefaultProject(), fontFamily: 'A Missing Serif', elements: [patchTextRange(createElement('action', '中文�……繁體 e\u0301 𠮷👩‍💻'), 0, 2, { fontFamily: 'Another Missing Font', italic: true })] }
  const reopened = normalizeScriptProject(JSON.parse(serializeProjectForSave(project)))
  assert.equal(reopened.fontFamily, project.fontFamily)
  assert.deepEqual(reopened.elements, project.elements)
  assert.deepEqual(projectFontFamilies(reopened), ['A Missing Serif', 'Another Missing Font'])
  assert.ok(handoffWarnings(reopened, ['Courier Prime']).includes('font'))
})

test('inline renderer reads the requested family, not the expanded CSS fallback stack', () => {
  const style = `--screenplay-font: ${encodeURIComponent('宋体')}; font-family: "SimSun", "Songti SC", "Screenplay CJK"`
  assert.equal(readStoredInlineFont(style), '宋体')
  assert.equal(readStoredInlineFont('--screenplay-font: %broken; font-family: Arial'), undefined)
  assert.equal(readStoredInlineFont('font-family: "Arial"'), 'Arial')
})

test('insertion inside a styled range retains its suffix and excludes unrelated following text', () => {
  const element = patchTextRange(createElement('action', 'ABCDEF'), 1, 5, { bold: true, fontFamily: 'SimSun' })
  assert.deepEqual(remapTextRuns(element, 'ABCXDEF'), [{ start: 1, end: 6, bold: true, fontFamily: 'SimSun' }])
})

test('style ranges cannot split surrogate pairs, accents, or emoji joiner sequences', () => {
  for (const text of ['𠮷', 'e\u0301', '👩‍💻', '👨‍👩‍👧‍👦']) {
    const segments = textSegments({ text: `A${text}Z`, textRuns: [{ start: 2, end: 3, bold: true }] })
    assert.equal(segments.map(part => part.text).join(''), `A${text}Z`)
    assert.equal(segments.filter(part => part.style.bold).map(part => part.text).join(''), text)
  }
})

test('sweep preserves last-run-wins precedence independently for each style property', () => {
  let random = 123456
  const next = () => { random = (random * 1664525 + 1013904223) >>> 0; return random }
  const text = '中文abcdef'.repeat(30)
  const runs = Array.from({ length: 300 }, (_, index) => {
    const start = next() % text.length, end = Math.min(text.length, start + 1 + next() % 50)
    return { start, end, ...(index % 2 ? { bold: Boolean(next() % 2) } : { italic: Boolean(next() % 2) }), ...(index % 3 ? {} : { fontFamily: `Font ${next() % 5}` }) }
  })
  const parts = textSegments({ text, textRuns: runs })
  let at = 0
  for (const part of parts) {
    for (let index = at; index < at + part.text.length; index++) {
      const expected = runs.reduce<Record<string, unknown>>((style, run) => run.start <= index && index < run.end ? { ...style, ...run } : style, {})
      delete expected.start; delete expected.end
      assert.deepEqual(part.style, expected)
    }
    at += part.text.length
  }
  assert.equal(at, text.length)
})

test('ten thousand overlapping annotations remain bounded and preserve every character', () => {
  const text = '中'.repeat(20001)
  const runs = Array.from({ length: 10000 }, (_, i) => ({ start: i, end: text.length - i, bold: Boolean(i % 2), italic: Boolean(i % 3) }))
  const started = performance.now()
  const result = textSegments({ text, textRuns: runs })
  assert.equal(result.map(part => part.text).join(''), text)
  assert.ok(performance.now() - started < 3000, '10,000 overlapping annotations exceeded the regression budget')
})
