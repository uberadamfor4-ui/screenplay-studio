import assert from 'node:assert/strict'
import test from 'node:test'
import { limitElementText, projectDataLimits } from '../src/dataLimits'

test('live editor input is bounded without splitting a surrogate pair', () => {
  const prefix = 'a'.repeat(projectDataLimits.maxElementTextCharacters - 1)
  const result = limitElementText(`${prefix}🎬tail`)

  assert.equal(result.truncated, true)
  assert.equal(result.text, prefix)
  assert.equal(result.text.includes('\uFFFD'), false)
})
