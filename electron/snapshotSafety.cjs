const fs = require('node:fs/promises')

const snapshotTooLargeCode = 'ERR_SCREENPLAY_SNAPSHOT_TOO_LARGE'

async function readBoundedJsonFile(filePath, maxBytes) {
  const stats = await fs.stat(filePath)
  if (!stats.isFile()) {
    const error = new Error('恢复快照不是普通文件。')
    error.code = 'ERR_SCREENPLAY_SNAPSHOT_NOT_FILE'
    throw error
  }
  if (stats.size > maxBytes) {
    throw snapshotTooLargeError()
  }

  const buffer = await fs.readFile(filePath)
  if (buffer.length > maxBytes) {
    throw snapshotTooLargeError()
  }
  return JSON.parse(buffer.toString('utf8'))
}

function isIgnorableSnapshotReadError(error) {
  return error instanceof SyntaxError
    || error?.code === 'ENOENT'
    || error?.code === snapshotTooLargeCode
    || error?.code === 'ERR_SCREENPLAY_SNAPSHOT_NOT_FILE'
}

function snapshotTooLargeError() {
  const error = new Error('恢复快照过大，已忽略以避免软件卡死。')
  error.code = snapshotTooLargeCode
  return error
}

module.exports = {
  isIgnorableSnapshotReadError,
  readBoundedJsonFile,
  snapshotTooLargeCode,
}
