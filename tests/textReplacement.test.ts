import assert from 'node:assert/strict'
import test from 'node:test'
import { parseReplacementPairs, replaceElementsBounded, replacementLimits } from '../src/textReplacement'
import type { ScriptElement } from '../src/types'

const elements: ScriptElement[] = [
  { id: 'one', type: 'action', text: '灰色的天。灰色的海。' },
  { id: 'two', type: 'dialogue', text: '别走。' },
]

test('bounded replacement preserves ordinary multi-rule cleanup behavior', () => {
  const pairs = parseReplacementPairs('灰色=铅灰\n别走=>留下')
  const result = replaceElementsBounded(elements, pairs)
  assert.equal(result.count, 3)
  assert.deepEqual(result.elements.map((element) => element.text), ['铅灰的天。铅灰的海。', '留下。'])
})

test('bounded replacement rejects expansion before allocating an oversized paragraph', () => {
  assert.throws(
    () => replaceElementsBounded(
      [{ id: 'one', type: 'action', text: 'a'.repeat(100) }],
      [{ from: 'a', to: '0123456789' }],
      500,
    ),
    /超过 25 万字符/u,
  )
})

test('replacement tables reject excessive rule and term counts', () => {
  assert.throws(
    () => parseReplacementPairs(Array.from({ length: replacementLimits.maxPairs + 1 }, (_, index) => `a${index}=b`).join('\n')),
    /最多执行/u,
  )
  assert.throws(
    () => replaceElementsBounded(elements, [{ from: '灰色', to: 'x'.repeat(replacementLimits.maxTermCharacters + 1) }]),
    /不能超过/u,
  )
})

test('replacement work is stopped before a large rule table can freeze the editor', () => {
  assert.throws(
    () => replaceElementsBounded(
      [{ id: 'one', type: 'action', text: 'a'.repeat(100) }],
      [{ from: 'x', to: 'y' }, { from: 'z', to: 'q' }],
      replacementLimits.maxTermCharacters,
      150,
    ),
    /避免软件卡顿/u,
  )
})
