import assert from 'node:assert/strict'
import test from 'node:test'
import { projectDataLimits } from '../src/dataLimits'
import { parsePlainTextScript } from '../src/plainTextImport'

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
