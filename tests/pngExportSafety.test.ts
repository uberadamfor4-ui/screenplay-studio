import assert from 'node:assert/strict'
import test from 'node:test'
import pngExportSafety from '../electron/pngExportSafety.cjs'

const {
  createEmptyPngExportManifest,
  findStalePngFiles,
  getExportPrefix,
  parsePngExportManifest,
  updatePngExportManifest,
} = pngExportSafety

test('PNG export cleanup only targets pages owned by a previous completed export', () => {
  const written = ['片名_title.png', '片名_01.png', '片名_02.png']
  const directory = [
    ...written,
    '片名_03.png',
    '片名_104.png',
    '片名_封面.png',
    '另一项目_03.png',
    '片名_03.jpg',
    'notes.txt',
  ]
  const manifest = {
    version: 1,
    exports: [{ prefix: '片名', files: ['片名_title.png', '片名_01.png', '片名_02.png', '片名_03.png'] }],
  }

  assert.deepEqual(findStalePngFiles(directory, written, manifest), ['片名_03.png'])
  assert.deepEqual(findStalePngFiles(directory, written, createEmptyPngExportManifest()), [])
})

test('PNG export cleanup requires a recognized generated filename', () => {
  assert.equal(getExportPrefix('剧本_title.png'), '剧本')
  assert.equal(getExportPrefix('剧本_100.png'), '剧本')
  assert.equal(getExportPrefix('../剧本_01.png'), '../剧本')
  assert.equal(getExportPrefix('剧本.png'), undefined)
  assert.deepEqual(findStalePngFiles(['剧本_01.png'], ['cover.png'], createEmptyPngExportManifest()), [])
})

test('PNG export manifest ignores path traversal and preserves separate project ownership', () => {
  const parsed = parsePngExportManifest(JSON.stringify({
    version: 1,
    exports: [
      { prefix: '剧本', files: ['剧本_01.png', '../剧本_02.png', 'other_01.png'] },
      { prefix: '另一项目', files: ['另一项目_01.png'] },
    ],
  }))
  assert.deepEqual(parsed.exports, [
    { prefix: '剧本', files: ['剧本_01.png'] },
    { prefix: '另一项目', files: ['另一项目_01.png'] },
  ])

  const updated = updatePngExportManifest(parsed, ['剧本_01.png', '剧本_02.png'])
  assert.deepEqual(updated.exports, [
    { prefix: '剧本', files: ['剧本_01.png', '剧本_02.png'] },
    { prefix: '另一项目', files: ['另一项目_01.png'] },
  ])
})
