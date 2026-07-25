import assert from 'node:assert/strict'
import test from 'node:test'
import { assignSequentialSceneNumbers, removeSceneNumbers } from '../src/sceneNumbers'
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
