import type { AppLocale, ScriptElement, ScriptElementType, ScriptFormatId } from './types'

const SCREENPLAY_DPI = 96
const POINTS_PER_INCH = 72
const HOLLYWOOD_FONT_SIZE = 12
const HOLLYWOOD_COLUMNS_PER_INCH = 10
// A 12pt CJK em is 16 CSS px; a 12pt, 10-pitch Courier cell is 9.6 CSS px.
const WIDE_GLYPH_COLUMNS = 5 / 3
const COLUMN_EPSILON = 0.000001

export type ElementLayout = {
  marginLeft: number
  width: number
  align: 'left' | 'center' | 'right'
  before: number
  after: number
  uppercase?: boolean
  bold?: boolean
  italic?: boolean
}

export type ScriptFormat = {
  id: ScriptFormatId
  labels: Record<AppLocale, string>
  page: {
    kind: 'letter' | 'a4'
    width: number
    height: number
    marginTop: number
    marginRight: number
    marginBottom: number
    marginLeft: number
  }
  defaultFont: string
  defaultFontSize: number
  elements: Record<ScriptElementType, ElementLayout>
}

const hollywoodElements: Record<ScriptElementType, ElementLayout> = {
  scene: { marginLeft: 0, width: 576, align: 'left', before: 32, after: 0, uppercase: true, bold: true },
  action: { marginLeft: 0, width: 576, align: 'left', before: 16, after: 0 },
  character: { marginLeft: 240, width: 240, align: 'left', before: 16, after: 0, uppercase: true },
  parenthetical: { marginLeft: 144, width: 144, align: 'left', before: 0, after: 0 },
  dialogue: { marginLeft: 96, width: 336, align: 'left', before: 0, after: 0 },
  transition: { marginLeft: 432, width: 144, align: 'right', before: 16, after: 0, uppercase: true },
  shot: { marginLeft: 0, width: 576, align: 'left', before: 16, after: 0, uppercase: true, bold: true },
  section: { marginLeft: 0, width: 576, align: 'left', before: 32, after: 0, bold: true },
  note: { marginLeft: 0, width: 576, align: 'left', before: 16, after: 0, italic: true },
}

const eastAsiaElements: Record<ScriptElementType, ElementLayout> = {
  scene: { marginLeft: 0, width: 650, align: 'left', before: 16, after: 10, bold: true },
  action: { marginLeft: 0, width: 650, align: 'left', before: 0, after: 10 },
  character: { marginLeft: 0, width: 120, align: 'left', before: 10, after: 0, bold: true },
  parenthetical: { marginLeft: 125, width: 410, align: 'left', before: 0, after: 0 },
  dialogue: { marginLeft: 125, width: 470, align: 'left', before: 0, after: 8 },
  transition: { marginLeft: 470, width: 180, align: 'right', before: 14, after: 8 },
  shot: { marginLeft: 0, width: 650, align: 'left', before: 12, after: 8, bold: true },
  section: { marginLeft: 0, width: 650, align: 'left', before: 20, after: 8, bold: true },
  note: { marginLeft: 0, width: 650, align: 'left', before: 8, after: 8, italic: true },
}

const stageElements: Record<ScriptElementType, ElementLayout> = {
  scene: { marginLeft: 0, width: 610, align: 'center', before: 20, after: 12, uppercase: true, bold: true },
  action: { marginLeft: 40, width: 530, align: 'left', before: 0, after: 10, italic: true },
  character: { marginLeft: 210, width: 190, align: 'center', before: 14, after: 0, uppercase: true },
  parenthetical: { marginLeft: 130, width: 350, align: 'center', before: 0, after: 0 },
  dialogue: { marginLeft: 85, width: 440, align: 'left', before: 0, after: 10 },
  transition: { marginLeft: 380, width: 230, align: 'right', before: 14, after: 8, uppercase: true },
  shot: { marginLeft: 0, width: 610, align: 'left', before: 12, after: 8, uppercase: true },
  section: { marginLeft: 0, width: 610, align: 'left', before: 20, after: 8, bold: true },
  note: { marginLeft: 40, width: 530, align: 'left', before: 8, after: 8, italic: true },
}

const audioElements: Record<ScriptElementType, ElementLayout> = {
  scene: { marginLeft: 0, width: 620, align: 'left', before: 16, after: 10, uppercase: true, bold: true },
  action: { marginLeft: 0, width: 620, align: 'left', before: 0, after: 10 },
  character: { marginLeft: 0, width: 180, align: 'left', before: 10, after: 0, uppercase: true, bold: true },
  parenthetical: { marginLeft: 185, width: 360, align: 'left', before: 0, after: 0, italic: true },
  dialogue: { marginLeft: 185, width: 435, align: 'left', before: 0, after: 8 },
  transition: { marginLeft: 420, width: 200, align: 'right', before: 14, after: 8, uppercase: true },
  shot: { marginLeft: 0, width: 620, align: 'left', before: 10, after: 8, bold: true },
  section: { marginLeft: 0, width: 620, align: 'left', before: 18, after: 8, bold: true },
  note: { marginLeft: 0, width: 620, align: 'left', before: 8, after: 8, italic: true },
}

