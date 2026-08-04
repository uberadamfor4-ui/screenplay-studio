import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { isNativePrintShortcut } = require('../electron/inputGuards.cjs') as {
  isNativePrintShortcut: (input: Record<string, unknown>, platform?: NodeJS.Platform) => boolean
}

test('native print guard blocks only the unassigned platform print shortcut', () => {
  assert.equal(isNativePrintShortcut({ type: 'keyDown', key: 'p', control: true }, 'win32'), true)
  assert.equal(isNativePrintShortcut({ type: 'keyDown', key: 'P', meta: true }, 'darwin'), true)
  assert.equal(isNativePrintShortcut({ type: 'keyDown', key: 'p', control: true, shift: true }, 'win32'), false)
  assert.equal(isNativePrintShortcut({ type: 'keyDown', key: 'p', meta: true, shift: true }, 'darwin'), false)
  assert.equal(isNativePrintShortcut({ type: 'keyDown', key: 'p' }, 'win32'), false)
  assert.equal(isNativePrintShortcut({ type: 'keyDown', key: 'p', control: true }, 'darwin'), false)
  assert.equal(isNativePrintShortcut({ type: 'keyUp', key: 'p', control: true }, 'win32'), false)
})
