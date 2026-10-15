import { createElement } from './formats'
import { projectDataLimits } from './dataLimits'
import type { ScriptElement, ScriptElementType, TitlePageData } from './types'

const sceneHeadingPattern =
  /^(?:INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|INT\.?|EXT\.?|\u5185\s*\/\s*\u5916\u666f|\u5916\s*\/\s*\u5185\u666f|\u5167\s*\/\s*\u5916\u666f|\u5916\s*\/\s*\u5167\u666f|\u5185\u5916\u666f|\u5916\u5185\u666f|\u5167\u5916\u666f|\u5916\u5167\u666f|\u5185\u666f|\u5167\u666f|\u5916\u666f)(?=\s|$|[-\u2013\u2014])/i

const transitionPattern =
  /^(?:CUT TO:?|DISSOLVE TO:?|FADE IN:?|FADE OUT\.?|FADE TO BLACK\.?|MATCH CUT TO:?|JUMP CUT TO:?|SMASH CUT TO:?|WIPE TO:?|\u5207\u81f3[:\uff1a]?|\u53e0\u5316\u81f3[:\uff1a]?|\u758a\u5316\u81f3[:\uff1a]?|\u6de1\u5165[:\uff1a]?|\u6de1\u51fa[.\u3002]?|\u6de1\u51fa\u81f3\u9ed1[.\u3002]?|\u5339\u914d\u526a\u63a5\u81f3[:\uff1a]?|\u8df3\u5207\u81f3[:\uff1a]?|\u7a81\u5207\u81f3[:\uff1a]?|\u5212\u53d8\u81f3[:\uff1a]?|\u5283\u8b8a\u81f3[:\uff1a]?)$/i

const parentheticalPattern = /^[(\uff08].*[)\uff09]$/
const sentencePunctuationPattern = /[\u3002\uff01\uff1f!?\uff1b;:\uff1a]$/

type ImportOptions = { format?: 'text' | 'fountain' }

export function parsePlainTextScript(content: string, options: ImportOptions = {}): ScriptElement[] {
  return parseImportedScript(content, options).elements
}

export function parseImportedScript(content: string, options: ImportOptions = {}) {
  const rawLines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' '))
  if (rawLines.length > projectDataLimits.maxImportLines) {
    throw new Error(`导入文档超过 ${projectDataLimits.maxImportLines} 行，请拆分后再导入。`)
  }

  const { start, titlePage } = options.format === 'fountain' ? readFountainTitlePage(rawLines) : { start: 0, titlePage: undefined }
  const lines = rawLines.slice(start).map((line) => line.trim())
  // Cache lookahead so long whitespace/subtitle runs are visited only once.
  const following = new Array<string>(lines.length)
  let next = ''
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    following[index] = next
    if (lines[index] && !isSubtitleTimecode(lines[index]) && !isSubtitleIndex(lines[index], lines[index + 1] ?? '')) next = lines[index]
  }
  const drafts: Array<{ type: ScriptElementType; lines: string[]; textLength: number }> = []
  let previousType: ScriptElementType | undefined
  let previousWasBlank = true

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (!rawLine || isSubtitleTimecode(rawLine) || isSubtitleIndex(rawLine, lines[index + 1] ?? '')) {
      previousWasBlank = true
      // Word extraction separates ordinary paragraphs with empty lines. A cue
      // still owns its next speech, but a completed speech must not absorb action.
      if (previousType !== 'character' && previousType !== 'parenthetical') previousType = undefined
      continue
    }

    const type = detectElementTypeForLine(rawLine, following[index], previousType, previousWasBlank, options.format === 'fountain')
    const line = cleanImportLine(rawLine, type)
    pushElementDraft(drafts, type, line, !previousWasBlank)
    previousType = type
    previousWasBlank = false
  }

  return { elements: drafts.map((draft) => createElement(draft.type, draft.lines.join('\n'))), titlePage }
}

