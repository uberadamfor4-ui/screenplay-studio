import { stripSceneNumber } from './plainTextImport'
import type { ScriptElement } from './types'

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
