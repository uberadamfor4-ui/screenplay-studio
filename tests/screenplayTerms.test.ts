import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSceneHeading, convertSceneHeading, parseSceneHeading } from '../src/screenplayTerms'

test('scene term conversion preserves inline production scene numbers', () => {
  assert.equal(convertSceneHeading('12A. INT. KITCHEN - NIGHT', 'zh-CN'), '12A. 内景 KITCHEN - 夜')
  assert.equal(convertSceneHeading('A1 EXT. STREET - DAY', 'zh-TW'), 'A1 外景 STREET - 日')
})

test('editing parsed scene terms does not fold the scene number into the location', () => {
  const parsed = parseSceneHeading('12A. 内景 厨房 - 夜')
  assert.equal(parsed.location, '厨房')
  assert.equal(parsed.sceneNumberPrefix, '12A.')
  assert.equal(buildSceneHeading({ ...parsed, style: 'en-US', place: 'ext' }), '12A. EXT. 厨房 - NIGHT')
})
