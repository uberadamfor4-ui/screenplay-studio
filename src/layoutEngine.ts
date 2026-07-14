import {
  getScreenplayCharacterWidth,
  getScreenplayFontStack,
  getScreenplayLineHeight,
  resolveElementLayout,
  type ElementLayout,
  type ScriptFormat,
} from './formats'
import { resolveExportSettings } from './exportProfiles'
import type { AppLocale, ExportSettings, ScriptElement, ScriptElementType, ScriptProject } from './types'

export type TextStyle = {
  bold?: boolean
  italic?: boolean
}

export type TextMeasurer = (text: string, style?: TextStyle) => number

export type PositionedBlock = {
  id: string
  sourceId?: string
  sourceType?: ScriptElementType
  type: ScriptElementType | 'more' | 'continued-character'
  text: string
  lines: string[]
  x: number
  y: number
  width: number
  align: 'left' | 'center' | 'right'
  bold: boolean
  italic: boolean
  synthetic?: boolean
  dualSide?: 'left' | 'right'
  sceneNumber?: string
}

export type LayoutPage = {
  index: number
  label: string
  blocks: PositionedBlock[]
}

export type LayoutResult = {
  pages: LayoutPage[]
  lineHeight: number
  settings: ExportSettings
  warnings: string[]
}

type MeasuredElement = {
  element: ScriptElement
  lines: string[]
  layout: ElementLayout
}

type LayoutUnit =
  | { kind: 'element'; measured: MeasuredElement }
  | { kind: 'dual'; groupId: string; left: MeasuredElement[]; right: MeasuredElement[] }

const forbiddenLineStart = new Set(Array.from('，。！？；：、）》】」』〕〉］｝’”％‰!?;:,.…'))
const forbiddenLineEnd = new Set(Array.from('（《【「『〔〈［｛‘“'))

export function createCanvasTextMeasurer(project: ScriptProject, format: ScriptFormat): TextMeasurer {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const fontStack = getScreenplayFontStack(project.fontFamily, format, project.language)
  const cache = new Map<string, number>()

  return (text, style = {}) => {
    if (!context) {
      return createFallbackTextMeasurer(project.fontSize)(text)
    }
    const key = `${style.bold ? 1 : 0}${style.italic ? 1 : 0}:${text}`
    const cached = cache.get(key)
    if (cached !== undefined) {
      return cached
    }
    context.font = `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : '400 '}${project.fontSize}pt ${fontStack}`
    context.fontKerning = 'none'
    const width = context.measureText(text).width
    cache.set(key, width)
    return width
  }
}

export function createFallbackTextMeasurer(fontSize: number): TextMeasurer {
  const narrowWidth = getScreenplayCharacterWidth(fontSize)
  const wideWidth = fontSize * (96 / 72)
  return (text) => Array.from(text).reduce((sum, char) => sum + (isWideGlyph(char) ? wideWidth : narrowWidth), 0)
}

export function wrapMeasuredText(
  value: string,
  maxWidth: number,
  measure: TextMeasurer,
  locale: AppLocale,
  style: TextStyle = {},
) {
  const lines: string[] = []
  const paragraphs = value.split(/\r?\n/)

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push(' ')
      return
    }

    const segments = segmentWords(paragraph, locale)
    let line = ''
    segments.forEach((segment) => {
      if (/^\s+$/u.test(segment)) {
        if (line && measure(line + segment, style) <= maxWidth) {
          line += segment
        }
        return
      }

      const candidate = line + segment
      if (!line || measure(candidate, style) <= maxWidth) {
        if (measure(segment, style) <= maxWidth || line) {
          line = candidate
          return
        }
      }

      if (line) {
        lines.push(line.trimEnd())
        line = ''
      }

      if (measure(segment, style) <= maxWidth) {
        line = segment
        return
      }

      splitOversizedSegment(segment, maxWidth, measure, style).forEach((part, index, parts) => {
        if (index === parts.length - 1) {
          line = part
        } else {
          lines.push(part)
        }
      })
    })
    lines.push(line.trimEnd() || ' ')
  })

  return applyLineBreakRules(lines, maxWidth, measure, style)
}

