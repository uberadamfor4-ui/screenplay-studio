import type { ScriptElement } from './types'

export function cloneSnapshotElements(
  elements: ScriptElement[],
  reservedIds: Iterable<string> = [],
  createId: () => string = createSnapshotRestoreId,
) {
  const usedIds = new Set(reservedIds)
  return elements.map((element) => {
    let id = element.id
    while (!id || usedIds.has(id)) id = createId()
    usedIds.add(id)
    return {
      ...element,
      id,
      textStyle: element.textStyle ? { ...element.textStyle } : undefined,
      dualDialogue: element.dualDialogue ? { ...element.dualDialogue } : undefined,
    }
  })
}

function createSnapshotRestoreId() {
  return globalThis.crypto?.randomUUID?.() ?? `restored-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
