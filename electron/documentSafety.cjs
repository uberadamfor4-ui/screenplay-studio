const JSZip = require('jszip')

const defaultDocxLimits = Object.freeze({
  maxEntries: 4096,
  maxEntryNameLength: 2048,
  maxUncompressedBytes: 64 * 1024 * 1024,
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

module.exports = {
  addBoundedTextBytes,
  defaultDocxLimits,
  inspectDocxArchive,
}