export function layoutScreenplay(
  project: ScriptProject,
  format: ScriptFormat,
  measurer: TextMeasurer = createFallbackTextMeasurer(project.fontSize),
): LayoutResult {
  const settings = resolveExportSettings(project)
  const lineHeight = getScreenplayLineHeight(project.fontSize)
  const measured = project.elements.map((element) => measureElement(element, project, format, measurer))
  const units = buildUnits(measured)
  const pages: LayoutPage[] = [{ index: 1, label: '1', blocks: [] }]
  const warnings: string[] = []
  const maxY = format.page.height - format.page.marginBottom
  let page = pages[0]
  let cursor = format.page.marginTop
  let currentCharacter = ''

  const nextPage = () => {
    page = { index: pages.length + 1, label: '', blocks: [] }
    pages.push(page)
    cursor = format.page.marginTop
  }

  units.forEach((unit, unitIndex) => {
    if (unit.kind === 'dual') {
      const before = page.blocks.length > 0 ? lineHeight : 0
      let dual = positionDualUnit(unit, project, format, cursor + before, lineHeight, measurer)
      if (page.blocks.length > 0 && cursor + before + dual.height > maxY) {
        nextPage()
        dual = positionDualUnit(unit, project, format, cursor, lineHeight, measurer)
      }
      if (dual.endY > maxY) {
        warnings.push('一组双栏对白超过单页高度，请缩短或拆分该对白。')
      }
      page.blocks.push(...dual.blocks)
      cursor = Math.max(cursor, dual.endY)
      return
    }

    const item = unit.measured
    if (item.element.type === 'character') {
      currentCharacter = item.element.text.trim()
    }

    const before = page.blocks.length === 0 ? 0 : item.layout.before
    const fullHeight = before + item.lines.length * lineHeight + item.layout.after
    const keepHeight = getKeepWithNextHeight(units, unitIndex, lineHeight)
    if (page.blocks.length > 0 && cursor + Math.max(fullHeight, keepHeight) > maxY && keepHeight > fullHeight) {
      nextPage()
    }

    const activeBefore = page.blocks.length === 0 ? 0 : item.layout.before
    if (cursor + activeBefore + item.lines.length * lineHeight + item.layout.after <= maxY) {
      cursor += activeBefore
      page.blocks.push(positionBlock(item, format, cursor))
      cursor += item.lines.length * lineHeight + item.layout.after
      return
    }

    if (!isSplittable(item.element.type) && page.blocks.length > 0) {
      nextPage()
    }

    let remaining = [...item.lines]
    let firstFragment = true
    while (remaining.length > 0) {
      const fragmentBefore = page.blocks.length === 0 ? 0 : firstFragment ? item.layout.before : 0
      let availableLines = Math.floor((maxY - cursor - fragmentBefore - item.layout.after) / lineHeight)
      const needsDialogueMarker = item.element.type === 'dialogue' && settings.moreContinued && remaining.length > availableLines
      if (needsDialogueMarker) {
        availableLines -= 1
      }

      if (availableLines < 2 && page.blocks.length > 0) {
        nextPage()
        if (!firstFragment && item.element.type === 'dialogue' && settings.moreContinued && currentCharacter) {
          const continued = createContinuedCharacter(currentCharacter, project.language, format, cursor)
          page.blocks.push(continued)
          cursor += lineHeight
        }
        continue
      }

      availableLines = Math.max(1, availableLines)
      if (remaining.length > availableLines && remaining.length - availableLines === 1 && availableLines > 2) {
        availableLines -= 1
      }
      const fragmentLines = remaining.splice(0, availableLines)
      cursor += fragmentBefore
      page.blocks.push(positionBlock({ ...item, lines: fragmentLines }, format, cursor, firstFragment ? undefined : `fragment-${remaining.length}`))
      cursor += fragmentLines.length * lineHeight

      if (remaining.length > 0) {
        if (item.element.type === 'dialogue' && settings.moreContinued) {
          page.blocks.push(createMoreBlock(project.language, format, cursor, item.element.id))
          cursor += lineHeight
        }
        nextPage()
        if (item.element.type === 'dialogue' && settings.moreContinued && currentCharacter) {
          const continued = createContinuedCharacter(currentCharacter, project.language, format, cursor)
          page.blocks.push(continued)
          cursor += lineHeight
        }
      } else {
        cursor += item.layout.after
      }
      firstFragment = false
    }
  })

  pages.forEach((item, index) => {
    item.index = index + 1
    item.label = buildPageLabel(index + 1, pages.length, project, settings)
  })

  return { pages, lineHeight, settings, warnings }
}

function measureElement(element: ScriptElement, project: ScriptProject, format: ScriptFormat, measurer: TextMeasurer): MeasuredElement {
  const layout = resolveElementLayout(element, format)
  const displayText = element.type === 'scene' ? stripInlineSceneNumber(element.text) : element.text
  const text = layout.uppercase ? displayText.toLocaleUpperCase(project.language) : displayText
  return {
    element,
    layout,
    lines: wrapMeasuredText(text || ' ', layout.width, measurer, project.language, { bold: layout.bold, italic: layout.italic }),
  }
}

