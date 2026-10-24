import type { ScriptElement, ScriptProject } from './types'

export type CompositionHistory = {
  elementId: string
  before: ScriptProject
  undo: ScriptProject[]
  redo: ScriptProject[]
}

export function beginCompositionHistory(before: ScriptProject, elementId: string, undo: ScriptProject[], redo: ScriptProject[]): CompositionHistory {
  return { elementId, before, undo: [...undo], redo: [...redo] }
}

export function resolveCompositionHistory(transaction: CompositionHistory, next: ScriptProject) {
  const before = transaction.before
  const projectKeys = new Set([...Object.keys(before), ...Object.keys(next)] as Array<keyof ScriptProject>)
  if ([...projectKeys].some(key => key !== 'elements' && !Object.is(before[key], next[key]))) return
  if (before.elements.length !== next.elements.length) return
  let unchanged = true, found = false
  for (let i = 0; i < before.elements.length; i++) {
    const original = before.elements[i], current = next.elements[i]
    if (original.id !== current.id) return
    const composing = original.id === transaction.elementId
    found ||= composing
    if (original === current) continue
    const keys = new Set([...Object.keys(original), ...Object.keys(current)] as Array<keyof ScriptElement>)
    for (const key of keys) {
      if (Object.is(original[key], current[key])) continue
      if (key === 'textRuns' && JSON.stringify(original.textRuns) === JSON.stringify(current.textRuns)) continue
      if (!composing || key !== 'text' && key !== 'type' && key !== 'textRuns') return
      unchanged = false
    }
  }
  if (!found) return
  return unchanged
    ? { undo: transaction.undo, redo: transaction.redo }
    : { undo: [...transaction.undo, before].slice(-100), redo: [] as ScriptProject[] }
}
