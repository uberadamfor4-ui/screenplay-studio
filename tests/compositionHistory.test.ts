import assert from 'node:assert/strict'
import test from 'node:test'
import { beginCompositionHistory, resolveCompositionHistory } from '../src/compositionHistory'
import { createDefaultProject } from '../src/sample'
import type { ScriptProject } from '../src/types'

const project = (): ScriptProject => ({ ...createDefaultProject(), elements: [{ id: 'ime', type: 'action', text: '原稿' }, { id: 'other', type: 'action', text: '保留其他段落' }] })
const edited = (before: ScriptProject, text: string): ScriptProject => ({ ...before, elements: before.elements.map(element => element.id === 'ime' ? { ...element, text } : element) })

test('one IME composition keeps the pre-composition draft as its only undo step', () => {
  const before = project(), oldUndo = project(), oldRedo = project()
  const transaction = beginCompositionHistory(before, 'ime', [oldUndo], [oldRedo])
  for (const text of ['n', 'ni', 'ni hao', '你好……']) {
    const result = resolveCompositionHistory(transaction, edited(before, text))!
    assert.deepEqual(result.undo, [oldUndo, before]); assert.deepEqual(result.redo, [])
  }
  assert.deepEqual(transaction.undo, [oldUndo]); assert.deepEqual(transaction.redo, [oldRedo])
})

test('canceling composition restores both history directions rather than consuming redo', () => {
  const before = project(), previous = project(), redo = project(), transaction = beginCompositionHistory(before, 'ime', [previous], [redo])
  const result = resolveCompositionHistory(transaction, edited(before, '原稿'))!
  assert.deepEqual(result.undo, [previous]); assert.deepEqual(result.redo, [redo])
})

test('a final smart paragraph-type detection stays in the same composition undo step', () => {
  const before = project(), next = edited(before, '内景 车站 - 夜')
  next.elements[0] = { ...next.elements[0], type: 'scene' }
  assert.deepEqual(resolveCompositionHistory(beginCompositionHistory(before, 'ime', [], []), next)!.undo, [before])
})

test('structural and independent formatting changes cannot be swallowed into composition', () => {
  const before = project(), transaction = beginCompositionHistory(before, 'ime', [], [])
  for (const next of [
    { ...before, title: '新标题' },
    { ...before, fontSize: before.fontSize + 1 },
    { ...before, elements: [...before.elements].reverse() },
    { ...before, elements: before.elements.slice(1) },
    { ...before, elements: before.elements.map(element => element.id === 'other' ? { ...element, text: '另一段的修改' } : element) },
    { ...before, elements: before.elements.map(element => element.id === 'ime' ? { ...element, textStyle: { bold: true } } : element) },
  ]) assert.equal(resolveCompositionHistory(transaction, next), undefined)
})

test('composition history remains bounded and captures arrays independently', () => {
  const before = project(), undo = Array.from({ length: 100 }, project), transaction = beginCompositionHistory(before, 'ime', undo, [])
  undo.pop()
  const result = resolveCompositionHistory(transaction, edited(before, '中文 😀'))!
  assert.equal(transaction.undo.length, 100); assert.equal(result.undo.length, 100); assert.equal(result.undo.at(-1), before)
})
