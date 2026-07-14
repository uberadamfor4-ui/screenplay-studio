import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFdx } from '../src/fdx'
import type { ScriptProject } from '../src/types'

test('FDX export preserves title-page metadata, XML escaping, and dual dialogue', () => {
  const groupId = 'dual-regression'
  const project: ScriptProject = {
    appVersion: '0.4.0',
    title: 'The <Signal>',
    author: 'A & B',
    language: 'en-US',
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    titlePage: {
      enabled: true,
      title: 'The <Signal>',
      credit: 'Written by',
      authors: 'A & B',
      basedOn: '',
      draftDate: 'July 2026',
      contact: 'studio@example.com',
      copyright: '',
    },
    elements: [
      { id: 'left-cue', type: 'character', text: 'MAYA', dualDialogue: { groupId, side: 'left' } },
      { id: 'left-line', type: 'dialogue', text: 'Wait.', dualDialogue: { groupId, side: 'left' } },
      { id: 'right-cue', type: 'character', text: 'NOAH', dualDialogue: { groupId, side: 'right' } },
      { id: 'right-line', type: 'dialogue', text: 'Go.', dualDialogue: { groupId, side: 'right' } },
    ],
  }

  const fdx = buildFdx(project)
  assert.match(fdx, /<Text>The &lt;Signal&gt;<\/Text>/)
  assert.match(fdx, /<Text>A &amp; B<\/Text>/)
  assert.equal((fdx.match(/<DualDialogue>/g) ?? []).length, 1)
  assert.equal((fdx.match(/<Paragraph Type="Character">/g) ?? []).length, 2)
  assert.equal((fdx.match(/<Paragraph Type="Dialogue">/g) ?? []).length, 2)
})

test('FDX export preserves professional scene numbers and revision identifiers', () => {
  const project: ScriptProject = {
    appVersion: '0.6.0',
    title: '编号测试',
    author: '编剧',
    language: 'zh-CN',
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    elements: [
      { id: 'scene-a', type: 'scene', text: '内景 公寓 - 夜', sceneNumber: '12A', revisionSetId: '2' },
      { id: 'action-a', type: 'action', text: '雨打在窗上。', revisionSetId: '2' },
    ],
  }

  const fdx = buildFdx(project)
  assert.match(fdx, /<Paragraph Type="Scene Heading" Number="12A">/u)
  assert.equal((fdx.match(/RevisionID="2"/gu) ?? []).length, 2)
})
