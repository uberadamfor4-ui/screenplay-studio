import { projectDataLimits } from './dataLimits'
import type { ScriptElement } from './types'

export type ReplacementPair = {
  from: string
  to: string
}

export const replacementLimits = Object.freeze({
  maxPairs: 500,
  maxTermCharacters: 10_000,
  maxScannedCharacters: 25_000_000,
})

export function parseReplacementPairs(source: string): ReplacementPair[] {
  const pairs = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s*(?:=>|->|=|,|，)\s*/u)
      return { from: parts[0]?.trim() ?? '', to: parts.slice(1).join('=').trim() }
    })
    .filter((pair) => pair.from.length > 0)

  if (pairs.length > replacementLimits.maxPairs) {
    throw new Error(`一次最多执行 ${replacementLimits.maxPairs} 组替换，请分批处理。`)
  }
  if (pairs.some((pair) => pair.from.length > replacementLimits.maxTermCharacters || pair.to.length > replacementLimits.maxTermCharacters)) {
    throw new Error(`单个查找或替换文本不能超过 ${replacementLimits.maxTermCharacters} 个字符。`)
  }
  return pairs
}

export function replaceElementsBounded(
  elements: ScriptElement[],
  pairs: ReplacementPair[],
  maxElementCharacters = projectDataLimits.maxElementTextCharacters,
  maxScannedCharacters = replacementLimits.maxScannedCharacters,
) {
  if (pairs.length > replacementLimits.maxPairs) {
    throw new Error(`一次最多执行 ${replacementLimits.maxPairs} 组替换，请分批处理。`)
  }

  let count = 0
  let scannedCharacters = 0
  const nextElements = elements.map((element) => {
    let text = element.text
    for (const pair of pairs) {
      if (!pair.from || pair.from === pair.to) continue
      scannedCharacters += text.length
      if (!Number.isSafeInteger(scannedCharacters) || scannedCharacters > maxScannedCharacters) {
        throw new Error('本次替换需要扫描的文字过多，已停止执行以避免软件卡顿；请减少规则或分批处理。')
      }
      const result = replaceLiteralBounded(text, pair.from, pair.to, maxElementCharacters)
      text = result.text
      count += result.count
    }
    return text === element.text ? element : { ...element, text }
  })

  return { elements: nextElements, count }
}

function replaceLiteralBounded(value: string, from: string, to: string, maxCharacters: number) {
  if (!from || from === to) {
    return { text: value, count: 0 }
  }
  if (from.length > replacementLimits.maxTermCharacters || to.length > replacementLimits.maxTermCharacters) {
    throw new Error(`单个查找或替换文本不能超过 ${replacementLimits.maxTermCharacters} 个字符。`)
  }

  let count = 0
  let cursor = 0
  while (cursor <= value.length - from.length) {
    const match = value.indexOf(from, cursor)
    if (match < 0) break
    count += 1
    cursor = match + from.length
  }
  if (count === 0) return { text: value, count: 0 }

  const predictedLength = value.length + count * (to.length - from.length)
  if (!Number.isSafeInteger(predictedLength) || predictedLength > maxCharacters) {
    throw new Error('替换结果会让单个段落超过 25 万字符，已停止执行；请缩短替换文字或分段处理。')
  }
  return { text: value.split(from).join(to), count }
}