function stripInlineSceneNumber(value: string) {
  return value.replace(/^\s*\d+[A-Z]?\s*[.．、-]\s*/iu, '')
}

function buildUnits(elements: MeasuredElement[]) {
  const units: LayoutUnit[] = []
  const consumed = new Set<string>()

  elements.forEach((item) => {
    const dual = item.element.dualDialogue
    if (!dual || consumed.has(dual.groupId)) {
      if (!dual) {
        units.push({ kind: 'element', measured: item })
      }
      return
    }
    const grouped = elements.filter((candidate) => candidate.element.dualDialogue?.groupId === dual.groupId)
    consumed.add(dual.groupId)
    units.push({
      kind: 'dual',
      groupId: dual.groupId,
      left: grouped.filter((candidate) => candidate.element.dualDialogue?.side === 'left'),
      right: grouped.filter((candidate) => candidate.element.dualDialogue?.side === 'right'),
    })
  })

  return units
}

function positionBlock(item: MeasuredElement, format: ScriptFormat, y: number, suffix = ''): PositionedBlock {
  const sceneNumber = item.element.type === 'scene' ? item.element.sceneNumber ?? readSceneNumber(item.element.text) : undefined
  return {
    id: `${item.element.id}${suffix ? `-${suffix}` : ''}`,
    sourceId: item.element.id,
    sourceType: item.element.type,
    type: item.element.type,
    text: item.lines.join('\n'),
    lines: item.lines,
    x: format.page.marginLeft + item.layout.marginLeft,
    y,
    width: item.layout.width,
    align: item.layout.align,
    bold: Boolean(item.layout.bold),
    italic: Boolean(item.layout.italic),
    sceneNumber,
  }
}

function getKeepWithNextHeight(units: LayoutUnit[], index: number, lineHeight: number) {
  const unit = units[index]
  if (unit.kind !== 'element') {
    return 0
  }
  const current = unit.measured
  if (current.element.type === 'scene') {
    const next = units[index + 1]
    if (next?.kind === 'element') {
      return current.layout.before + current.lines.length * lineHeight + next.measured.layout.before + Math.min(2, next.measured.lines.length) * lineHeight
    }
  }
  if (current.element.type === 'character') {
    let height = current.layout.before + current.lines.length * lineHeight
    for (let cursor = index + 1; cursor < Math.min(units.length, index + 3); cursor += 1) {
      const next = units[cursor]
      if (next.kind !== 'element' || !['parenthetical', 'dialogue'].includes(next.measured.element.type)) {
        break
      }
      height += next.measured.layout.before + Math.min(next.measured.element.type === 'dialogue' ? 2 : 1, next.measured.lines.length) * lineHeight
      if (next.measured.element.type === 'dialogue') {
        break
      }
    }
    return height
  }
  return 0
}

function positionDualUnit(
  unit: Extract<LayoutUnit, { kind: 'dual' }>,
  project: ScriptProject,
  format: ScriptFormat,
  startY: number,
  lineHeight: number,
  measurer: TextMeasurer,
) {
  const gap = 24
  const columnWidth = (format.elements.action.width - gap) / 2
  const contentLeft = format.page.marginLeft
  const sides: Array<{ side: 'left' | 'right'; items: MeasuredElement[]; offset: number }> = [
    { side: 'left', items: unit.left, offset: 0 },
    { side: 'right', items: unit.right, offset: columnWidth + gap },
  ]
  const blocks: PositionedBlock[] = []
  let endY = startY

  sides.forEach(({ side, items, offset }) => {
    let y = startY
    items.forEach((item, index) => {
      const adjusted = getDualLayout(item.element.type, columnWidth)
      const text = item.layout.uppercase ? item.element.text.toLocaleUpperCase(project.language) : item.element.text
      const lines = wrapMeasuredText(text || ' ', adjusted.width, measurer, project.language, { bold: item.layout.bold, italic: item.layout.italic })
      y += index === 0 ? 0 : item.layout.before / 2
      blocks.push({
        ...positionBlock({ ...item, lines, layout: adjusted }, format, y),
        id: `${item.element.id}-${side}`,
        x: contentLeft + offset + adjusted.marginLeft,
        dualSide: side,
      })
      y += lines.length * lineHeight + item.layout.after / 2
    })
    endY = Math.max(endY, y)
  })
  return { blocks, endY, height: endY - startY }
}

