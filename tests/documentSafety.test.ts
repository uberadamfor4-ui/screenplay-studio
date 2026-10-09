import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const {
  addBoundedTextBytes,
  decodeTextBuffer,
  fileByteLimits,
  getFileByteLimit,
  inspectDocxArchive,
} = require('../electron/documentSafety.cjs')

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

test('Word import preserves multilingual paragraphs and escaped characters with the patched XML parser', async () => {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>内景 咖啡馆 - 夜</w:t></w:r></w:p><w:p><w:r><w:t>繁體中文 English 日本語 한국어 &amp; &lt;对白&gt;</w:t></w:r></w:p></w:body></w:document>')
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await inspectDocxArchive(buffer)
  const result = await require('mammoth').extractRawText({ buffer })
  assert.equal(result.value, '内景 咖啡馆 - 夜\n\n繁體中文 English 日本語 한국어 & <对白>\n\n')
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

test('DOCX preflight rejects forged ZIP sizes while streaming instead of trusting directory metadata', async () => {
  const buffer = await buildDocx({ 'word/document.xml': 'A'.repeat(1024 * 1024) })
  const endOfDirectory = buffer.length - 22
  assert.equal(buffer.readUInt32LE(endOfDirectory), 0x06054b50)
  let offset = buffer.readUInt32LE(endOfDirectory + 16)
  let forged = false
  while (buffer.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = buffer.readUInt16LE(offset + 28)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString()
    if (name === 'word/document.xml') {
      const localHeader = buffer.readUInt32LE(offset + 42)
      buffer.writeUInt32LE(1, offset + 24)
      buffer.writeUInt32LE(1, localHeader + 22)
      forged = true
      break
    }
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
  assert.equal(forged, true)
  await assert.rejects(inspectDocxArchive(buffer), /实际解压大小/)
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

test('text decoder recognizes common BOM-less UTF-16 files', () => {
  const utf16Le = Buffer.from('INT. ROOM - DAY\r\nHello', 'utf16le')
  const utf16Be = Buffer.from(utf16Le)
  for (let index = 0; index < utf16Be.length; index += 2) {
    const first = utf16Be[index]
    utf16Be[index] = utf16Be[index + 1]
    utf16Be[index + 1] = first
  }

  assert.equal(decodeTextBuffer(utf16Le), 'INT. ROOM - DAY\r\nHello')
  assert.equal(decodeTextBuffer(utf16Be), 'INT. ROOM - DAY\r\nHello')
  assert.equal(decodeTextBuffer(Buffer.from('外景 河岸 - 白天', 'utf8')), '外景 河岸 - 白天')
})

test('save and open byte limits stay aligned by file type', () => {
  assert.equal(getFileByteLimit('.ssproj'), fileByteLimits.project)
  assert.equal(getFileByteLimit('.json'), fileByteLimits.project)
  assert.equal(getFileByteLimit('.fdx'), fileByteLimits.fdx)
  assert.equal(getFileByteLimit('.docx'), fileByteLimits.document)
  assert.equal(getFileByteLimit('.pdf'), fileByteLimits.document)
  assert.equal(getFileByteLimit('.txt'), fileByteLimits.import)
})
