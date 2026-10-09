import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLocalMediaSource } from '../src/localMedia'

test('storyboard media paths resolve on Windows and macOS without corrupting international names', () => {
  assert.equal(
    resolveLocalMediaSource('C:\\Users\\Writer\\分镜 01.png'),
    'file:///C:/Users/Writer/%E5%88%86%E9%95%9C%2001.png',
  )
  assert.equal(
    resolveLocalMediaSource('/Users/writer/Storyboard 01.png'),
    'file:///Users/writer/Storyboard%2001.png',
  )
})

test('offline media sources reject remote URLs, UNC, unsafe schemes and relative traversal', () => {
  for (const source of ['https://example.com/frame.png', 'data:image/png;base64,AA==', 'blob:demo', 'javascript:alert(1)', '//server/share/a.png', '\\\\server\\share\\a.png', 'file://server/share/a.png', '../../secret.png']) {
    assert.equal(resolveLocalMediaSource(source, 'D:\\Film\\project.ssproj'), '', source)
  }
  assert.equal(resolveLocalMediaSource('file:///Users/writer/frame.png'), 'file:///Users/writer/frame.png')
  assert.equal(resolveLocalMediaSource('./frame.png'), '')
  assert.equal(resolveLocalMediaSource('./frame.png', 'D:\\Film\\project.ssproj'), 'file:///D:/Film/frame.png')
  assert.equal(resolveLocalMediaSource('assets/%2e%2e/frame.png', 'D:\\Film\\project.ssproj'), 'file:///D:/Film/assets/%252e%252e/frame.png')
  assert.equal(resolveLocalMediaSource('assets/a.png', '\\\\server\\share\\project.ssproj'), '')
  assert.equal(resolveLocalMediaSource('a'.repeat(8193)), '')
  assert.equal(resolveLocalMediaSource('  '), '')
})
