import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { assertBackupDestination } = require('../electron/backupDestination.cjs')
test('independent backups cannot target the source or a hard link to it', async () => {
  const root = path.resolve('tmp')
  await fs.mkdir(root, { recursive: true })
  const folder = await fs.mkdtemp(path.join(root, 'screenplay-backup-'))
  try {
    const original = path.join(folder, 'draft.ssproj'), link = path.join(folder, 'linked.ssproj')
    await fs.writeFile(original, 'original draft')
    await fs.link(original, link)
    await assert.rejects(assertBackupDestination(original, original))
    await assert.rejects(assertBackupDestination(link, original))
    await assertBackupDestination(path.join(folder, 'new-backup.ssproj'), original)
    assert.equal(await fs.readFile(original, 'utf8'), 'original draft')
  } finally { assert.ok(path.resolve(folder).startsWith(root + path.sep)); await fs.rm(folder, { recursive: true, force: true }) }
})
