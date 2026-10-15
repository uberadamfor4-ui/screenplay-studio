import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import mammoth from 'mammoth'
import type { ScriptElement } from '../src/types'
import { projectDataLimits } from '../src/dataLimits'
import { detectElementTypeForLine, parseImportedScript, parsePlainTextScript } from '../src/plainTextImport'

test('plain-text import preserves blank-separated action paragraphs', () => {
  const elements = parsePlainTextScript('内景 房间 - 日\n\n第一段动作。\n\n第二段动作。')

  assert.deepEqual(elements.map((element) => element.type), ['scene', 'action', 'action'])
  assert.equal(elements[1].text, '第一段动作。')
  assert.equal(elements[2].text, '第二段动作。')
})

test('plain-text import keeps consecutive dialogue lines in one dialogue block', () => {
  const elements = parsePlainTextScript('张三\n第一句台词\n第二句台词')

  assert.deepEqual(elements.map((element) => element.type), ['character', 'dialogue'])
  assert.equal(elements[1].text, '第一句台词\n第二句台词')
})

test('plain-text import merges many consecutive lines without losing text', () => {
  const lineCount = 20_000
  const elements = parsePlainTextScript(Array.from({ length: lineCount }, () => '动作发生。').join('\n'))

  assert.equal(elements.length, 1)
  assert.equal(elements[0].text.split('\n').length, lineCount)
})

test('plain-text import rejects projects that would create too many editor rows', () => {
  const content = Array.from(
    { length: projectDataLimits.maxScriptElements + 1 },
    (_, index) => `动作 ${index}\n`,
  ).join('\n')

  assert.throws(() => parsePlainTextScript(content), /超过 5000 个剧本段落/u)
})

for (const ending of ['\n', '\r\n', '\r']) {
  test(`Word-style paragraph separators retain cues and parentheticals (${JSON.stringify(ending)})`, () => {
    const source = ['内景 房间 - 夜', '', '林夏', '', '（没有回头）', '', '她来过吗？', '', '阿城', '', '没有。', '', '门关上了。'].join(ending)
    assert.deepEqual(parsePlainTextScript(source).map(e => [e.type, e.text]), [['scene', '内景 房间 - 夜'], ['character', '林夏'], ['parenthetical', '（没有回头）'], ['dialogue', '她来过吗？'], ['character', '阿城'], ['dialogue', '没有。'], ['action', '门关上了。']])
  })
}

test('Fountain force markers are recognized before removal without deleting ellipses', () => {
  const source = '.SNIPER SCOPE POV\n\n!INT. is literal action here.\n\n@McClane\n(pause)\n...not yet.\n\n> Burn to white.\n\n...the light goes out.\n\n# Next movement\n\n> THE END <'
  assert.deepEqual(parsePlainTextScript(source, { format: 'fountain' }).map(e => [e.type, e.text]), [['scene', 'SNIPER SCOPE POV'], ['action', 'INT. is literal action here.'], ['character', 'McClane'], ['parenthetical', '(pause)'], ['dialogue', '...not yet.'], ['transition', 'Burn to white.'], ['action', '...the light goes out.'], ['section', 'Next movement'], ['action', 'THE END']])
  assert.equal(detectElementTypeForLine('.5 liters'), 'action')
  assert.equal(parsePlainTextScript('...等一下。')[0].text, '...等一下。')
  assert.equal(parsePlainTextScript('林夏\n...等一下。')[0].type, 'character')
})

test('Fountain title metadata is stored separately and only parsed for Fountain files', () => {
  const source = '\uFEFFTitle:\n    末班车\nAuthor: 课程作者\nAuthors:\n    第二位作者\nDraft date: 2026-10-15\nContact:\n    example@example.test\nconstructor: ignored\n__proto__: ignored\n\n.内景 便利店 - 夜\n\n一盏灯灭了。'
  const result = parseImportedScript(source, { format: 'fountain' })
  assert.equal(result.titlePage?.title, '末班车')
  assert.equal(result.titlePage?.authors, '课程作者\n第二位作者')
  assert.equal(result.titlePage?.draftDate, '2026-10-15')
  assert.equal(result.titlePage?.contact, 'example@example.test')
  assert.deepEqual(result.elements.map(e => [e.type, e.text]), [['scene', '内景 便利店 - 夜'], ['action', '一盏灯灭了。']])
  assert.equal(parsePlainTextScript('Title: 正文说明\n\n仍是正文。')[0].text, 'Title: 正文说明')
  assert.equal(parseImportedScript('不是元数据\n\nTitle: 正文中的文字', { format: 'fountain' }).titlePage, undefined)
})

test('import preserves interior spaces and supports non-ASCII character cues', () => {
  assert.deepEqual(parsePlainTextScript('ÉLISE\n\nAttends...   encore.').map(e => [e.type, e.text]), [['character', 'ÉLISE'], ['dialogue', 'Attends...   encore.']])
  assert.deepEqual(parsePlainTextScript('민수\n(작게)\n괜찮아요.').map(e => e.type), ['character', 'parenthetical', 'dialogue'])
  assert.deepEqual(parsePlainTextScript('タロウ\n（小声で）\nまだです。').map(e => e.type), ['character', 'parenthetical', 'dialogue'])
})

test('subtitle boundaries and explicit action never extend a previous speech', () => {
  assert.deepEqual(parsePlainTextScript('1\n00:00:01,000 --> 00:00:02,000\n你好。\n\n2\n00:00:02,100 --> 00:00:03,000\n再见。').map(e => e.text), ['你好。', '再见。'])
  assert.deepEqual(parsePlainTextScript('@林夏\n\n!她没有开口。\n\n门关上了。').map(e => e.type), ['character', 'action', 'action'])
})

test('title metadata limits and long whitespace remain bounded', () => {
  assert.throws(() => parseImportedScript('Title: '+ 'x'.repeat(projectDataLimits.maxMetadataTextCharacters + 1), { format: 'fountain' }), /标题页文字过多/u)
  const elements = parsePlainTextScript('内景 房间 - 夜\n' + '\n'.repeat(20_000) + '最后一盏灯灭了。')
  assert.equal(elements.length, 2)
  assert.equal(elements[1].text, '最后一盏灯灭了。')
})

for (const extension of ['txt', 'fountain', 'docx']) {
  test(`real course ${extension} import preserves every body type and paragraph`, async () => {
    const base = new URL('./fixtures/document-import/', import.meta.url)
    const expected = JSON.parse(readFileSync(new URL('last-bus-final.ssproj', base), 'utf8')).elements.map((e: ScriptElement) => [e.type, e.text])
    const name = extension === 'fountain' ? 'last-bus.fountain' : 'last-bus-import.' + extension
    const content = extension === 'docx' ? (await mammoth.extractRawText({ path: fileURLToPath(new URL(name, base)) })).value : readFileSync(new URL(name, base), 'utf8')
    const result = parseImportedScript(content, { format: extension === 'fountain' ? 'fountain' : 'text' })
    assert.deepEqual(result.elements.map(e => [e.type, e.text]), expected)
    if (extension === 'fountain') assert.equal(result.titlePage?.title, '末班车')
  })
}
