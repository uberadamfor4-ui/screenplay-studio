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

test('storyboard media URLs and project-relative assets keep their original meaning', () => {
  assert.equal(resolveLocalMediaSource('https://example.com/frame.png'), 'https://example.com/frame.png')
  assert.equal(resolveLocalMediaSource('file:///Users/writer/frame.png'), 'file:///Users/writer/frame.png')
  assert.equal(resolveLocalMediaSource('./frame.png'), './frame.png')
  assert.equal(resolveLocalMediaSource('  '), '')
})
