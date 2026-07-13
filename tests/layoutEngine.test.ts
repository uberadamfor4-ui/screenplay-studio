import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultExportSettings } from '../src/exportProfiles'
import { getFormat } from '../src/formats'
import { createFallbackTextMeasurer, layoutScreenplay, wrapMeasuredText } from '../src/layoutEngine'
import type { AppLocale, ScriptElement, ScriptProject } from '../src/types'

const format = getFormat('hollywood')

test('CJK line breaking does not strand closing punctuation or opening brackets', () => {
  const measure = (value: string) => Array.from(value).length * 10
  const closing = wrapMeasuredText('中中中中，中', 40, measure, 'zh-CN')
  const closingOnly = wrapMeasuredText('中中中中，', 40, measure, 'zh-CN')
  const opening = wrapMeasuredText('中中中（后', 40, measure, 'zh-CN')
  assert.equal(closing.some((line) => /^[，。！？；：、]/u.test(line)), false)
  assert.equal(closingOnly.some((line) => /^[，。！？；：、]/u.test(line)), false)
  assert.equal(opening.some((line) => /[（《【「『]$/u.test(line)), false)
})

test('long paragraphs are split without losing CJK text', () => {
  const text = '长'.repeat(2800)
  const result = layoutScreenplay(createProject('zh-CN', [{ id: 'long', type: 'action', text }]), format)
  const restored = result.pages.flatMap((page) => page.blocks).filter((block) => block.sourceId === 'long').flatMap((block) => block.lines).join('')
  assert.equal(result.pages.length > 1, true)
  assert.equal(restored, text)
})

test('dialogue page breaks add localized MORE and continued character cues', () => {
  const project = createProject('zh-CN', [
    { id: 'cue', type: 'character', text: '林夏' },
    { id: 'speech', type: 'dialogue', text: '我们必须在天亮以前离开这里。'.repeat(280) },
  ])
  const result = layoutScreenplay(project, format)
  const synthetic = result.pages.flatMap((page) => page.blocks).filter((block) => block.synthetic)
  assert.equal(synthetic.some((block) => block.type === 'more' && block.text === '（续）'), true)
  assert.equal(synthetic.some((block) => block.type === 'continued-character' && block.text === '林夏（续）'), true)
})

test('dual dialogue occupies independent left and right columns', () => {
  const groupId = 'dual-1'
  const project = createProject('en-US', [
    dual({ id: 'left-cue', type: 'character', text: 'MAYA' }, groupId, 'left'),
    dual({ id: 'left-line', type: 'dialogue', text: 'Do not open that door.' }, groupId, 'left'),
    dual({ id: 'right-cue', type: 'character', text: 'NOAH' }, groupId, 'right'),
    dual({ id: 'right-line', type: 'dialogue', text: 'I already did.' }, groupId, 'right'),
  ])
  const blocks = layoutScreenplay(project, format).pages[0].blocks
  const left = blocks.filter((block) => block.dualSide === 'left')
  const right = blocks.filter((block) => block.dualSide === 'right')
  assert.equal(left.length, 2)
  assert.equal(right.length, 2)
  assert.equal(Math.max(...left.map((block) => block.x)) < Math.min(...right.map((block) => block.x)), true)
})

test('locked production pages receive stable A/B suffixes', () => {
  const elements = Array.from({ length: 70 }, (_, index): ScriptElement => ({ id: `action-${index}`, type: 'action', text: `Line ${index}` }))
  const project = createProject('en-US', elements)
  project.productionLock = { enabled: true, pages: 1, scenes: 0, lockedAt: '2026-01-01T00:00:00.000Z' }
  project.exportSettings = { ...defaultExportSettings, profileId: 'us-production', lockedPageLabels: true }
  const result = layoutScreenplay(project, format)
  assert.deepEqual(result.pages.map((page) => page.label), ['1', '1A', '1B'])
})

test('scene numbers remain in side markers without duplicating inside headings', () => {
  const project = createProject('zh-CN', [{ id: 'scene', type: 'scene', text: '12A. 内景 公寓 - 夜' }])
  project.exportSettings = { ...defaultExportSettings, includeTitlePage: false, showSceneNumbers: true }
  const scene = layoutScreenplay(project, format).pages[0].blocks[0]
  assert.equal(scene.sceneNumber, '12A')
  assert.equal(scene.lines.join(''), '内景 公寓 - 夜')
})

test('scene headings and character cues are kept with following content', () => {
  const leadIn = Array.from({ length: 26 }, (_, index): ScriptElement => ({ id: `lead-${index}`, type: 'action', text: `Line ${index}` }))
  const sceneProject = createProject('en-US', [...leadIn, { id: 'scene', type: 'scene', text: 'INT. ROOM - NIGHT' }, { id: 'scene-action', type: 'action', text: 'A lamp clicks on.' }])
  const sceneLayout = layoutScreenplay(sceneProject, format)
  assert.notEqual(sceneLayout.pages[0].blocks.at(-1)?.sourceType, 'scene')

  const cueProject = createProject('en-US', [...leadIn, { id: 'cue', type: 'character', text: 'MAYA' }, { id: 'dialogue', type: 'dialogue', text: 'Two lines should remain with this cue when a page turns. '.repeat(3) }])
  const cueLayout = layoutScreenplay(cueProject, format)
  assert.notEqual(cueLayout.pages[0].blocks.at(-1)?.sourceType, 'character')
})

