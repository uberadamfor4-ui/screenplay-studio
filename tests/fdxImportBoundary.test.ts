import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { buildFdx, parseFdx } from '../src/fdx'
import { resolveElementTextStyle, textSegments } from '../src/textStyles'
import { getFormat, resolveElementLayout } from '../src/formats'

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: XmlDomParser })

test('FDX style offsets follow CRLF normalization across Text node boundaries', () => {
  const source = '<FinalDraft><Content><Paragraph Type="Action"><Text>甲&#13;</Text><Text Style="Bold" Font="SimSun">&#10;乙</Text><Text Style="Italic" Font="SimHei">丙</Text></Paragraph></Content></FinalDraft>'
  let project = parseFdx(source)
  for (let pass = 0; pass < 3; pass++) {
    const element = project.elements[0]
    assert.equal(element.text, '甲\n乙丙')
    const parts = textSegments(element)
    const second = parts.find(part => part.text.includes('乙'))!
    const third = parts.find(part => part.text.includes('丙'))!
    assert.equal(second.style.bold, true)
    assert.equal(second.style.fontFamily, 'SimSun')
    assert.equal(third.style.bold, false)
    assert.equal(third.style.italic, true)
    assert.equal(third.style.fontFamily, 'SimHei')
    project = parseFdx(buildFdx(project))
  }
})

test('seeded FDX node-boundary normalization keeps per-character style and font ownership', () => {
  let seed = 1037
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed }
  const tokens = ['甲', '\r', '\n', '乙', '😀', 'e\u0301', '𠮷', '\u2028', '\u2029', '&', '<', ' ']
  const fonts = ['', 'SimSun', 'SimHei']
  // Character references keep XML parser line-ending rules out of the oracle.
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\u2028/g, '&#8232;').replace(/\u2029/g, '&#8233;')
  for (let sample = 0; sample < 300; sample++) {
    const pieces = Array.from({ length: 1 + next() % 30 }, (_, index) => ({
      text: (index === 0 ? '甲' : '') + Array.from({ length: next() % 5 }, () => tokens[next() % tokens.length]).join(''),
      bold: Boolean(next() % 2), italic: Boolean(next() % 2), underline: Boolean(next() % 2), font: fonts[next() % fonts.length],
    }))
    const source = '<FinalDraft><Content><Paragraph Type="Action">' + pieces.map(piece => {
      const style = [piece.bold ? 'Bold' : '', piece.italic ? 'Italic' : '', piece.underline ? 'Underline' : ''].filter(Boolean).join('+')
      return `<Text Style="${style}" Font="${piece.font}">${escape(piece.text)}</Text>`
    }).join('') + '</Paragraph></Content></FinalDraft>'
    const units = pieces.flatMap(piece => piece.text.split('').map(character => ({ character, piece })))
    const expected: unknown[][] = []
    for (let index = 0; index < units.length; index++) {
      const { character, piece } = units[index]
      expected.push([/[\r\u2028\u2029]/u.test(character) ? '\n' : character, piece.bold, piece.italic, piece.underline, piece.font || 'Courier Prime'])
      if (character === '\r' && units[index + 1]?.character === '\n') index++
    }
    const retainedLength = expected.map(unit => unit[0]).join('').trimEnd().length
    expected.splice(retainedLength)
    let project = parseFdx(source)
    for (let pass = 0; pass < 2; pass++) {
      const element = project.elements[0]
      const base = resolveElementTextStyle(element, resolveElementLayout(element, getFormat(project.formatId)), project.fontFamily)
      const actual = textSegments(element).flatMap(part => part.text.split('').map(character => {
        const style = { ...base, ...part.style }
        return [character, style.bold, style.italic, style.underline, style.fontFamily]
      }))
      assert.deepEqual(actual, expected, `sample ${sample}, pass ${pass}, source ${JSON.stringify(source)}`)
      project = parseFdx(buildFdx(project))
    }
  }
})