export const scriptFormats: ScriptFormat[] = [
  {
    id: 'hollywood',
    labels: {
      'zh-CN': '好莱坞标准',
      'en-US': 'Hollywood',
      'zh-TW': '好萊塢標準',
      'ja-JP': 'ハリウッド標準',
      'ko-KR': '할리우드 표준',
    },
    page: { kind: 'letter', width: 816, height: 1056, marginTop: 96, marginRight: 96, marginBottom: 96, marginLeft: 144 },
    defaultFont: 'Courier Prime',
    defaultFontSize: HOLLYWOOD_FONT_SIZE,
    elements: hollywoodElements,
  },
  {
    id: 'eastAsia',
    labels: {
      'zh-CN': '东亚影视',
      'en-US': 'East Asia',
      'zh-TW': '東亞影視',
      'ja-JP': '東アジア映像',
      'ko-KR': '동아시아 영상',
    },
    page: { kind: 'a4', width: 794, height: 1123, marginTop: 76, marginRight: 72, marginBottom: 76, marginLeft: 72 },
    defaultFont: 'Microsoft YaHei',
    defaultFontSize: 12,
    elements: eastAsiaElements,
  },
  {
    id: 'stage',
    labels: {
      'zh-CN': '舞台剧',
      'en-US': 'Stage Play',
      'zh-TW': '舞台劇',
      'ja-JP': '舞台脚本',
      'ko-KR': '무대극',
    },
    page: { kind: 'letter', width: 816, height: 1056, marginTop: 88, marginRight: 86, marginBottom: 88, marginLeft: 92 },
    defaultFont: 'Times New Roman',
    defaultFontSize: 12,
    elements: stageElements,
  },
  {
    id: 'audio',
    labels: {
      'zh-CN': '广播剧/播客',
      'en-US': 'Audio Drama',
      'zh-TW': '廣播劇/Podcast',
      'ja-JP': '音声ドラマ',
      'ko-KR': '오디오 드라마',
    },
    page: { kind: 'a4', width: 794, height: 1123, marginTop: 78, marginRight: 78, marginBottom: 78, marginLeft: 78 },
    defaultFont: 'Arial',
    defaultFontSize: 12,
    elements: audioElements,
  },
]

export const elementOrder: ScriptElementType[] = [
  'scene',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'section',
  'note',
]

export const elementLabels: Record<ScriptElementType, Record<AppLocale, string>> = {
  scene: { 'zh-CN': '场景', 'en-US': 'Scene', 'zh-TW': '場景', 'ja-JP': 'シーン', 'ko-KR': '장면' },
  action: { 'zh-CN': '动作', 'en-US': 'Action', 'zh-TW': '動作', 'ja-JP': 'アクション', 'ko-KR': '지문' },
  character: { 'zh-CN': '角色', 'en-US': 'Character', 'zh-TW': '角色', 'ja-JP': '人物', 'ko-KR': '인물' },
  parenthetical: { 'zh-CN': '括注', 'en-US': 'Parenthetical', 'zh-TW': '括註', 'ja-JP': 'ト書き', 'ko-KR': '괄호' },
  dialogue: { 'zh-CN': '对白', 'en-US': 'Dialogue', 'zh-TW': '對白', 'ja-JP': 'セリフ', 'ko-KR': '대사' },
  transition: { 'zh-CN': '转场', 'en-US': 'Transition', 'zh-TW': '轉場', 'ja-JP': '転換', 'ko-KR': '전환' },
  shot: { 'zh-CN': '镜头', 'en-US': 'Shot', 'zh-TW': '鏡頭', 'ja-JP': 'ショット', 'ko-KR': '숏' },
  section: { 'zh-CN': '段落', 'en-US': 'Section', 'zh-TW': '段落', 'ja-JP': '区分', 'ko-KR': '구분' },
  note: { 'zh-CN': '备注', 'en-US': 'Note', 'zh-TW': '備註', 'ja-JP': 'メモ', 'ko-KR': '메모' },
}

export function getFormat(formatId: ScriptFormatId) {
  return scriptFormats.find((format) => format.id === formatId) ?? scriptFormats[0]
}

export function getElementLabel(type: ScriptElementType, locale: AppLocale) {
  return elementLabels[type][locale]
}

export function resolveElementLayout(element: Pick<ScriptElement, 'type' | 'text'>, format: ScriptFormat) {
  return format.elements[element.type]
}

