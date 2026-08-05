import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneSnapshotElements } from '../src/snapshotRestore'
import type { ScriptElement } from '../src/types'

test('scene restore remaps ids that are already used outside the restored block', () => {
  const elements: ScriptElement[] = [
    { id: 'scene', type: 'scene', text: 'INT. ROOM - DAY' },
    { id: 'moved-line', type: 'action', text: 'Restored action.', textStyle: { bold: true } },
    { id: 'moved-line', type: 'dialogue', text: 'Duplicate legacy id.' },
  ]
  const generated = ['replacement-1', 'replacement-2']
  const restored = cloneSnapshotElements(elements, ['moved-line'], () => generated.shift() ?? 'fallback')

  assert.deepEqual(restored.map((element) => element.id), ['scene', 'replacement-1', 'replacement-2'])
  assert.notEqual(restored[1].textStyle, elements[1].textStyle)
})

test('whole-project restore preserves valid unique snapshot ids', () => {
  const elements: ScriptElement[] = [
    { id: 'scene', type: 'scene', text: 'INT. ROOM - DAY' },
    { id: 'action', type: 'action', text: 'Action.' },
  ]

  assert.deepEqual(cloneSnapshotElements(elements).map((element) => element.id), ['scene', 'action'])
})
