import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { buildFdx, parseFdx } from '../src/fdx'
import { createDefaultProject } from '../src/sample'
import { createElement, getFormat, resolveElementLayout } from '../src/formats'
import { fontKey } from '../src/fontFamilies'
import { resolveElementTextStyle, textSegments } from '../src/textStyles'
import type { ScriptElement, ScriptElementTextStyle, ScriptProject } from '../src/types'

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: XmlDomParser })

function effectiveSignature(project: ScriptProject, element: ScriptElement) {
  const style = resolveElementTextStyle(element, resolveElementLayout(element, getFormat(project.formatId)), project.fontFamily)
  return textSegments(element).flatMap(segment => Array.from(segment.text).map(character => {
    const effective = { ...style, ...segment.style }
    return [character, effective.bold, effective.italic, effective.underline, fontKey(effective.fontFamily)]
  }))
}

test('seeded multilingual FDX roundtrips retain effective positive and negative emphasis and fonts', () => {
  let seed = 1037
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed }
  const tokens = ['中', 'A', 'e\u0301', '𠮷', '😀', '\n', '&', '<', '"', '…', ' ', '�']
  const families = ['Courier Prime', 'SimSun', 'SimHei', 'Songti SC', 'A & B']
  const formatIds = ['hollywood', 'eastAsia', 'stage', 'audio'] as const
  const types = ['action', 'scene', 'character', 'dialogue', 'transition', 'note', 'section'] as const
  const randomStyle = (): ScriptElementTextStyle => {
    const style: ScriptElementTextStyle = {}
    for (const key of ['bold', 'italic', 'underline'] as const) { const value = next() % 3; if (value < 2) style[key] = Boolean(value) }
    if (next() % 3 === 0) style.fontFamily = families[next() % families.length]
    return style
  }
  for (let sample = 0; sample < 180; sample++) {
    const project = { ...createDefaultProject(), formatId: formatIds[next() % 4], fontFamily: families[next() % families.length] }
    project.elements = Array.from({ length: 6 }, () => {
      const text = Array.from({ length: 1 + next() % 16 }, () => tokens[next() % tokens.length]).join('') + '。'
      return { ...createElement(types[next() % types.length], text), textStyle: randomStyle(), textRuns: Array.from({ length: next() % 6 }, () => {
        const start = next() % text.length
        return { start, end: Math.min(text.length, start + 1 + next() % 8), ...randomStyle() }
      }) }
    })
    const before = JSON.stringify(project), expected = project.elements.map(element => effectiveSignature(project, element))
    let reopened = parseFdx(buildFdx(project))
    for (let pass = 0; pass < 3; pass++) {
      assert.deepEqual(reopened.elements.map(element => effectiveSignature(reopened, element)), expected, `sample ${sample}, pass ${pass}`)
      reopened = parseFdx(buildFdx(reopened))
    }
    assert.equal(JSON.stringify(project), before)
  }
})
