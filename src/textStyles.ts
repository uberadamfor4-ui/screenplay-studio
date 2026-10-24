import type { ElementLayout } from './formats'
import type { ScriptElement, ScriptElementTextStyle } from './types'
import { cleanFontFamily } from './fontFamilies'

export type ResolvedElementTextStyle = {
  bold: boolean
  italic: boolean
  underline: boolean
  fontFamily: string
  fontFamilyOverride?: string
}

export function resolveElementTextStyle(
  element: Pick<ScriptElement, 'textStyle'>,
  layout: Pick<ElementLayout, 'bold' | 'italic'>,
  projectFontFamily: string,
): ResolvedElementTextStyle {
  const fontFamilyOverride = element.textStyle?.fontFamily?.trim() || undefined
  return {
    bold: element.textStyle?.bold ?? Boolean(layout.bold),
    italic: element.textStyle?.italic ?? Boolean(layout.italic),
    underline: element.textStyle?.underline ?? false,
    fontFamily: fontFamilyOverride || projectFontFamily,
    fontFamilyOverride,
  }
}

export function mergeElementTextStyle(
  current: ScriptElementTextStyle | undefined,
  patch: Partial<ScriptElementTextStyle>,
): ScriptElementTextStyle | undefined {
  const merged = { ...current, ...patch }
  if (!merged.fontFamily) {
    delete merged.fontFamily
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

export type TextRun = NonNullable<ScriptElement['textRuns']>[number]
export type TextSegment = { text: string; style: ScriptElementTextStyle }
export const maxTextRuns = 10000
export class TextRunLimitError extends Error {
  constructor() { super('局部文字标注过多，请拆分段落。'); this.name = 'TextRunLimitError' }
}

export function normalizeTextRuns(value: unknown, length: number): TextRun[] | undefined {
  return normalizeRuns(value, length, maxTextRuns)
}

function normalizeRuns(value: unknown, length: number, limit: number): TextRun[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.length > limit) throw new TextRunLimitError()
  const result: TextRun[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue
    const { start, end } = candidate
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || start >= length) continue
    const style: ScriptElementTextStyle = {}
    for (const key of ['bold', 'italic', 'underline'] as const) {
      if (typeof candidate[key] === 'boolean') style[key] = candidate[key]
    }
    if (typeof candidate.fontFamily === 'string' && cleanFontFamily(candidate.fontFamily)) style.fontFamily = cleanFontFamily(candidate.fontFamily)
    if (Object.keys(style).length) result.push({ start, end: Math.min(end, length), ...style })
  }
  return result.length ? result : undefined
}

export function textSegments(element: Pick<ScriptElement, 'text' | 'textRuns'>, start = 0, end = element.text.length, overlay?: TextRun): TextSegment[] {
  return segmentText(element, start, end, maxTextRuns, overlay)
}

export function layoutTextSegments(element: Pick<ScriptElement, 'text' | 'textRuns'>, start = 0, end = element.text.length): TextSegment[] {
  // Combining two valid paragraphs and expanding their endpoints can create 4N+2 display ranges.
  return segmentText(element, start, end, maxTextRuns * 4 + 4)
}

