import { stripSceneNumber } from './plainTextImport'
import type { ScriptElement } from './types'

export function assignSequentialSceneNumbers(elements: ScriptElement[]) {
  let count = 0
  const nextElements = elements.map((element) => {
    if (element.type !== 'scene') return element
    count += 1
    return {
      ...element,
      text: stripSceneNumber(element.text),
      sceneNumber: String(count),
    }
  })
  return { elements: nextElements, count }
}

export function removeSceneNumbers(elements: ScriptElement[]) {
  let count = 0
  const nextElements = elements.map((element) => {
    if (element.type !== 'scene') return element
    count += 1
    const next = {
      ...element,
      text: stripSceneNumber(element.text),
    }
    delete next.sceneNumber
    return next
  })
  return { elements: nextElements, count }
}
