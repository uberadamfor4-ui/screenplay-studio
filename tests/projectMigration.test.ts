import assert from 'node:assert/strict'
import test from 'node:test'
import { projectDataLimits } from '../src/dataLimits'
import { normalizeScriptProject } from '../src/projectMigration'
import { createDefaultProject } from '../src/sample'

test('project migration rejects files that are not screenplay projects', () => {
  assert.throws(() => normalizeScriptProject(null), /有效的剧本项目/u)
  assert.throws(() => normalizeScriptProject({ title: '缺少正文' }), /缺少正文段落/u)
})

test('project migration repairs old fields and duplicate element ids', () => {
  const project = normalizeScriptProject({
    appVersion: '0.1.0',
    title: '旧项目',
    author: 1037,
    language: 'unknown',
    formatId: 'hollywood',
    fontFamily: 'Courier New',
    fontSize: 200,
    pageSize: 'invalid',
    elements: [
      { id: 'same', type: 'scene', text: '内景 房间 - 夜' },
      { id: 'same', type: 'unknown', text: '动作', textStyle: { bold: true, italic: 'yes' } },
      null,
    ],
    production: {
      scenes: 'not-an-array',
      tags: [null, 1, { id: 'tag', sceneId: 'same', category: 'props', name: '钥匙' }],
    },
  })

  assert.equal(project.appVersion, '0.6.5')
  assert.equal(project.language, 'zh-CN')
  assert.equal(project.fontFamily, 'Courier Prime')
  assert.equal(project.fontSize, 24)
  assert.equal(project.pageSize, 'letter')
  assert.equal(project.elements.length, 2)
  assert.equal(project.elements[1].type, 'action')
  assert.equal(project.elements[1].textStyle?.bold, true)
  assert.equal(project.elements[1].textStyle?.italic, undefined)
  assert.equal(new Set(project.elements.map((element) => element.id)).size, 2)
  assert.equal(Array.isArray(project.production?.scenes), true)
  assert.equal(project.production?.tags.every((tag) => Boolean(tag) && typeof tag === 'object'), true)
})

test('project migration keeps multilingual text and paragraph formatting', () => {
  const project = normalizeScriptProject({
    title: '多语言',
    author: 'Test',
    language: 'ja-JP',
    formatId: 'hollywood',
    fontFamily: 'Noto Sans CJK SC',
    fontSize: 12,
    pageSize: 'letter',
    elements: [{
      id: 'dialogue',
      type: 'dialogue',
      text: '中文… English… 日本語… 한국어… 👩🏽‍💻',
      textStyle: { bold: true, italic: true, underline: true, fontFamily: 'Arial' },
    }],
  })

  assert.equal(project.elements[0].text, '中文… English… 日本語… 한국어… 👩🏽‍💻')
  assert.deepEqual(project.elements[0].textStyle, { bold: true, italic: true, underline: true, fontFamily: 'Arial' })
})

test('project migration repairs duplicate ids in notes, episodes, and version history', () => {
  const source = createDefaultProject()
  const elementId = source.elements[0].id
  const migrated = normalizeScriptProject({
    ...source,
    series: {
      title: '剧集',
      episodes: [
        { id: 'duplicate', title: '第一集' },
        { id: 'duplicate', title: '第二集' },
      ],
    },
    reviewNotes: [
      { id: 'duplicate', elementId, category: 'writer', text: '甲' },
      { id: 'duplicate', elementId, category: 'writer', text: '乙' },
    ],
    versionHistory: [
      { id: 'duplicate', createdAt: '2026-01-01T00:00:00.000Z', elements: source.elements },
      { id: 'duplicate', createdAt: '2026-01-02T00:00:00.000Z', elements: source.elements },
    ],
  })

  assert.equal(new Set(migrated.series?.episodes.map((episode) => episode.id)).size, 2)
  assert.equal(new Set(migrated.reviewNotes?.map((note) => note.id)).size, 2)
  assert.equal(new Set(migrated.versionHistory?.map((snapshot) => snapshot.id)).size, 2)
})

test('project migration rejects resource-exhaustion payloads before expanding records', () => {
  const source = createDefaultProject()
  assert.throws(
    () => normalizeScriptProject({
      ...source,
      elements: Array(projectDataLimits.maxScriptElements + 1).fill({}),
    }),
    /正文超过 5000 个段落/u,
  )
  assert.throws(
    () => normalizeScriptProject({
      ...source,
      elements: [{ id: 'long', type: 'action', text: '字'.repeat(projectDataLimits.maxElementTextCharacters + 1) }],
    }),
    /过长的单个段落/u,
  )
  assert.throws(
    () => normalizeScriptProject({
      ...source,
      production: {
        tasks: Array(projectDataLimits.maxProductionRecordsPerCollection + 1).fill({}),
      },
    }),
    /tasks记录过多/u,
  )
})

test('project migration bounds imported identifiers while preserving linked review notes', () => {
  const oversizedId = `scene-"quoted"-${'x'.repeat(projectDataLimits.maxIdentifierCharacters + 40)}`
  const project = normalizeScriptProject({
    ...createDefaultProject(),
    elements: [{ id: oversizedId, type: 'action', text: '安全正文' }],
    reviewNotes: [{
      id: 'review-id',
      elementId: oversizedId,
      author: '制片',
      category: 'producer',
      text: '保留关联',
      resolved: false,
      createdAt: '2026-08-04T00:00:00.000Z',
    }],
  })

  assert.equal(project.elements[0].id.length, projectDataLimits.maxIdentifierCharacters)
  assert.equal(project.reviewNotes?.[0]?.elementId, project.elements[0].id)
})
