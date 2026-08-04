import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { installInputGuards, isNativePrintShortcut } = require('../electron/inputGuards.cjs') as {
  installInputGuards: (browserWindow: {
    webContents: {
      on: (name: string, handler: (event: { preventDefault: () => void }, input: Record<string, unknown>) => void) => void
      send: (channel: string, command: string) => void
    }
  }) => void
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

test('held native print shortcut is blocked without repeatedly stealing editor focus', () => {
  let handler: ((event: { preventDefault: () => void }, input: Record<string, unknown>) => void) | undefined
  let prevented = 0
  const commands: string[] = []
  installInputGuards({
    webContents: {
      on: (_name, nextHandler) => {
        handler = nextHandler
      },
      send: (_channel, command) => {
        commands.push(command)
      },
    },
  })

  handler?.({ preventDefault: () => { prevented += 1 } }, { type: 'keyDown', key: 'p', control: true })
  handler?.({ preventDefault: () => { prevented += 1 } }, { type: 'keyDown', key: 'p', control: true, isAutoRepeat: true })

  assert.equal(prevented, 2)
  assert.deepEqual(commands, ['restoreEditorFocus'])
})
