import { stripSceneNumber } from './plainTextImport'
import type { ScriptElement, ScriptProject } from './types'

export type ParsedSceneNumber = {
  base: number
  prefix: string
  suffix: string
  value: string
}

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

export function parseSceneNumber(value: string): ParsedSceneNumber | undefined {
  const match = value.trim().match(/^(?:#\s*)?([A-Z]*)(\d+)([A-Z]*)(?:\s*#)?(?:[.．、)]|\s*$)/iu)
  if (!match) return undefined
  const prefix = (match[1] ?? '').toUpperCase()
  const suffix = (match[3] ?? '').toUpperCase()
  const base = Number(match[2])
  return { base, prefix, suffix, value: `${prefix}${base}${suffix}` }
}

export function nextSceneSuffix(usedSuffixes: string[]) {
  const used = new Set(usedSuffixes.map((suffix) => suffix.toUpperCase()).filter(Boolean))
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = toAlphabeticSuffix(index)
    if (!used.has(suffix)) return suffix
  }
  throw new Error('无法生成新的场次后缀。')
}

export function buildLockedSceneNumber(project: ScriptProject, referenceId: string, position: 'before' | 'after') {
  const referenceIndex = project.elements.findIndex(element => element.id === referenceId)
  const insertAt = referenceIndex < 0 ? project.elements.length : referenceIndex + (position === 'after' ? 1 : 0)
  const scenes = project.elements.filter(element => element.type === 'scene')
  const readNumber = (element: ScriptElement | undefined) => element
    ? parseSceneNumber(element.sceneNumber ?? project.productionLock?.sceneNumbers?.[element.id] ?? element.text)
    : undefined
  const previousScene = [...project.elements.slice(0, insertAt)].reverse().find(element => element.type === 'scene')
  const nextScene = project.elements.slice(insertAt).find(element => element.type === 'scene')
  const previousNumber = readNumber(previousScene)
  const nextNumber = readNumber(nextScene)
  if (!previousNumber) {
    const base = nextNumber?.base ?? 1
    const used = scenes.map(readNumber).filter(number => number?.base === base && number.prefix).map(number => number?.prefix ?? '')
    return `${nextSceneSuffix(used)}${base}`
  }
  const base = previousNumber.base
  const used = scenes.map(readNumber).filter(number => number?.base === base && !number.prefix).map(number => number?.suffix ?? '')
  return `${base}${nextSceneSuffix(used)}`
}

function toAlphabeticSuffix(value: number) {
  let result = ''
  let current = Math.max(1, value)
  while (current > 0) {
    current -= 1
    result = String.fromCharCode(65 + (current % 26)) + result
    current = Math.floor(current / 26)
  }
  return result
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