test('multilingual layout golden summaries remain stable', () => {
  const snapshots = (['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR'] as AppLocale[]).map((locale) => summarizeGolden(locale))
  const expected = GOLDEN_SUMMARIES
  if (process.env.SCREENPLAY_UPDATE_GOLDEN === '1') {
    console.log(JSON.stringify(snapshots, null, 2))
    return
  }
  assert.deepEqual(snapshots, expected)
})

function summarizeGolden(locale: AppLocale) {
  const sample = locale === 'en-US' ? 'A train crosses the empty platform before sunrise. ' : locale === 'ja-JP' ? '始発列車が夜明け前の静かなホームを通過する。' : locale === 'ko-KR' ? '첫차가 해 뜨기 전 조용한 승강장을 지나간다. ' : locale === 'zh-TW' ? '首班列車在黎明前穿過安靜的月臺。' : '首班列车在黎明前穿过安静的站台。'
  const elements = Array.from({ length: 24 }, (_, index): ScriptElement => ({ id: `${locale}-${index}`, type: 'action', text: sample.repeat(3) }))
  const result = layoutScreenplay(createProject(locale, elements), format, createFallbackTextMeasurer(12))
  return {
    locale,
    pages: result.pages.length,
    labels: result.pages.map((page) => page.label),
    blocks: result.pages.map((page) => page.blocks.length),
    lines: result.pages.map((page) => page.blocks.reduce((sum, block) => sum + block.lines.length, 0)),
    first: result.pages.map((page) => page.blocks[0]?.lines[0] ?? ''),
    last: result.pages.map((page) => page.blocks.at(-1)?.lines.at(-1) ?? ''),
  }
}

function createProject(locale: AppLocale, elements: ScriptElement[]): ScriptProject {
  return {
    appVersion: '0.4.0',
    title: 'Golden',
    author: 'Test',
    language: locale,
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    exportSettings: { ...defaultExportSettings, includeTitlePage: false },
    elements,
  }
}

function dual(element: ScriptElement, groupId: string, side: 'left' | 'right'): ScriptElement {
  return { ...element, dualDialogue: { groupId, side } }
}

const GOLDEN_SUMMARIES: ReturnType<typeof summarizeGolden>[] = [
  {
    locale: 'en-US', pages: 2, labels: ['1', '2'], blocks: [14, 11], lines: [41, 31],
    first: ['A train crosses the empty platform before sunrise. A train', 'the empty platform before sunrise.'],
    last: ['crosses the empty platform before sunrise. A train crosses', 'the empty platform before sunrise.'],
  },
  {
    locale: 'zh-CN', pages: 2, labels: ['1', '2'], blocks: [18, 6], lines: [36, 12],
    first: ['首班列车在黎明前穿过安静的站台。首班列车在黎明前穿过安静的站台。首班列车', '首班列车在黎明前穿过安静的站台。首班列车在黎明前穿过安静的站台。首班列车'],
    last: ['在黎明前穿过安静的站台。', '在黎明前穿过安静的站台。'],
  },
  {
    locale: 'zh-TW', pages: 2, labels: ['1', '2'], blocks: [18, 6], lines: [36, 12],
    first: ['首班列車在黎明前穿過安靜的月臺。首班列車在黎明前穿過安靜的月臺。首班列車', '首班列車在黎明前穿過安靜的月臺。首班列車在黎明前穿過安靜的月臺。首班列車'],
    last: ['在黎明前穿過安靜的月臺。', '在黎明前穿過安靜的月臺。'],
  },
  {
    locale: 'ja-JP', pages: 2, labels: ['1', '2'], blocks: [18, 6], lines: [36, 12],
    first: ['始発列車が夜明け前の静かなホームを通過する。始発列車が夜明け前の静かな', '始発列車が夜明け前の静かなホームを通過する。始発列車が夜明け前の静かな'],
    last: ['ホームを通過する。始発列車が夜明け前の静かなホームを通過する。', 'ホームを通過する。始発列車が夜明け前の静かなホームを通過する。'],
  },
  {
    locale: 'ko-KR', pages: 2, labels: ['1', '2'], blocks: [18, 6], lines: [36, 12],
    first: ['첫차가 해 뜨기 전 조용한 승강장을 지나간다. 첫차가 해 뜨기 전 조용한', '첫차가 해 뜨기 전 조용한 승강장을 지나간다. 첫차가 해 뜨기 전 조용한'],
    last: ['승강장을 지나간다. 첫차가 해 뜨기 전 조용한 승강장을 지나간다.', '승강장을 지나간다. 첫차가 해 뜨기 전 조용한 승강장을 지나간다.'],
  },
]
