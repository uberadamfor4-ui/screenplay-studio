import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const cssPath = new URL('../src/App.css', import.meta.url)
const appPath = new URL('../src/App.tsx', import.meta.url)
const productionCssPath = new URL('../src/ProductionWorkspace.css', import.meta.url)
const productionPath = new URL('../src/ProductionWorkspace.tsx', import.meta.url)

test('scaled screenplay previews keep real layout space', async () => {
  const css = await readFile(cssPath, 'utf8')

  assert.match(css, /\.script-page\s*\{[^}]*zoom:\s*0\.34/s)
  assert.match(css, /\.format-preview-dialog \.script-page\s*\{[^}]*zoom:\s*0\.28/s)
  assert.doesNotMatch(css, /\.script-page\s*\{[^}]*margin-bottom:\s*-/s)
})

test('tutorial center uses one bounded content layout', async () => {
  const css = await readFile(cssPath, 'utf8')

  assert.match(css, /\.tutorial-dialog \.tool-dialog-body\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.tutorial-center\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s)
  assert.match(css, /\.tutorial-nav\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s)
  assert.match(css, /\.tutorial-article\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s)
})

test('modal backdrops stay above floating menus', async () => {
  const css = await readFile(cssPath, 'utf8')
  const toolbarLayer = Number(css.match(/\.advanced-toolbar\s*\{[^}]*z-index:\s*(\d+)/s)?.[1])
  const modalLayer = Number(css.match(/\.preferences-backdrop\s*\{[^}]*z-index:\s*(\d+)/s)?.[1])

  assert.ok(modalLayer > toolbarLayer)
})

test('long dialogs keep their headers visible and suspend background shortcuts', async () => {
  const [css, app] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(appPath, 'utf8'),
  ])

  assert.match(css, /\.assistive-dialog > header,[\s\S]*position:\s*sticky/)
  assert.match(app, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/)
  assert.match(app, /event\.key === 'Tab'/)
})

test('collapsed production navigation and tables remain usable', async () => {
  const [css, source] = await Promise.all([
    readFile(productionCssPath, 'utf8'),
    readFile(productionPath, 'utf8'),
  ])

  assert.match(source, /aria-label=\{item\.label\} title=\{item\.label\}/)
  assert.match(source, /这个场次还没有镜头/)
  assert.match(css, /\.data-table\s*\{[^}]*overflow-x:\s*auto/s)
  assert.match(css, /\.data-table > \.table-head,[\s\S]*min-width:\s*720px/)
})
