import assert from 'node:assert/strict'
import test from 'node:test'
import { getValidDualDialogueGroupIds } from '../src/dualDialogue'
import type { ScriptElement } from '../src/types'

function dualElement(id: string, type: ScriptElement['type'], side: 'left' | 'right', text: string): ScriptElement {
  return { id, type, text, dualDialogue: { groupId: 'dual', side } }
}

test('dual dialogue requires two complete contiguous dialogue blocks', () => {
  const valid = [
    dualElement('left-cue', 'character', 'left', '甲'),
    dualElement('left-line', 'dialogue', 'left', '左。'),
    dualElement('right-cue', 'character', 'right', '乙'),
    dualElement('right-line', 'dialogue', 'right', '右。'),
  ]
  assert.deepEqual([...getValidDualDialogueGroupIds(valid)], ['dual'])

  const interrupted = [...valid.slice(0, 2), { id: 'action', type: 'action', text: '动作。' } as ScriptElement, ...valid.slice(2)]
  assert.deepEqual([...getValidDualDialogueGroupIds(interrupted)], [])

  const missingCue = valid.filter((element) => element.id !== 'right-cue')
  assert.deepEqual([...getValidDualDialogueGroupIds(missingCue)], [])
})
