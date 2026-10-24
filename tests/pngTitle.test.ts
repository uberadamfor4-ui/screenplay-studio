import assert from 'node:assert/strict'
import test from 'node:test'
import { renderPngPages } from '../src/pngExport'
import { createDefaultProject } from '../src/sample'
import { createElement, getFormat } from '../src/formats'

type DrawCall = { text: string; x: number; y: number; width: number; align: string }
async function withCanvas(run: (canvases: Array<{ calls: DrawCall[]; underlines: number }>) => Promise<void>) {
  const original = globalThis.document
  const canvases: Array<{ calls: DrawCall[]; underlines: number }> = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => {
      const canvas = { calls: [] as DrawCall[], underlines: 0, width: 0, height: 0, toDataURL: () => 'data:image/png;base64,QA', getContext: () => context }
      const context = {
        textAlign: 'left', font: '', fillStyle: '', textBaseline: '', fontKerning: '', fontVariantCaps: '',
        measureText: (text: string) => ({ width: Array.from(text).reduce((sum, character) => sum + (character.charCodeAt(0) > 255 ? 16 : 9.6), 0) }),
        fillText(text: string, x: number, y: number) { canvas.calls.push({ text, x, y, width: context.measureText(text).width, align: context.textAlign }) },
        scale() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { canvas.underlines++ },
      }
      canvases.push(canvas)
      return canvas
    },
  } })
  try { await run(canvases) } finally { Object.defineProperty(globalThis, 'document', { configurable: true, value: original }) }
}

const projectFor = (title: string) => {
  const project = createDefaultProject()
  project.titlePage = { enabled: true, title, credit: 'Written by', authors: 'QA', basedOn: '', contact: '', draftDate: '', copyright: '' }
  project.elements = [createElement('action', 'Body.')]
  project.exportSettings = { ...project.exportSettings!, includeTitlePage: true }
  return project
}

test('PNG cover wraps long Chinese titles within asymmetric print margins without changing the source', async () => {
  await withCanvas(async canvases => {
    const project = projectFor('用于验证长标题不会在图片封面中被裁切的虚构剧本'.repeat(5))
    const before = JSON.stringify(project), format = getFormat('hollywood')
    await renderPngPages(project, format)
    const cover = canvases.find(canvas => canvas.calls.some(call => call.text.includes('用于验证')))!
    const title = cover.calls.slice(0, cover.calls.findIndex(call => call.text === 'Written by'))
    assert.ok(title.length > 1)
    assert.equal(title.map(call => call.text).join(''), project.titlePage!.title)
    assert.equal(cover.underlines, title.length)
    for (const call of title) {
      assert.ok(call.x - call.width / 2 >= format.page.marginLeft - 0.01)
      assert.ok(call.x + call.width / 2 <= format.page.width - format.page.marginRight + 0.01)
    }
    assert.equal(JSON.stringify(project), before)
  })
})

test('PNG cover preserves explicit title line breaks and moves credits below all title lines', async () => {
  await withCanvas(async canvases => {
    const project = projectFor('First line\nSecond line')
    await renderPngPages(project, getFormat('hollywood'))
    const cover = canvases.find(canvas => canvas.calls.some(call => call.text === 'FIRST LINE'))!
    const first = cover.calls.find(call => call.text === 'FIRST LINE')!, second = cover.calls.find(call => call.text === 'SECOND LINE')!
    assert.equal(second.y - first.y, 16)
    assert.ok(cover.calls.find(call => call.text === 'Written by')!.y >= second.y + 40)
    assert.equal(first.x, (144 + 816 - 96) / 2)
  })
})

test('PNG cover rejects vertical overflow before emitting any page instead of clipping content', async () => {
  await withCanvas(async () => {
    let emitted = 0
    const project = projectFor('TITLE\n'.repeat(100))
    await assert.rejects(renderPngPages(project, getFormat('hollywood'), () => { emitted++ }), /SCREENPLAY_COVER_OVERFLOW/u)
    assert.equal(emitted, 0)
  })
})

test('PNG cover wraps complete author and source fields within the printable region', async () => {
  await withCanvas(async canvases => {
    const project = projectFor('SHORT')
    project.titlePage!.authors = 'A'.repeat(180)
    project.titlePage!.basedOn = 'B'.repeat(90)
    await renderPngPages(project, getFormat('hollywood'))
    const cover = canvases.find(canvas => canvas.calls.some(call => call.text === 'SHORT'))!
    for (const value of ['A', 'B']) {
      const calls = cover.calls.filter(call => new RegExp(`^${value}+$`).test(call.text))
      assert.ok(calls.length > 1)
      assert.equal(calls.map(call => call.text).join(''), value === 'A' ? project.titlePage!.authors : project.titlePage!.basedOn)
      assert.ok(calls.every(call => call.x - call.width / 2 >= 144 - 0.01 && call.x + call.width / 2 <= 720 + 0.01))
    }
  })
})

test('PNG contact and copyright wrap in separate bottom-aligned columns without clipping or collision', async () => {
  await withCanvas(async canvases => {
    const project = projectFor('SHORT')
    project.titlePage!.contact = 'c'.repeat(180) + '@example.invalid'
    project.titlePage!.draftDate = '2026-10-22'
    project.titlePage!.copyright = 'R'.repeat(150)
    const before = JSON.stringify(project)
    await renderPngPages(project, getFormat('hollywood'))
    const cover = canvases.find(canvas => canvas.calls.some(call => call.text === 'SHORT'))!
    const left = cover.calls.filter(call => call.align === 'left' && call.text)
    const right = cover.calls.filter(call => call.align === 'right' && call.text)
    assert.ok(left.length > 1); assert.ok(right.length > 2)
    assert.equal(left.map(call => call.text).join(''), project.titlePage!.contact)
    assert.equal(right.map(call => call.text).join(''), project.titlePage!.draftDate + project.titlePage!.copyright)
    assert.ok(left.every(call => call.x >= 144 && call.x + call.width <= 420 + 0.01))
    assert.ok(right.every(call => call.x - call.width >= 444 - 0.01 && call.x <= 720))
    assert.equal(Math.max(...left.map(call => call.y)) + 16, 960)
    assert.equal(Math.max(...right.map(call => call.y)) + 16, 960)
    assert.equal(JSON.stringify(project), before)
  })
})

test('PNG excessive footer metadata rejects the whole cover before drawing or emitting pages', async () => {
  await withCanvas(async canvases => {
    const project = projectFor('SHORT')
    project.titlePage!.contact = 'contact\n'.repeat(100)
    let emitted = 0
    await assert.rejects(renderPngPages(project, getFormat('hollywood'), () => { emitted++ }), /SCREENPLAY_COVER_OVERFLOW/u)
    assert.equal(emitted, 0)
    assert.ok(canvases.every(canvas => canvas.calls.length === 0))
  })
})
