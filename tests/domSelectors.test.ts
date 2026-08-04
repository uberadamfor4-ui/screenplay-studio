import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDataElementSelector, escapeCssAttributeValue } from '../src/domSelectors'

test('editor selectors safely encode imported ids with quotes and controls', () => {
  assert.equal(escapeCssAttributeValue('scene"one\\two\nnext'), 'scene\\"one\\\\two\\a next')
  assert.equal(
    buildDataElementSelector('textarea', 'scene"] textarea, button[data-x="'),
    'textarea[data-element-id="scene\\"] textarea, button[data-x=\\""]',
  )
})

test('editor selectors replace null characters without creating invalid CSS', () => {
  assert.equal(buildDataElementSelector('article', 'scene\u0000one'), 'article[data-element-id="scene\ufffdone"]')
})
