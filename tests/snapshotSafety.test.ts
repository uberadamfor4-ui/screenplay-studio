import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  isIgnorableSnapshotReadError,
  readBoundedJsonFile,
  snapshotTooLargeCode,
} = require('../electron/snapshotSafety.cjs')

test('bounded snapshot reader accepts valid JSON and rejects oversized recovery data before parsing', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'screenplay-snapshot-'))
  try {
    const validPath = join(folder, 'valid.json')
    await writeFile(validPath, JSON.stringify({ savedAt: '2026-08-05', project: { elements: [] } }), 'utf8')
    assert.deepEqual(await readBoundedJsonFile(validPath, 1024), {
      savedAt: '2026-08-05',
      project: { elements: [] },
    })

    const oversizedPath = join(folder, 'oversized.json')
    await writeFile(oversizedPath, ' '.repeat(2048), 'utf8')
    await assert.rejects(
      readBoundedJsonFile(oversizedPath, 1024),
      (error: NodeJS.ErrnoException) => error.code === snapshotTooLargeCode && isIgnorableSnapshotReadError(error),
    )
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('corrupt and missing snapshot files are classified as recoverable startup conditions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'screenplay-snapshot-'))
  try {
    const corruptPath = join(folder, 'corrupt.json')
    await writeFile(corruptPath, '{broken', 'utf8')
    await assert.rejects(
      readBoundedJsonFile(corruptPath, 1024),
      (error: unknown) => isIgnorableSnapshotReadError(error),
    )
    await assert.rejects(
      readBoundedJsonFile(join(folder, 'missing.json'), 1024),
      (error: unknown) => isIgnorableSnapshotReadError(error),
    )
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
