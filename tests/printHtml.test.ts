import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const printHtmlPath = new URL('../src/printHtml.ts', import.meta.url)
const pngExportPath = new URL('../src/pngExport.ts', import.meta.url)

test('PDF furniture keeps header, page number, and footer in separate page regions', async () => {
  const source = await readFile(printHtmlPath, 'utf8')

  assert.match(source, /class="document-header"/u)
  assert.match(source, /class="page-number"/u)
  assert.match(source, /<footer>\$\{escapeHtml\(footer\)\}<\/footer>/u)
  assert.match(source, /\.page-number \{ position: absolute; top: 48px;/u)
  assert.match(source, /footer \{[^\n]*bottom: 48px;/u)
  assert.doesNotMatch(source, /<footer><span>/u)
  assert.match(source, /project\.exportSettings\?\.profileId === 'custom'/u)
})

test('PNG export carries header, footer, page numbering, and title underline', async () => {
  const source = await readFile(pngExportPath, 'utf8')

  assert.match(source, /layout\.settings\.headerText/u)
  assert.match(source, /layout\.settings\.footerText/u)
  assert.match(source, /context\.fillText\(`\$\{page\.label\}\.`/u)
  assert.match(source, /drawUnderline\(context, titleText/u)
})
