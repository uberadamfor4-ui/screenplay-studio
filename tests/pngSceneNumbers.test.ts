import assert from 'node:assert/strict'
import test from 'node:test'
import { renderPngPages } from '../src/pngExport'
import { createDefaultProject } from '../src/sample'
import { getFormat } from '../src/formats'
import type { ScriptProject } from '../src/types'

type Call = { text: string; font: string }
async function paint(project: ScriptProject) {
  const original = globalThis.document, calls: Call[] = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
    const stack: Array<{ font: string; textAlign: string }> = []
    const context = {
      font: '', textAlign: 'left',
      measureText: (text: string) => ({ width: text.length * 8 }),
      fillText(text: string) { calls.push({ text, font: this.font }) },
      save() { stack.push({ font: this.font, textAlign: this.textAlign }) },
      restore() { Object.assign(this, stack.pop()) },
      scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    }
    return { width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,QA' }
  } } })
  try { await renderPngPages(project, getFormat(project.formatId)); return calls } finally { Object.defineProperty(globalThis, 'document', { configurable: true, value: original }) }
}

for (const mode of ['hollywood-rich', 'eastAsia-rich', 'eastAsia-default', 'hollywood-paragraph-override']) {
  test(`PNG scene-number font follows paragraph metadata rather than final inline paint: ${mode}`, async () => {
    const project = createDefaultProject()
    project.fontFamily = 'SimSun'
    project.formatId = mode.startsWith('eastAsia') ? 'eastAsia' : 'hollywood'
    project.pageSize = project.formatId === 'eastAsia' ? 'a4' : 'letter'
    project.exportSettings = { ...project.exportSettings!, profileId: 'custom', sceneNumbers: true, includeTitlePage: false }
    const text = 'INT. TEST - NIGHT'
    project.elements = [{ id: 'scene', type: 'scene', text, sceneNumber: '12A',
      ...(mode.endsWith('rich') ? { textRuns: [{ start: text.indexOf('NIGHT'), end: text.length, fontFamily: 'SimHei', bold: true, italic: true }] } : {}),
      ...(mode.endsWith('override') ? { textStyle: { fontFamily: 'Arial', bold: true, italic: true } } : {}),
    }]
    const before = JSON.stringify(project), calls = await paint(project), numbers = calls.filter(call => call.text === '12A')
    assert.equal(numbers.length, 2)
    for (const number of numbers) {
      assert.equal(/\b(?:700|bold)\b/u.test(number.font), false, 'PDF scene-number metadata uses regular weight')
      assert.equal(/\bitalic\b/u.test(number.font), mode.endsWith('override'), 'Only paragraph-level italic should affect the number')
      assert.ok(number.font.includes(mode.endsWith('override') ? 'Arial' : 'SimSun'))
      assert.ok(!number.font.includes('SimHei'), 'The final local font must not leak into numbering')
    }
    if (mode.endsWith('rich')) assert.ok(calls.some(call => call.text.includes('NIGHT') && /\b700\b/u.test(call.font) && /\bitalic\b/u.test(call.font) && call.font.includes('SimHei')), 'Keep the actual heading emphasis and local font intact')
    assert.equal(JSON.stringify(project), before)
  })
}
