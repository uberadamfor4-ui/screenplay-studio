import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
const require = createRequire(import.meta.url)
const { buildPortableProject, inspectPortableArchive, extractPortableProject, resolveAsset, readBoundedFile } = require('../electron/portableProject.cjs')
const root = path.resolve('tmp')

test('portable package round-trip keeps relative media, deduplicates assets and never copies fonts', async () => {
  const { mkdir } = await import('node:fs/promises'); await mkdir(root, { recursive: true })
  const base = await mkdtemp(path.join(root, 'portable-'))
  const picture = path.join(base, '分镜 01.png'); const bytes = Buffer.from('image-fixture')
  await writeFile(picture, bytes)
  const project = { elements: [{ id: 's1', type: 'scene', text: 'INT. HOME - DAY' }], fontFamily: 'A commercial font', production: { shots: [{ storyboardPath: picture }], assets: [{ photoPaths: [picture] }] } }
  const original = JSON.stringify(project)
  const packed = await buildPortableProject(original, path.join(base, 'script.ssproj'))
  assert.equal(packed.manifest.assetCount, 1)
  assert.deepEqual(packed.manifest.fonts, ['A commercial font'])
  const inspected = await inspectPortableArchive(packed.bytes)
  assert.equal(inspected.entries.length, 3)
  assert.equal(inspected.content.includes(base.replaceAll('\\', '\\\\')), false)
  const extracted = await extractPortableProject(packed.bytes, base)
  assert.deepEqual(await readFile(path.join(path.dirname(extracted.filePath), 'assets', '000001.png')), bytes)
  assert.equal(JSON.parse(extracted.content).production.shots[0].storyboardPath, 'assets/000001.png')
  assert.equal(JSON.stringify(project), original)
})
test('portable packages explicitly report missing or unsupported attachments', async () => {
  const p = { elements: [], fontFamily: 'Courier', production: { locations: [{ photoPaths: ['https://example.com/a.png', 'D:\\missing-file.png', 'C:\\private.env'] }] } }
  const packed = await buildPortableProject(JSON.stringify(p), 'D:\\project.ssproj')
  assert.equal(packed.manifest.issues.length, 3)
  assert.equal(packed.manifest.assetCount, 0)
  assert.deepEqual(JSON.parse((await inspectPortableArchive(packed.bytes)).content).production.locations[0].photoPaths, ['', '', ''])
  assert.equal(resolveAsset('\\\\server\\share\\x.png', 'D:\\p.ssproj'), undefined)
})
async function archive(extra: Record<string, string>, project = { elements: [] }) {
  const zip = new JSZip()
  zip.file('project.ssproj', JSON.stringify(project))
  zip.file('manifest.json', JSON.stringify({ kind: 'screenplay-portable', version: 1, assetCount: 0, fonts: [], issues: [] }))
  for (const [name, value] of Object.entries(extra)) zip.file(name, value, { createFolders: false })
  return zip.generateAsync({ type: 'nodebuffer' })
}
test('portable archive rejects traversal, arbitrary executables and external asset references', async () => {
  await assert.rejects(inspectPortableArchive(await archive({ '../escape.txt': 'bad' })), /unsafe-path/u)
  await assert.rejects(inspectPortableArchive(await archive({ 'assets/000001.exe': 'bad' })), /unsafe-path/u)
  await assert.rejects(inspectPortableArchive(await archive({}, { elements: [], production: { shots: [{ storyboardPath: 'C:\\secret.png' }] } } as never)), /missing-asset/u)
})
test('portable extraction validates before creating output and leaves existing files untouched', async () => {
  const base = await mkdtemp(path.join(root, 'portable-safe-'))
  const before = await readdir(base)
  await assert.rejects(extractPortableProject(await archive({}), base, async () => { throw new Error('rejected-project') }), /rejected-project/u)
  assert.deepEqual(await readdir(base), before)
})
test('portable archives reject a forged oversized directory claim before extracting', async () => {
  const bytes = await archive({})
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  bytes.writeUInt32LE(0x70000000, central + 24)
  await assert.rejects(inspectPortableArchive(bytes), /size-limit/u)
})
test('portable archives detect changed stored entry bytes before accepting project content', async () => {
  const bytes = await archive({})
  const local = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  const offset = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
  bytes[offset] ^= 1
  await assert.rejects(inspectPortableArchive(bytes), /corrupt-entry/u)
})
test('portable file reads enforce the cap on the opened descriptor, not a prior path stat', async () => {
  const base = await mkdtemp(path.join(root, 'portable-read-'))
  const file = path.join(base, 'asset.png'); await writeFile(file, Buffer.alloc(100))
  await assert.rejects(readBoundedFile(file, 99), /size-limit/u)
  assert.equal((await readBoundedFile(file, 100)).length, 100)
})
