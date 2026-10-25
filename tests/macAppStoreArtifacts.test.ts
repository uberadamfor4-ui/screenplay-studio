import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, chmod, stat, rm, link, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const plist = require('plist')
const { verifyRetinaIcns, isPubliclyReadable, prepareMasArtifacts } = require('../build/mac-app-store-artifacts.cjs')
const { rasterizeMasIcon } = require('../scripts/generate-mas-icon.cjs')
const { loadImage, createCanvas } = require('@napi-rs/canvas')

function icns(tag = 'ic10') {
  const bytes = Buffer.alloc(17)
  bytes.write('icns')
  bytes.writeUInt32BE(bytes.length, 4)
  bytes.write(tag, 8)
  bytes.writeUInt32BE(9, 12)
  return bytes
}

test('ICNS gate requires the Retina entry and rejects malformed chunk boundaries', () => {
  assert.doesNotThrow(() => verifyRetinaIcns(icns()))
  assert.throws(() => verifyRetinaIcns(icns('ic09')), /1024px/)
  for (const length of [0, 7, 8, 16, 18]) {
    const bytes = icns()
    bytes.writeUInt32BE(length, 12)
    assert.throws(() => verifyRetinaIcns(bytes))
  }
  assert.throws(() => verifyRetinaIcns(icns().subarray(0, 16)))
})

test('public bundle permissions reject the exact root-only profile regression', () => {
  assert.equal(isPubliclyReadable(0o600), false)
  assert.equal(isPubliclyReadable(0o640), false)
  assert.equal(isPubliclyReadable(0o644), true)
  assert.equal(isPubliclyReadable(0o700, true), false)
  assert.equal(isPubliclyReadable(0o744, true), false)
  assert.equal(isPubliclyReadable(0o755, true), true)
})

async function fixture(t: any) {
  const directory = await mkdtemp(path.join(tmpdir(), 'screenplay-mas-artifacts-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const app = path.join(directory, 'Synthetic.app')
  const contents = path.join(app, 'Contents')
  await mkdir(path.join(contents, 'Resources'), { recursive: true })
  await writeFile(path.join(contents, 'Info.plist'), plist.build({ CFBundleIconFile: 'Synthetic.icns' }))
  await writeFile(path.join(contents, 'Resources', 'Synthetic.icns'), icns())
  const profile = path.join(directory, 'selected.provisionprofile')
  await writeFile(profile, 'SYNTHETIC PUBLIC PROFILE', { mode: 0o600 })
  return {
    directory, contents, profile,
    embedded: path.join(contents, 'embedded.provisionprofile'),
    context: { electronPlatformName: 'mas', appOutDir: directory, packager: { appInfo: { productFilename: 'Synthetic' } } },
  }
}

test('pre-sign gate embeds a readable copy and osx-sign preserves its content and mode', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t)
  const sourceMode = (await stat(f.profile)).mode
  await prepareMasArtifacts(f.context, f.profile)
  assert.deepEqual(await readFile(f.embedded), await readFile(f.profile))
  const { preEmbedProvisioningProfile } = require('../node_modules/@electron/osx-sign/dist/cjs/util-provisioning-profiles.js')
  await preEmbedProvisioningProfile({ app: path.dirname(f.contents) }, { filePath: f.profile })
  assert.equal((await stat(f.profile)).mode, sourceMode)
  if (process.platform !== 'win32') assert.equal((await stat(f.embedded)).mode & 0o777, 0o644)
  await prepareMasArtifacts(f.context, f.profile)
})

test('gate refuses an existing different profile without overwriting it', async t => {
  const f = await fixture(t)
  await writeFile(f.embedded, 'OLD PROFILE')
  await assert.rejects(prepareMasArtifacts(f.context, f.profile), /does not match/)
  assert.equal(await readFile(f.embedded, 'utf8'), 'OLD PROFILE')
})

test('gate refuses linked profiles rather than changing the source permissions', async t => {
  const f = await fixture(t)
  const sourceMode = (await stat(f.profile)).mode
  await link(f.profile, f.embedded)
  await assert.rejects(prepareMasArtifacts(f.context, f.profile), /linked/)
  assert.equal((await stat(f.profile)).mode, sourceMode)
})

test('gate never chmods an embedded file selected as the source profile', async t => {
  const f = await fixture(t)
  await writeFile(f.embedded, 'SYNTHETIC SOURCE', { mode: 0o600 })
  const before = (await stat(f.embedded)).mode
  await assert.rejects(prepareMasArtifacts(f.context, f.embedded), /outside its embedded destination/)
  assert.equal((await stat(f.embedded)).mode, before)
  assert.equal(await readFile(f.embedded, 'utf8'), 'SYNTHETIC SOURCE')
})

test('unsigned artifact gate still checks the icon and actual MAS runtime', async t => {
  const f = await fixture(t)
  // Windows does not expose POSIX directory search bits; native mode acceptance runs on macOS.
  if (process.platform !== 'win32') await prepareMasArtifacts(f.context)
  await assert.rejects(prepareMasArtifacts({ ...f.context, electronPlatformName: 'darwin' }), /actual MAS/)
  await writeFile(path.join(f.contents, 'Resources', 'Synthetic.icns'), icns('ic09'))
  await assert.rejects(prepareMasArtifacts(f.context), /1024px/)
  const script = await readFile(new URL('../scripts/build-unsigned-mas.cjs', import.meta.url), 'utf8')
  assert.match(script, /const artifactGate = config\.afterPack/)
  assert.match(script, /await artifactGate\(context\)/)
})

test('gate rejects unreadable payloads and symlinked profile destinations', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t)
  const privateFile = path.join(f.contents, 'Resources', 'private.txt')
  await writeFile(privateFile, 'synthetic')
  await chmod(privateFile, 0o600)
  await assert.rejects(prepareMasArtifacts(f.context), /ordinary users/)
  await chmod(privateFile, 0o644)
  await symlink(f.profile, f.embedded)
  await assert.rejects(prepareMasArtifacts(f.context, f.profile), /regular file/)
})

test('1024px icon is rasterized from the existing brand vector, with its geometry and colors intact', async () => {
  const svg = await readFile(new URL('../assets/brand/screenplay-studio-icon.svg', import.meta.url), 'utf8')
  const generated = await rasterizeMasIcon(svg)
  const committed = await readFile(new URL('../assets/brand/app-icon-1024.png', import.meta.url))
  for (const bytes of [generated, committed]) {
    const image = await loadImage(bytes)
    assert.equal(image.width, 1024)
    assert.equal(image.height, 1024)
    const canvas = createCanvas(1024, 1024)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    for (const [x, y, rgba] of [
      [0, 0, [0, 0, 0, 0]],
      [512, 80, [20, 37, 42, 255]],
      [512, 400, [248, 246, 238, 255]],
      [400, 336, [31, 122, 104, 255]],
    ] as const) assert.deepEqual([...context.getImageData(x, y, 1, 1).data], [...rgba])
  }
})
