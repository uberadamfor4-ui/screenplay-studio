import assert from 'node:assert/strict'
import test from 'node:test'
import { assignSequentialSceneNumbers, nextSceneSuffix, parseSceneNumber, removeSceneNumbers } from '../src/sceneNumbers'
import type { ScriptElement } from '../src/types'

const importedElements: ScriptElement[] = [
  { id: 'scene-a', type: 'scene', text: '12A. 内景 公寓 - 夜', sceneNumber: '12A' },
  { id: 'action-a', type: 'action', text: '雨打在窗上。' },
  { id: 'scene-b', type: 'scene', text: 'EXT. STREET - DAY', sceneNumber: '18' },
]

test('scene renumbering replaces imported FDX metadata without duplicating the heading', () => {
  const result = assignSequentialSceneNumbers(importedElements)
  assert.equal(result.count, 2)
  assert.equal(result.elements[0].text, '内景 公寓 - 夜')
  assert.equal(result.elements[0].sceneNumber, '1')
  assert.equal(result.elements[2].sceneNumber, '2')
})

test('clearing scene numbers removes both inline prefixes and FDX metadata', () => {
  const result = removeSceneNumbers(importedElements)
  assert.equal(result.count, 2)
  assert.equal(result.elements[0].text, '内景 公寓 - 夜')
  assert.equal(result.elements[0].sceneNumber, undefined)
  assert.equal(result.elements[2].sceneNumber, undefined)
})

test('scene number parsing supports before-first and multi-letter suffixes', () => {
  assert.deepEqual(parseSceneNumber('A1'), { base: 1, prefix: 'A', suffix: '', value: 'A1' })
  assert.deepEqual(parseSceneNumber('12AA. 内景 房间 - 日'), { base: 12, prefix: '', suffix: 'AA', value: '12AA' })
  assert.equal(nextSceneSuffix(Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))), 'AA')
  assert.equal(nextSceneSuffix(['A', 'B', 'AA']), 'C')
})

test('scene suffix generation remains unique across large insertion runs', () => {
  const suffixes: string[] = []
  for (let index = 0; index < 200; index += 1) {
    const suffix = nextSceneSuffix(suffixes)
    assert.equal(suffixes.includes(suffix), false)
    suffixes.push(suffix)
    assert.equal(parseSceneNumber(`7${suffix}`)?.suffix, suffix)
  }
  assert.equal(suffixes[25], 'Z')
  assert.equal(suffixes[26], 'AA')
  assert.equal(suffixes[199], 'GR')
})