export function detectElementTypeForLine(line: string, nextLine = '', previousType?: ScriptElementType, previousWasBlank = true, fountainSyntax = false): ScriptElementType {
  if (/^#{1,6}\s+/.test(line)) {
    return 'section'
  }

  if (/^@\s*\S/u.test(line)) {
    return 'character'
  }

  if (/^>\s*\S/u.test(line)) {
    if (line.endsWith('<')) return 'action'
    return 'transition'
  }

  if (/^!\s*\S/u.test(line)) {
    return 'action'
  }

  if ((fountainSyntax && /^\.[\p{L}\p{N}]/u.test(line)) || isSceneHeading(line)) {
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

  if (previousType === 'dialogue' && !previousWasBlank) {
    return 'dialogue'
  }

  if (isCharacterCue(line, nextLine, previousWasBlank, fountainSyntax)) {
    return 'character'
  }

  return 'action'
}

function pushElementDraft(
  elements: Array<{ type: ScriptElementType; lines: string[]; textLength: number }>,
  type: ScriptElementType,
  text: string,
  mergeWithPrevious: boolean,
) {
  const previous = elements[elements.length - 1]
  if (mergeWithPrevious && previous && previous.type === type && (type === 'action' || type === 'dialogue')) {
    const nextLength = previous.textLength + 1 + text.length
    if (nextLength > projectDataLimits.maxElementTextCharacters) {
      throw new Error('导入文档包含过长的单个段落，请拆分后再导入。')
    }
    previous.lines.push(text)
    previous.textLength = nextLength
    return
  }

  if (elements.length >= projectDataLimits.maxScriptElements) {
    throw new Error(`导入文档超过 ${projectDataLimits.maxScriptElements} 个剧本段落，请拆分后再导入。`)
  }
  if (text.length > projectDataLimits.maxElementTextCharacters) {
    throw new Error('导入文档包含过长的单个段落，请拆分后再导入。')
  }
  elements.push({ type, lines: [text], textLength: text.length })
}

function isCharacterCue(line: string, nextLine: string, previousWasBlank: boolean, fountainSyntax: boolean) {
  if (line.length > 80 || /^(?:[!>@]\s*\S|#{1,6}\s+)/u.test(nextLine) || (fountainSyntax && /^\.[\p{L}\p{N}]/u.test(nextLine))) return false
  const clean = line.replace(/[(\uff08].*[)\uff09]$/, '').trim()
  if (!clean || !nextLine || isSceneHeading(nextLine) || transitionPattern.test(nextLine)) {
    return false
  }

  if (/^[\p{L}\p{M}\p{N} .'\u2019-]+$/u.test(clean) && /\p{Lu}/u.test(clean) && clean === clean.toUpperCase() && clean.length <= 28) {
    return true
  }

  const isShortCjkName = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9\u00b7\u30fb]{1,10}$/u.test(clean)
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
    .replace(/^\s*#\s*[A-Z]*\d+[A-Z]*\s*#?\s*/i, '')
    .replace(/^\s*(?:\u7b2c\s*)?[A-Z]*\d+[A-Z]*\s*(?:\u573a|\u5834|[.\u3001)]|\))?\s*/i, '')
    .trim()
}

function cleanImportLine(value: string, type: ScriptElementType) {
  if (type === 'section') return value.replace(/^#{1,6}\s+/u, '').trim()
  if (type === 'scene' && /^\.[\p{L}\p{N}]/u.test(value)) return value.slice(1).trim()
  if (type === 'character' && value.startsWith('@')) return value.slice(1).trim()
  if (type === 'transition' && value.startsWith('>')) return value.slice(1).trim()
  if (type === 'action' && /^!\s*\S/u.test(value)) return value.slice(1).trim()
  if (type === 'action' && value.startsWith('>') && value.endsWith('<')) return value.slice(1, -1).trim()
  return value
}

function readFountainTitlePage(lines: string[]): { start: number; titlePage?: Partial<TitlePageData> } {
  const fields: Record<string, keyof TitlePageData> = { title: 'title', credit: 'credit', author: 'authors', authors: 'authors', source: 'basedOn', 'draft date': 'draftDate', contact: 'contact', copyright: 'copyright' }
  let first = 0
  while (first < lines.length && !lines[first].trim()) first += 1
  const firstKey = /^([^:]+):/u.exec(lines[first]?.trim() ?? '')?.[1].toLowerCase()
  if (!firstKey || !Object.hasOwn(fields, firstKey)) return { start: 0 }
  const values: Partial<Record<keyof TitlePageData, string[]>> = {}
  let field: keyof TitlePageData | undefined
  let index = first
  let length = 0
  for (; index < lines.length && lines[index].trim(); index += 1) {
    const line = lines[index]
    const entry = /^([^:]+):\s*(.*)$/u.exec(line.trim())
    if (!/^(?: {3,}|\t)/u.test(line) && entry) {
      const key = entry[1].toLowerCase()
      field = Object.hasOwn(fields, key) ? fields[key] : undefined
      if (field) (values[field] ??= []).push(entry[2])
    } else if (/^(?: {3,}|\t)/u.test(line)) {
      if (field) (values[field] ??= []).push(line.trim())
    } else break
    length += line.length
    if (length > projectDataLimits.maxMetadataTextCharacters) throw new Error('导入标题页文字过多，请精简后重试。')
  }
  const titlePage = Object.fromEntries(Object.entries(values).map(([key, lines]) => [key, lines.filter(Boolean).join('\n')]))
  return { start: index, titlePage }
}

function isSubtitleTimecode(value: string) {
  return /^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(value)
}

function isSubtitleIndex(value: string, nextLine: string) {
  return /^\d+$/.test(value.trim()) && isSubtitleTimecode(nextLine.trim())
}
