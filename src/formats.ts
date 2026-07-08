import type { AppLocale, ScriptElement, ScriptElementType, ScriptFormatId } from './types'

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
  character: { marginLeft: 211, width: 200, align: 'center', before: 16, after: 0, uppercase: true },
  parenthetical: { marginLeft: 154, width: 270, align: 'left', before: 0, after: 0 },
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
    defaultFont: 'Courier New',
    defaultFontSize: 12,
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
  parenthetical: { 'zh-CN': '括注', 'en-US': 'Parenthetical', 'zh-TW': '括注', 'ja-JP': 'ト書き', 'ko-KR': '괄호' },
  dialogue: { 'zh-CN': '对白', 'en-US': 'Dialogue', 'zh-TW': '對白', 'ja-JP': 'セリフ', 'ko-KR': '대사' },
  transition: { 'zh-CN': '转场', 'en-US': 'Transition', 'zh-TW': '轉場', 'ja-JP': '転換', 'ko-KR': '전환' },
  shot: { 'zh-CN': '镜头', 'en-US': 'Shot', 'zh-TW': '鏡頭', 'ja-JP': 'ショット', 'ko-KR': '샷' },
  section: { 'zh-CN': '段落', 'en-US': 'Section', 'zh-TW': '段落', 'ja-JP': '区分', 'ko-KR': '구간' },
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
  const hardLines = element.text.split(/\r?\n/)
  const lines = hardLines.reduce((sum, line) => {
    const estimatedWidth = estimateTextWidth(line, fontSize)
    return sum + Math.max(1, Math.ceil(Math.max(estimatedWidth, 1) / layout.width))
  }, 0)

  return (includeBefore ? layout.before : 0) + lines * lineHeight + layout.after
}

export function getScreenplayLineHeight(fontSize: number) {
  return Math.round(fontSize * (96 / 72))
}

function estimateTextWidth(value: string, fontSize: number) {
  const latinWidth = fontSize * 0.8
  const wideWidth = fontSize * (96 / 72)
  return Array.from(value).reduce((sum, char) => sum + (isWideGlyph(char) ? wideWidth : latinWidth), 0)
}

function isWideGlyph(value: string) {
  return /[\u1100-\u11ff\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uff00-\uffef]/.test(value)
}

export function createElement(type: ScriptElementType, text = ''): ScriptElement {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { id, type, text }
}