function segmentText(element: Pick<ScriptElement, 'text' | 'textRuns'>, start: number, end: number, limit: number, overlay?: TextRun): TextSegment[] {
  start = Math.max(0, Math.min(element.text.length, start))
  end = Math.max(start, Math.min(element.text.length, end))
  if (start === end) return []
  const runs = normalizeRuns(element.textRuns, element.text.length, limit) ?? []
  if (overlay) runs.push(...(normalizeTextRuns([overlay], element.text.length) ?? []))
  if (!runs.length) return [{ text: element.text.slice(start, end), style: {} }]
  const edges = [0]
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const item of segmenter.segment(element.text)) edges.push(item.index + item.segment.length)
  const edgeAt = (offset: number, roundUp: boolean) => {
    let low = 0, high = edges.length - 1
    while (low < high) { const middle = (low + high) >>> 1; if (edges[middle] < offset) low = middle + 1; else high = middle }
    return edges[low] === offset || roundUp ? edges[low] : edges[Math.max(0, low - 1)]
  }
  const events = new Map<number, Array<{ index: number; active: boolean }>>()
  const addEvent = (at: number, index: number, active: boolean) => { const list = events.get(at) ?? []; list.push({ index, active }); events.set(at, list) }
  runs.forEach((run, index) => {
    const from = Math.max(start, edgeAt(run.start, false)), to = Math.min(end, edgeAt(run.end, true))
    if (from < to) { addEvent(from, index, true); addEvent(to, index, false) }
  })
  const boundaries = [...new Set([start, end, ...events.keys()])].sort((a, b) => a - b)
  const active = new Set<number>()
  const keys = ['bold', 'italic', 'underline', 'fontFamily'] as const
  const heaps = { bold: [] as number[], italic: [] as number[], underline: [] as number[], fontFamily: [] as number[] }
  const result: TextSegment[] = []
  // Each property has its own last-run-wins heap; expired entries are removed lazily.
  boundaries.slice(0, -1).forEach((from, position) => {
    for (const event of events.get(from) ?? []) {
      if (!event.active) { active.delete(event.index); continue }
      active.add(event.index)
      for (const key of keys) if (runs[event.index][key] !== undefined) heapPush(heaps[key], event.index)
    }
    const style: ScriptElementTextStyle = {}
    for (const key of keys) {
      const heap = heaps[key]
      while (heap.length && !active.has(heap[0])) heapPop(heap)
      if (heap.length) Object.assign(style, { [key]: runs[heap[0]][key] })
    }
    const text = element.text.slice(from, boundaries[position + 1])
    const previous = result[result.length - 1]
    if (previous && keys.every(key => previous.style[key] === style[key])) previous.text += text
    else result.push({ text, style })
  })
  return result
}

function heapPush(heap: number[], value: number) {
  let index = heap.length
  heap.push(value)
  while (index > 0) { const parent = (index - 1) >>> 1; if (heap[parent] >= value) break; heap[index] = heap[parent]; index = parent }
  heap[index] = value
}

function heapPop(heap: number[]) {
  const value = heap.pop()!
  if (!heap.length) return
  let index = 0
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1
    if (child + 1 < heap.length && heap[child + 1] > heap[child]) child++
    if (heap[child] <= value) break
    heap[index] = heap[child]; index = child
  }
  heap[index] = value
}

export function patchTextRange(element: ScriptElement, start: number, end: number, patch: ScriptElementTextStyle): ScriptElement {
  const segments = textSegments(element, 0, element.text.length, { start, end, ...patch })
  let offset = 0
  const textRuns = segments.flatMap(segment => {
    const from = offset
    offset += segment.text.length
    return Object.keys(segment.style).length ? [{ start: from, end: offset, ...segment.style }] : []
  })
  if (textRuns.length > maxTextRuns) throw new TextRunLimitError()
  return { ...element, textRuns: textRuns.length ? textRuns : undefined }
}

export function remapTextRuns(element: ScriptElement, nextText: string): ScriptElement['textRuns'] {
  if (!element.textRuns || element.text === nextText) return element.textRuns
  let prefix = 0
  while (prefix < Math.min(element.text.length, nextText.length) && element.text[prefix] === nextText[prefix]) prefix++
  let suffix = 0
  while (suffix < Math.min(element.text.length, nextText.length) - prefix && element.text[element.text.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix++
  const oldEnd = element.text.length - suffix
  const delta = nextText.length - element.text.length
  return normalizeTextRuns(element.textRuns.flatMap(run => {
    if (run.end <= prefix) return [run]
    if (run.start >= oldEnd) return [{ ...run, start: run.start + delta, end: run.end + delta }]
    return [{ ...run, start: Math.min(run.start, prefix), end: run.end >= oldEnd ? run.end + delta : prefix }]
  }), nextText.length)
}

export function sliceElementText(element: ScriptElement, start: number, end: number) {
  return { ...element, text: element.text.slice(start, end), textRuns: normalizeTextRuns((element.textRuns ?? []).map(run => ({ ...run, start: Math.max(0, run.start - start), end: Math.min(end, run.end) - start })), end - start) }
}
