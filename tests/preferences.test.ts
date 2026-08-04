import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePreferences } from '../src/preferences'

test('stored preferences cannot inject an unbounded or malformed font family', () => {
  const preferences = normalizePreferences({
    defaultFontFamily: `  测试\u0000  字体  ${'x'.repeat(300)}  `,
  })

  assert.equal(preferences.defaultFontFamily.includes('\u0000'), false)
  assert.equal(preferences.defaultFontFamily.includes('  '), false)
  assert.equal(preferences.defaultFontFamily.length, 128)
})