export function paginateElements(elements: ScriptElement[], format: ScriptFormat, fontSize: number) {
  const pages: ScriptElement[][] = []
  let currentPage: ScriptElement[] = []
  let cursor = format.page.marginTop
  const maxY = format.page.height - format.page.marginBottom

  elements.forEach((element) => {
    const height = estimateElementHeight(element, format, fontSize, currentPage.length > 0)
    if (currentPage.length > 0 && cursor + height > maxY) {
      pages.push(currentPage)
      currentPage = []
      cursor = format.page.marginTop
    }
    currentPage.push(element)
    cursor += height
  })

  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  return pages.length > 0 ? pages : [[]]
}

export function estimateElementHeight(element: ScriptElement, format: ScriptFormat, fontSize: number, includeBefore = true) {
  const layout = resolveElementLayout(element, format)
  const lineHeight = getScreenplayLineHeight(fontSize)
  const lines = wrapElementText(element, layout, fontSize).length
  return (includeBefore ? layout.before : 0) + lines * lineHeight + layout.after
}

export function wrapElementText(element: Pick<ScriptElement, 'text'>, layout: ElementLayout, fontSize: number) {
  const maxColumns = getElementColumnCapacity(layout, fontSize)
  return wrapTextToScreenplayLines(element.text || ' ', maxColumns)
}

export function getElementColumnCapacity(layout: ElementLayout, fontSize: number) {
  return Math.max(1, Math.floor(layout.width / getScreenplayCharacterWidth(fontSize)))
}

export function getScreenplayLineHeight(fontSize: number) {
  return Math.round(fontSize * (SCREENPLAY_DPI / POINTS_PER_INCH))
}

export function getScreenplayCharacterWidth(fontSize: number) {
  return (fontSize / HOLLYWOOD_FONT_SIZE) * (SCREENPLAY_DPI / HOLLYWOOD_COLUMNS_PER_INCH)
}

export function getScreenplayFontStack(preferredFont: string, format: ScriptFormat, _locale: AppLocale = 'zh-CN') {
  const sanitizedPreferred = sanitizeFontFamily(preferredFont)
  if (format.id === 'hollywood') {
    return `"Courier Prime", "Courier Final Draft", "Courier Screenplay", "Courier New", Courier, "Screenplay CJK", "Microsoft YaHei", monospace`
  }

  return `"${sanitizedPreferred}", "Screenplay CJK", "Microsoft YaHei", "PingFang SC", sans-serif`
}

export function getScreenplayTypographyCss() {
  return 'font-kerning:none;font-variant-ligatures:none;font-feature-settings:"kern" 0, "liga" 0;letter-spacing:0;word-spacing:0;text-rendering:geometricPrecision'
}

export function wrapTextToScreenplayLines(value: string, maxColumns: number) {
  const output: string[] = []
  value.split(/\r?\n/).forEach((paragraph) => {
    if (!paragraph) {
      output.push(' ')
      return
    }

    let line = ''
    let lineColumns = 0
    const tokens = paragraph.split(/(\s+)/).filter(Boolean)

    tokens.forEach((token) => {
      const tokenColumns = measureScreenplayColumns(token)
      if (/^\s+$/.test(token)) {
        if (line && !exceedsColumnCapacity(lineColumns, tokenColumns, maxColumns)) {
          line += token
          lineColumns += tokenColumns
        }
        return
      }

      if (tokenColumns > maxColumns) {
        Array.from(token).forEach((char) => {
          const charColumns = measureScreenplayColumns(char)
          if (line && exceedsColumnCapacity(lineColumns, charColumns, maxColumns)) {
            output.push(line.trimEnd())
            line = ''
            lineColumns = 0
          }
          line += char
          lineColumns += charColumns
        })
        return
      }

      if (line && exceedsColumnCapacity(lineColumns, tokenColumns, maxColumns)) {
        output.push(line.trimEnd())
        line = ''
        lineColumns = 0
      }

      line += token
      lineColumns += tokenColumns
    })

    output.push(line.trimEnd() || ' ')
  })

  return output
}

function exceedsColumnCapacity(currentColumns: number, addedColumns: number, maxColumns: number) {
  return currentColumns + addedColumns > maxColumns + COLUMN_EPSILON
}

function measureScreenplayColumns(value: string) {
  return Array.from(value).reduce((sum, char) => sum + getGlyphColumns(char), 0)
}

function getGlyphColumns(value: string) {
  if (/[\u0300-\u036f]/.test(value)) {
    return 0
  }

  if (/\s/.test(value)) {
    return 1
  }

  return isWideGlyph(value) ? WIDE_GLYPH_COLUMNS : 1
}

function isWideGlyph(value: string) {
  return /[\u1100-\u11ff\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uff00-\uffef]/.test(value)
}

function sanitizeFontFamily(value: string) {
  return value.replace(/["\\]/g, '').trim() || 'Courier New'
}

export function createElement(type: ScriptElementType, text = ''): ScriptElement {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { id, type, text }
}
