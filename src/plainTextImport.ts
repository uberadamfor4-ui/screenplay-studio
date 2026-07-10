import { createElement } from './formats'
import type { ScriptElement, ScriptElementType } from './types'

const sceneHeadingPattern =
  /^(?:INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|INT\.?|EXT\.?|\u5185\s*\/\s*\u5916\u666f|\u5916\s*\/\s*\u5185\u666f|\u5167\s*\/\s*\u5916\u666f|\u5916\s*\/\s*\u5167\u666f|\u5185\u5916\u666f|\u5916\u5185\u666f|\u5167\u5916\u666f|\u5916\u5167\u666f|\u5185\u666f|\u5167\u666f|\u5916\u666f)(?=\s|$|[-\u2013\u2014])/i

const transitionPattern =
  /^(?:CUT TO:?|DISSOLVE TO:?|FADE IN:?|FADE OUT\.?|FADE TO BLACK\.?|MATCH CUT TO:?|JUMP CUT TO:?|SMASH CUT TO:?|WIPE TO:?|\u5207\u81f3[:\uff1a]?|\u53e0\u5316\u81f3[:\uff1a]?|\u758a\u5316\u81f3[:\uff1a]?|\u6de1\u5165[:\uff1a]?|\u6de1\u51fa[.\u3002]?|\u6de1\u51fa\u81f3\u9ed1[.\u3002]?|\u5339\u914d\u526a\u63a5\u81f3[:\uff1a]?|\u8df3\u5207\u81f3[:\uff1a]?|\u7a81\u5207\u81f3[:\uff1a]?|\u5212\u53d8\u81f3[:\uff1a]?|\u5283\u8b8a\u81f3[:\uff1a]?)$/i

const parentheticalPattern = /^[(\uff08].*[)\uff09]$/
const sentencePunctuationPattern = /[\u3002\uff01\uff1f!?\uff1b;:\uff1a]$/

export function parsePlainTextScript(content: string): ScriptElement[] {
  const lines = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').trim())

  const elements: ScriptElement[] = []
  let previousType: ScriptElementType | undefined
  let previousWasBlank = true

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (!rawLine || isSubtitleTimecode(rawLine) || isSubtitleIndex(rawLine, lines[index + 1] ?? '')) {
      previousWasBlank = true
      previousType = undefined
      continue
    }

    const line = cleanImportLine(rawLine)
    const nextLine = findNextLine(lines, index + 1)
    const type = detectElementTypeForLine(line, nextLine, previousType, previousWasBlank)
    pushElement(elements, type, line)
    previousType = type
    previousWasBlank = false
  }

  return elements
}

export function detectElementTypeForLine(line: string, nextLine = '', previousType?: ScriptElementType, previousWasBlank = true): ScriptElementType {
  if (/^#{1,6}\s+/.test(line)) {
    return 'section'
  }

  if (/^@/.test(line)) {
    return 'character'
  }

  if (/^>/.test(line)) {
    return 'transition'
  }

  if (/^!/.test(line)) {
    return 'action'
  }

  if (isSceneHeading(line)) {
    return 'scene'
  }

  if (transitionPattern.test(line.trim())) {
    return 'transition'
  }

  if (parentheticalPattern.test(line.trim())) {
    return 'parenthetical'
  }

  if (previousType === 'character' || previousType === 'parenthetical') {
    return 'dialogue'
  }

  if (isCharacterCue(line, nextLine, previousWasBlank)) {
    return 'character'
  }

  return 'action'
}

function pushElement(elements: ScriptElement[], type: ScriptElementType, text: string) {
  const previous = elements[elements.length - 1]
  if (previous && previous.type === type && (type === 'action' || type === 'dialogue')) {
    previous.text = `${previous.text}\n${text}`
    return
  }

  elements.push(createElement(type, text))
}

function findNextLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index].trim()
    if (isSubtitleTimecode(rawLine) || isSubtitleIndex(rawLine, lines[index + 1] ?? '')) {
      continue
    }

    const line = cleanImportLine(rawLine)
    if (line) {
      return line
    }
  }

  return ''
}

function isCharacterCue(line: string, nextLine: string, previousWasBlank: boolean) {
  const clean = line.replace(/[(\uff08].*[)\uff09]$/, '').trim()
  if (!clean || !nextLine || isSceneHeading(nextLine) || transitionPattern.test(nextLine) || parentheticalPattern.test(nextLine)) {
    return false
  }

  if (/^[A-Z0-9][A-Z0-9 .'\-()]*$/.test(clean) && /[A-Z]/.test(clean) && clean.length <= 28) {
    return true
  }

  const isShortCjkName = /^[\u3400-\u9fffA-Za-z0-9\u00b7\u30fb]{1,10}$/.test(clean)
  return previousWasBlank && isShortCjkName && !sentencePunctuationPattern.test(clean)
}

function isSceneHeading(line: string) {
  const clean = line.startsWith('.') ? line.slice(1).trim() : line
  return sceneHeadingPattern.test(stripSceneNumber(clean).trim())
}

export function stripSceneNumber(value: string) {
  return value
    .replace(/^\s*#+\s*/, '')
    .replace(/^\s*[.@!>]\s*/, '')
    .replace(/^\s*#\s*\d+\s*/i, '')
    .replace(/^\s*(?:\u7b2c\s*)?\d+\s*(?:\u573a|\u5834|[.\u3001)]|\))?\s*/, '')
    .trim()
}

function cleanImportLine(value: string) {
  return value
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\s*[.@!>]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isSubtitleTimecode(value: string) {
  return /^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(value)
}

function isSubtitleIndex(value: string, nextLine: string) {
  return /^\d+$/.test(value.trim()) && isSubtitleTimecode(nextLine.trim())
}
