import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const { addBoundedTextBytes, inspectDocxArchive } = require('../electron/documentSafety.cjs')

async function buildDocx(extraFiles: Record<string, string> = {}) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types />')
  zip.file('word/document.xml', '<document><body><p>剧本文字</p></body></document>')
  Object.entries(extraFiles).forEach(([name, value]) => zip.file(name, value))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

test('DOCX preflight accepts a bounded screenplay document', async () => {
  const report = await inspectDocxArchive(await buildDocx())
  assert.ok(report.entries >= 2)
  assert.ok(report.totalUncompressedBytes > 0)
})

test('DOCX preflight rejects excessive archive entries before extraction', async () => {
  const buffer = await buildDocx({
    'word/a.xml': '<a />',
    'word/b.xml': '<b />',
  })
  await assert.rejects(
    inspectDocxArchive(buffer, { maxEntries: 3 }),
    /过多内部项目/,
  )
})

test('DOCX preflight rejects highly compressed oversized content', async () => {
  const buffer = await buildDocx({
    'word/large.xml': 'A'.repeat(64 * 1024),
  })
  await assert.rejects(
    inspectDocxArchive(buffer, { maxUncompressedBytes: 16 * 1024 }),
    /解压后过大/,
  )
})

test('DOCX preflight rejects an arbitrary ZIP without Word structure', async () => {
  const zip = new JSZip()
  zip.file('payload.txt', 'not a document')
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await assert.rejects(inspectDocxArchive(buffer), /缺少必要/)
})

test('multi-file text batches enforce one aggregate IPC memory budget', () => {
  const first = addBoundedTextBytes(0, '中'.repeat(10), 64)
  assert.equal(first, 30)
  assert.throws(() => addBoundedTextBytes(first, '文'.repeat(12), 64), /合计超过/u)
})
