import assert from 'node:assert/strict'
import test from 'node:test'
import pngExportSafety from '../electron/pngExportSafety.cjs'

const { findStalePngFiles, getExportPrefix } = pngExportSafety

test('PNG export cleanup only targets stale pages from the completed screenplay export', () => {
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

  assert.deepEqual(findStalePngFiles(directory, written), ['片名_03.png', '片名_104.png'])
})

test('PNG export cleanup requires a recognized generated filename', () => {
  assert.equal(getExportPrefix('剧本_title.png'), '剧本')
  assert.equal(getExportPrefix('剧本_100.png'), '剧本')
  assert.equal(getExportPrefix('../剧本_01.png'), '../剧本')
  assert.equal(getExportPrefix('剧本.png'), undefined)
  assert.deepEqual(findStalePngFiles(['剧本_01.png'], ['cover.png']), [])
})
