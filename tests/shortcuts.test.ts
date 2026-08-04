import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSafeShortcutBinding,
  sanitizeShortcutDefinition,
  shouldHandleGlobalShortcut,
  type ShortcutDefinition,
} from '../src/shortcuts'

test('print and export actions cannot be bound to normal typing keys', () => {
  assert.equal(isSafeShortcutBinding('exportPdf', { id: 'exportPdf', key: 'p' }), false)
  assert.equal(isSafeShortcutBinding('exportPdf', { id: 'exportPdf', key: 'P', shift: true }), false)
  assert.equal(isSafeShortcutBinding('exportPdf', { id: 'exportPdf', key: 'p', ctrlOrMeta: true, shift: true }), true)
  assert.equal(isSafeShortcutBinding('cycleElementType', { id: 'cycleElementType', key: 'Tab' }), true)
  assert.equal(isSafeShortcutBinding('moveParagraphUp', { id: 'moveParagraphUp', key: 'ArrowUp', alt: true }), true)
})

test('persisted shortcut definitions are normalized and unsafe legacy values are discarded', () => {
  assert.equal(sanitizeShortcutDefinition('exportPdf', { id: 'exportPdf', key: 'p' }), undefined)
  assert.deepEqual(
    sanitizeShortcutDefinition('exportPdf', { id: 'wrong-id', key: 'P', ctrlOrMeta: true, shift: true }),
    { id: 'exportPdf', key: 'P', ctrlOrMeta: true, shift: true, alt: false },
  )
  assert.equal(sanitizeShortcutDefinition('exportPdf', { key: 'Process', ctrlOrMeta: true }), undefined)
})

test('global shortcut handling respects prevented and composing editor events', () => {
  const shortcut: ShortcutDefinition = { id: 'exportPdf', key: 'p', ctrlOrMeta: true, shift: true }
  assert.equal(shouldHandleGlobalShortcut({ defaultPrevented: true } as KeyboardEvent, shortcut), false)
  assert.equal(shouldHandleGlobalShortcut({ defaultPrevented: false, isComposing: true } as KeyboardEvent, shortcut), false)
  assert.equal(shouldHandleGlobalShortcut({ defaultPrevented: false, isComposing: false, keyCode: 229, target: null } as unknown as KeyboardEvent, shortcut), false)
  assert.equal(shouldHandleGlobalShortcut({ defaultPrevented: false, isComposing: false, keyCode: 80, target: null } as unknown as KeyboardEvent, shortcut), true)
})
