const JSZip = require('jszip')
const { TextDecoder } = require('node:util')

const defaultDocxLimits = Object.freeze({
  maxEntries: 4096,
  maxEntryNameLength: 2048,
  maxUncompressedBytes: 64 * 1024 * 1024,
})

const fileByteLimits = Object.freeze({
  project: 32 * 1024 * 1024,
  fdx: 16 * 1024 * 1024,
  import: 8 * 1024 * 1024,
  document: 25 * 1024 * 1024,
})

async function inspectDocxArchive(buffer, limits = {}) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('Word 文件数据无效。')
  }

  const effectiveLimits = { ...defaultDocxLimits, ...limits }
  let archive
  try {
    archive = await JSZip.loadAsync(buffer, {
      checkCRC32: false,
      createFolders: false,
    })
  } catch {
    throw new Error('Word 文件已损坏、受密码保护，或不是有效的 DOCX 文件。')
  }

  const entries = Object.values(archive.files)
  if (entries.length > effectiveLimits.maxEntries) {
    throw new Error('Word 文件包含过多内部项目，已停止导入以防止软件卡死。')
  }

  if (!archive.file('[Content_Types].xml') || !archive.file('word/document.xml')) {
    throw new Error('Word 文件缺少必要的 DOCX 正文结构。')
  }

  let totalUncompressedBytes = 0
  for (const entry of entries) {
    if (entry.name.length > effectiveLimits.maxEntryNameLength) {
      throw new Error('Word 文件包含异常的内部路径，已停止导入。')
    }

    const entryBytes = entry.dir ? 0 : Number(entry._data?.uncompressedSize)
    if (!Number.isSafeInteger(entryBytes) || entryBytes < 0) {
      throw new Error('无法确认 Word 文件的解压大小，已停止导入。')
    }

    totalUncompressedBytes += entryBytes
    if (!Number.isSafeInteger(totalUncompressedBytes) || totalUncompressedBytes > effectiveLimits.maxUncompressedBytes) {
      throw new Error('Word 文件解压后过大，已停止导入以防止软件卡死。')
    }
  }

  return {
    entries: entries.length,
    totalUncompressedBytes,
  }
}

function addBoundedTextBytes(currentBytes, value, maxBytes) {
  if (!Number.isSafeInteger(currentBytes) || currentBytes < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('文本批次上限无效。')
  }
  if (typeof value !== 'string') {
    throw new Error('文本批次内容无效。')
  }
  const nextBytes = currentBytes + Buffer.byteLength(value, 'utf8')
  if (!Number.isSafeInteger(nextBytes) || nextBytes > maxBytes) {
    throw new Error(`所选文件正文合计超过 ${Math.round(maxBytes / 1024 / 1024)} MB，请分批检查。`)
  }
  return nextBytes
}

function getFileByteLimit(extension) {
  const normalized = String(extension ?? '').toLowerCase()
  if (normalized === '.docx' || normalized === '.pdf') return fileByteLimits.document
  if (normalized === '.ssproj' || normalized === '.json') return fileByteLimits.project
  if (normalized === '.fdx') return fileByteLimits.fdx
  return fileByteLimits.import
}

function decodeTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('文本文件数据无效。')
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer)
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer)
  }

  const inferredUtf16 = inferBomlessUtf16Encoding(buffer)
  if (inferredUtf16) {
    return new TextDecoder(inferredUtf16).decode(buffer)
  }

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length
  if (replacementCount > 0) {
    try {
      return new TextDecoder('gb18030').decode(buffer)
    } catch {
      return utf8
    }
  }

  return utf8
}

function inferBomlessUtf16Encoding(buffer) {
  if (buffer.length < 4 || buffer.length % 2 !== 0) return undefined

  let evenNulls = 0
  let oddNulls = 0
  const pairs = Math.min(Math.floor(buffer.length / 2), 4096)
  for (let index = 0; index < pairs * 2; index += 2) {
    if (buffer[index] === 0) evenNulls += 1
    if (buffer[index + 1] === 0) oddNulls += 1
  }

  const strongSignal = Math.max(2, Math.ceil(pairs * 0.3))
  const weakSideLimit = Math.floor(pairs * 0.05)
  if (oddNulls >= strongSignal && evenNulls <= weakSideLimit) return 'utf-16le'
  if (evenNulls >= strongSignal && oddNulls <= weakSideLimit) return 'utf-16be'
  return undefined
}

module.exports = {
  addBoundedTextBytes,
  decodeTextBuffer,
  defaultDocxLimits,
  fileByteLimits,
  getFileByteLimit,
  inspectDocxArchive,
}