function getDualLayout(type: ScriptElementType, columnWidth: number): ElementLayout {
  if (type === 'character') {
    return { marginLeft: columnWidth * 0.28, width: columnWidth * 0.62, align: 'left', before: 8, after: 0, uppercase: true }
  }
  if (type === 'parenthetical') {
    return { marginLeft: columnWidth * 0.12, width: columnWidth * 0.7, align: 'left', before: 0, after: 0 }
  }
  return { marginLeft: 0, width: columnWidth * 0.92, align: 'left', before: 0, after: 0 }
}

function createMoreBlock(locale: AppLocale, format: ScriptFormat, y: number, sourceId: string): PositionedBlock {
  const text = locale === 'en-US' ? '(MORE)' : locale === 'zh-TW' ? '（續）' : locale === 'ja-JP' ? '（続く）' : locale === 'ko-KR' ? '(계속)' : '（续）'
  const layout = format.elements.dialogue
  return {
    id: `${sourceId}-more-${y}`,
    sourceId,
    sourceType: 'dialogue',
    type: 'more',
    text,
    lines: [text],
    x: format.page.marginLeft + layout.marginLeft,
    y,
    width: layout.width,
    align: 'center',
    bold: false,
    italic: false,
    synthetic: true,
  }
}

function createContinuedCharacter(name: string, locale: AppLocale, format: ScriptFormat, y: number): PositionedBlock {
  const suffix = locale === 'en-US' ? " (CONT'D)" : locale === 'zh-TW' ? '（續）' : locale === 'ja-JP' ? '（続き）' : locale === 'ko-KR' ? '(계속)' : '（续）'
  const layout = format.elements.character
  const text = `${name}${suffix}`
  return {
    id: `continued-${y}-${name}`,
    type: 'continued-character',
    text,
    lines: [text],
    x: format.page.marginLeft + layout.marginLeft,
    y,
    width: layout.width,
    align: layout.align,
    bold: false,
    italic: false,
    synthetic: true,
  }
}

function buildPageLabel(pageNumber: number, pageCount: number, project: ScriptProject, settings: ExportSettings) {
  const lock = project.productionLock
  if (!settings.lockedPageLabels || !lock?.enabled || pageCount <= lock.pages || pageNumber <= lock.pages) {
    return String(pageNumber)
  }
  return `${lock.pages}${toAlphabeticSuffix(pageNumber - lock.pages)}`
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

function readSceneNumber(value: string) {
  return value.match(/^\s*(\d+[A-Z]?)\s*[.．、-]/i)?.[1]
}

function isSplittable(type: ScriptElementType) {
  return ['action', 'dialogue', 'note', 'section', 'shot'].includes(type)
}

function segmentWords(value: string, locale: AppLocale) {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(value), (item) => item.segment)
  }
  return value.split(/(\s+|(?=[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af])|(?<=[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]))/u).filter(Boolean)
}

function splitOversizedSegment(segment: string, maxWidth: number, measure: TextMeasurer, style: TextStyle) {
  const parts: string[] = []
  let part = ''
  segmentGraphemes(segment).forEach((char) => {
    if (part && measure(part + char, style) > maxWidth) {
      parts.push(part)
      part = ''
    }
    part += char
  })
  if (part) {
    parts.push(part)
  }
  return parts
}

function applyLineBreakRules(lines: string[], maxWidth: number, measure: TextMeasurer, style: TextStyle) {
  const output = [...lines]
  for (let index = 0; index < output.length - 1; index += 1) {
    let current = output[index]
    let next = output[index + 1]
    while (next.length > 0 && forbiddenLineStart.has(segmentGraphemes(next)[0])) {
      const char = segmentGraphemes(next)[0]
      if (measure(current + char, style) <= maxWidth + 0.75) {
        current += char
        next = segmentGraphemes(next).slice(1).join('')
      } else {
        const currentChars = segmentGraphemes(current)
        const moved = currentChars.pop()
        if (!moved) break
        current = currentChars.join('')
        next = moved + next
      }
    }
    while (current.length > 1 && forbiddenLineEnd.has(segmentGraphemes(current).at(-1) ?? '')) {
      const currentChars = segmentGraphemes(current)
      const moved = currentChars.pop()
      current = currentChars.join('')
      next = `${moved ?? ''}${next}`
    }
    output[index] = current
    output[index + 1] = next
  }
  return output
}

function segmentGraphemes(value: string) {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (item) => item.segment)
  }
  return Array.from(value)
}

function isWideGlyph(value: string) {
  return /[\u1100-\u11ff\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/u.test(value)
}
