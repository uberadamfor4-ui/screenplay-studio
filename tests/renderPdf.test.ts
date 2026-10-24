import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { renderPdf } = require('../electron/renderPdf.cjs')
const { coverBoundsScript } = require('../electron/printSafety.cjs')

function fixture(failAt?: 'write' | 'load' | 'fonts' | 'cover' | 'print') {
  const state = { options: [] as unknown[], files: new Map<string, string>(), removed: [] as string[], destroyed: 0, printed: 0 }
  class Window {
    dead = false
    constructor(options: unknown) { state.options.push(options) }
    async loadFile(file: string) {
      assert.ok(state.files.has(file))
      if (failAt === 'load') throw Error('load failed')
    }
    webContents = {
      async executeJavaScript(source: string) {
        if (source === coverBoundsScript) return failAt !== 'cover'
        if (failAt === 'fonts') throw Error('font failed')
        return true
      },
      async printToPDF(options: unknown) {
        state.printed++
        assert.deepEqual(options, { printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } })
        if (failAt === 'print') throw Error('print failed')
        return Buffer.from('%PDF-synthetic')
      },
    }
    isDestroyed() { return this.dead }
    destroy() { this.dead = true; state.destroyed++ }
  }
  const options = {
    app: { isPackaged: false, getPath: (key: string) => { assert.equal(key, 'temp'); return path.resolve('tmp', 'synthetic print') } },
    BrowserWindow: Window,
    io: {
      async writeFile(file: string, html: string, encoding: string) {
        assert.equal(encoding, 'utf8')
        if (failAt === 'write') throw Error('write failed')
        state.files.set(file, html)
      },
      async unlink(file: string) { state.removed.push(file) },
    },
  }
  return { state, options }
}

test('PDF acceptance and production share hidden offscreen rendering, font replacement and cleanup', async () => {
  const { state, options } = fixture()
  const pdf = await renderPdf('中文 {{SCREENPLAY_CJK_REGULAR_FONT_URL}} {{SCREENPLAY_CJK_BOLD_FONT_URL}}', options)
  assert.equal(pdf.toString(), '%PDF-synthetic')
  assert.deepEqual(state.options, [{ width: 900, height: 1200, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true } }])
  const [file, html] = [...state.files.entries()][0]
  assert.ok(html.includes('中文') && html.includes('file:') && html.includes('ScreenplayCJK-Regular.otf') && html.includes('ScreenplayCJK-Bold.otf'))
  assert.ok(!html.includes('{{SCREENPLAY_'))
  assert.deepEqual(state.removed, [file])
  assert.equal(state.destroyed, 1)
})

for (const stage of ['write', 'load', 'fonts', 'cover', 'print'] as const) {
  test(`PDF ${stage} failure rejects, destroys its hidden window and cleans its own temporary file`, async () => {
    const { state, options } = fixture(stage)
    await assert.rejects(renderPdf('synthetic', options))
    assert.equal(state.destroyed, 1)
    assert.equal(state.removed.length, 1)
    assert.equal(state.printed, stage === 'print' ? 1 : 0)
  })
}

test('concurrent PDF exports keep distinct temporary documents and balanced window lifetimes', async () => {
  const { state, options } = fixture()
  await Promise.all([renderPdf('first synthetic', options), renderPdf('second synthetic', options)])
  assert.equal(state.files.size, 2)
  assert.equal(state.destroyed, 2)
  assert.deepEqual([...state.files.values()].sort(), ['first synthetic', 'second synthetic'])
  assert.deepEqual([...state.files.keys()].sort(), state.removed.sort())
})
