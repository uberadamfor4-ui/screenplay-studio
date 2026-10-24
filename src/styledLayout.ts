import { layoutTextSegments, type TextSegment } from './textStyles'
import type { ScriptElement, ScriptProject } from './types'
import type { TextMeasurer, TextStyle } from './layoutEngine'

export function inlineDialogueElements(project: ScriptProject): ScriptElement[] {
  if (project.formatId !== 'eastAsia' || project.eastAsianDialogueStyle !== 'inline') return project.elements
  return project.elements.flatMap((element, index) => {
    const next = project.elements[index + 1]
    if (element.type === 'character' && next?.type === 'dialogue' && !element.dualDialogue && !next.dualDialogue) return []
    const cue = project.elements[index - 1]
    if (element.type !== 'dialogue' || cue?.type !== 'character' || cue.dualDialogue || element.dualDialogue) return [element]
    const prefix = `${cue.text.replace(/[:：]\s*$/, '')}：`
    const cueStyle = { bold: cue.textStyle?.bold ?? true, italic: cue.textStyle?.italic ?? false, underline: cue.textStyle?.underline ?? false, fontFamily: cue.textStyle?.fontFamily ?? project.fontFamily }
    const cueRuns = (cue.textRuns ?? []).filter(run => run.start < prefix.length - 1).map(run => ({ ...run, end: Math.min(run.end, prefix.length - 1) }))
    return [{ ...element, text: prefix + element.text, textRuns: [{ start: 0, end: prefix.length, ...cueStyle }, ...cueRuns, ...(element.textRuns ?? []).map(run => ({ ...run, start: run.start + prefix.length, end: run.end + prefix.length }))] }]
  })
}

export function displayElement(element: ScriptElement, uppercase: boolean, language: string) {
  const prefix = element.type === 'scene' ? /^\s*[A-Z]*\d+[A-Z]*\s*[.．、-]\s*/iu.exec(element.text)?.[0].length ?? 0 : 0
  let offset = 0
  const segments = layoutTextSegments(element, prefix)
  const textRuns = segments.flatMap(segment => {
    const start = offset
    offset += uppercase ? segment.text.toLocaleUpperCase(language).length : segment.text.length
    return Object.keys(segment.style).length ? [{ ...segment.style, start, end: offset }] : []
  })
  const text = element.text.slice(prefix)
  return { ...element, text: uppercase ? text.toLocaleUpperCase(language) : text, textRuns: textRuns.length ? textRuns : undefined }
}

export function wrapStyledText(element: ScriptElement, width: number, measure: TextMeasurer, base: TextStyle): { lines: string[]; lineRuns: TextSegment[][] } {
  const segments = layoutTextSegments(element)
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const glyphs = segments.flatMap(segment => Array.from(segmenter.segment(segment.text), item => ({ text: item.segment, style: segment.style, width: measure(item.segment, { ...base, ...segment.style }) })))
  const lines: string[] = [], lineRuns: TextSegment[][] = []
  const prohibitedStart = /^[，。！？；：、）》】」』〕〉］｝’”％‰!?;:,.…]/u
  let start = 0
  const emit = (end: number) => {
    const row = glyphs.slice(start, end).filter(item => item.text !== '\r')
    const parts: TextSegment[] = []
    for (const glyph of row) {
      const last = parts[parts.length - 1]
      if (last && JSON.stringify(last.style) === JSON.stringify(glyph.style)) last.text += glyph.text
      else parts.push({ text: glyph.text, style: glyph.style })
    }
    lines.push(row.map(item => item.text).join('') || ' ')
    lineRuns.push(parts)
  }
  while (start < glyphs.length) {
    if (glyphs[start].text === '\n' || glyphs[start].text === '\r\n') {
      lines.push(' '); lineRuns.push([]); start++
      if (start === glyphs.length) { lines.push(' '); lineRuns.push([]) }
      continue
    }
    let end = start, size = 0, breakAt = -1
    while (end < glyphs.length && glyphs[end].text !== '\n' && glyphs[end].text !== '\r\n') {
      if (end > start && size + glyphs[end].width > width) break
      size += glyphs[end].width
      end++
      if (/\s|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(glyphs[end - 1].text) && !prohibitedStart.test(glyphs[end]?.text ?? '')) breakAt = end
    }
    if (end < glyphs.length && !/[\r\n]/.test(glyphs[end].text) && breakAt > start) end = breakAt
    end = Math.max(start + 1, end)
    emit(end)
    start = end
    if (glyphs[start]?.text === '\n' || glyphs[start]?.text === '\r\n') { start++; if (start === glyphs.length) { lines.push(' '); lineRuns.push([]) } }
  }
  if (!lines.length) { lines.push(' '); lineRuns.push([]) }
  return { lines, lineRuns }
}
