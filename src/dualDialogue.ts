import type { ScriptElement } from './types'

export function getValidDualDialogueGroupIds(elements: ScriptElement[]) {
  const groups = new Map<string, Array<{ element: ScriptElement; index: number }>>()
  elements.forEach((element, index) => {
    const groupId = element.dualDialogue?.groupId
    if (!groupId) return
    const group = groups.get(groupId) ?? []
    group.push({ element, index })
    groups.set(groupId, group)
  })

  const valid = new Set<string>()
  groups.forEach((items, groupId) => {
    const contiguous = items.every((item, index) => index === 0 || item.index === items[index - 1].index + 1)
    const left = items.filter((item) => item.element.dualDialogue?.side === 'left').map((item) => item.element)
    const right = items.filter((item) => item.element.dualDialogue?.side === 'right').map((item) => item.element)
    if (contiguous && isDialogueSide(left) && isDialogueSide(right)) valid.add(groupId)
  })
  return valid
}

function isDialogueSide(elements: ScriptElement[]) {
  return elements.some((element) => element.type === 'character')
    && elements.some((element) => element.type === 'dialogue')
}
