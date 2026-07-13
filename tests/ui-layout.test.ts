import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const cssPath = new URL('../src/App.css', import.meta.url)

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
