import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultProject } from '../src/sample'
import { createElement } from '../src/formats'
import { normalizeScriptProject } from '../src/projectMigration'
import { appVersion } from '../src/appVersion'
import { editImportedElement, forkHandoffCopy, handoffWarnings, importWarning, mergeHandoffScenes, sameHandoffFamily, sceneDifference, sceneUnits, stampHandoff } from '../src/workflowReview'
import { prepareSubmission, defaultSubmissionOptions } from '../src/submissionPack'
import { prepareMobileImport } from '../mobile/src/documents'
import { createRequire } from 'node:module'
import { buildFeedbackTemplate, helpTopics } from '../src/helpCenter'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
const require = createRequire(import.meta.url)
const { buildSubmissionArchive } = require('../electron/submissionArchive.cjs')
const JSZip = require('jszip')

test('migration and new drafts share the single current format version', () => { const p = createDefaultProject(); assert.equal(p.appVersion, appVersion); assert.equal(normalizeScriptProject({ ...p, appVersion: '0.1.0' }).appVersion, appVersion) })
test('import review changes only the selected copy and refuses invalid types and oversized text', () => {
  const p = createDefaultProject(), before = structuredClone(p), id = p.elements[1].id
  const next = editImportedElement(p, id, { type: 'shot', text: '特写……保留省略号。' })
  assert.deepEqual(p, before); assert.equal(next.elements[1].type, 'shot'); assert.equal(next.elements[1].text, '特写……保留省略号。')
  assert.throws(() => editImportedElement(p, id, { type: 'invalid' as never })); assert.throws(() => editImportedElement(p, 'missing', { text: 'x' }))
  assert.equal(importWarning(createElement('character', '小林')), 'cue'); assert.equal(importWarning(createElement('dialogue', '你好'), createElement('action')), 'orphan')
})
test('mobile document preparation previews text without changing parser output', async () => {
  const result = await prepareMobileImport('test.fountain', new TextEncoder().encode('Title: 测试\n\n.INT. ROOM - DAY\n\n@LIN\n你好……\n'))
  assert.ok(result.review); assert.equal(result.handoff, false); assert.ok(result.source.includes('@LIN')); assert.equal(result.project.elements[0].type, 'scene'); assert.ok(result.project.elements.some(e => e.type === 'dialogue' && e.text.includes('你好……')))
})
test('mobile SSProj preparation preserves source version, metadata and identity for handoff', async () => {
  const p = stampHandoff(createDefaultProject(), 'darwin', '0.7.3')
  const result = await prepareMobileImport('old.ssproj', new TextEncoder().encode(JSON.stringify(p)))
  assert.ok(result.handoff); assert.equal(result.sourceVersion, appVersion); assert.equal(result.project.handoff?.sourcePlatform, 'mac'); assert.ok(sameHandoffFamily(p, result.project))
})
test('independent incoming copies have a new branch but retain complete metadata and family', () => {
  const p = createDefaultProject(); p.submission = { logline: 'abc', synopsis: 'def', characters: '', statement: '' }
  const copied = forkHandoffCopy(p); assert.notEqual(copied.writingTools?.projectId, p.writingTools?.projectId); assert.ok(sameHandoffFamily(p, copied)); assert.deepEqual(copied.submission, p.submission)
  assert.deepEqual(normalizeScriptProject(copied).handoff, copied.handoff)
})
test('same-family handoff replaces selected stable scene IDs in a new branch, not source files', () => {
  const current = createDefaultProject(), incoming = structuredClone(current), before = structuredClone(current)
  incoming.elements[1].text = '手机新稿……'; incoming.elements[1].textStyle = { bold: true }
  const key = sceneUnits(incoming.elements)[0].key, next = mergeHandoffScenes(current, incoming, [key], '合并副本')
  assert.deepEqual(current, before); assert.equal(next.elements[1].text, '手机新稿……'); assert.equal(next.elements[1].textStyle?.bold, true)
  assert.deepEqual(next.elements.slice(5), current.elements.slice(5)); assert.notEqual(next.writingTools?.projectId, current.writingTools?.projectId); assert.ok(sameHandoffFamily(next, current))
})
test('unrelated same-title projects only append and remap colliding paragraph and dual-group IDs', () => {
  const current = createDefaultProject(), incoming = createDefaultProject(); incoming.elements = structuredClone(current.elements.slice(0, 3))
  incoming.elements[1].dualDialogue = { groupId: 'group', side: 'left' }; incoming.elements[2].dualDialogue = { groupId: 'group', side: 'right' }
  current.elements[1].dualDialogue = { groupId: 'group', side: 'left' }; current.elements[2].dualDialogue = { groupId: 'group', side: 'right' }
  const next = mergeHandoffScenes(current, incoming, [incoming.elements[0].id], 'append')
  assert.deepEqual(next.elements.slice(0, current.elements.length), current.elements); assert.equal(new Set(next.elements.map(e => e.id)).size, next.elements.length)
  assert.notEqual(next.elements.at(-1)?.dualDialogue?.groupId, 'group'); assert.equal(next.elements.at(-1)?.dualDialogue?.groupId, next.elements.at(-2)?.dualDialogue?.groupId)
})
test('handoff refuses locked drafts, missing selections and oversized merges before applying', () => {
  const p = createDefaultProject(); assert.throws(() => mergeHandoffScenes(p, p, [], 'no')); assert.throws(() => mergeHandoffScenes(p, p, ['missing'], 'no'))
  const locked = { ...p, productionLock: { enabled: true, pages: 1, scenes: 1, lockedAt: '' } }; assert.throws(() => mergeHandoffScenes(locked, p, [p.elements[0].id], 'no'))
  assert.ok(handoffWarnings(locked, ['Other font'], '0.1').includes('locked')); assert.ok(handoffWarnings(locked, ['Other font'], '0.1').includes('version'))
})
test('scene comparison ignores property insertion order and duplicate scene IDs are rejected', () => {
  const p = createDefaultProject(), unit = sceneUnits(p.elements)[0]
  const reversed = { ...unit, elements: unit.elements.map(e => Object.fromEntries(Object.entries(e).reverse()) as typeof e) }
  assert.equal(sceneDifference(unit, reversed), 'same')
  reversed.elements[0] = { ...reversed.elements[0], textStyle: { bold: true } }
  assert.equal(sceneDifference(unit, reversed), 'changed')
  const malformed = { ...p, elements: [createElement('scene', 'A'), createElement('scene', 'B')] }
  malformed.elements[1].id = malformed.elements[0].id
  assert.throws(() => mergeHandoffScenes(p, malformed, [malformed.elements[0].id], 'copy'), /invalidSelection/u)
})
test('anonymous submission excludes statements, known identity, email and paths without changing original', () => {
  const p = createDefaultProject(); p.author = '测试作者'; p.title = '测试作者作品'; p.submission = { logline: '测试作者，test@example.com，D:\\private\\story.txt。', synopsis: '', characters: '', statement: '测试作者本人' }
  const before = structuredClone(p), result = prepareSubmission(p, { ...defaultSubmissionOptions, anonymous: true, statement: true })
  assert.equal(result.suggestedName, 'submission-anonymous.zip'); assert.ok(!result.files.some(f => f.name === 'statement.txt'))
  assert.ok(!JSON.stringify(result).includes('test@example.com')); assert.ok(!JSON.stringify(result).includes('测试作者')); assert.ok(!JSON.stringify(result).includes('private')); assert.deepEqual(p, before)
})
test('submission validates selected empty fields and does not export unselected materials', () => {
  const p = createDefaultProject(); assert.throws(() => prepareSubmission(p, defaultSubmissionOptions)); p.submission = { logline: '故事', synopsis: '', characters: '未选择的人物', statement: '' }
  const result = prepareSubmission(p, defaultSubmissionOptions); assert.equal(result.files.length, 2); assert.ok(!JSON.stringify(result.files).includes('未选择的人物'))
  assert.throws(() => prepareSubmission(p, { anonymous: false, script: false, logline: false, synopsis: false, characters: false, statement: false }))
})
test('native submission ZIP validates entry names, duplicates and preserves full PDF and text payloads', async () => {
  const pdf = Buffer.from('%PDF-1.4\nexample'), text = '中文……Bold / 正文'
  const result = await buildSubmissionArchive([{ name: 'logline.txt', content: text }], pdf), zip = await JSZip.loadAsync(result, { checkCRC32: true })
  assert.equal(await zip.file('logline.txt').async('string'), text); assert.ok((await zip.file('script.pdf').async('nodebuffer')).equals(pdf))
  await assert.rejects(buildSubmissionArchive([{ name: '../escape.txt', content: 'no' }])); await assert.rejects(buildSubmissionArchive([{ name: 'README.txt', content: '' }, { name: 'README.txt', content: 'duplicate' }]))
  await assert.rejects(buildSubmissionArchive([{ name: 'README.txt', content: 'x'.repeat(200001) }]))
})

test('feedback templates localize all UI languages without automatic private data', () => {
  for (const locale of ['zh-CN', 'en-US', 'zh-TW']) { const value=buildFeedbackTemplate('0.7.4','windows','save','','',locale); assert.ok(value.includes('0.7.4')); assert.ok(!value.includes('D:\\')); assert.ok(value.length<2000) }
  assert.ok(buildFeedbackTemplate('0.7.4','windows','input','','','en-US').includes('App version:')); assert.ok(buildFeedbackTemplate('0.7.4','windows','input','','','zh-TW').includes('軟體版本'))
  assert.equal(helpTopics.length,7); assert.ok(helpTopics.every(t=>t.title.length===3&&t.steps.every(s=>s.length===3&&s.every(Boolean))))
  const hostile=buildFeedbackTemplate('D:/private','secret-host','not-valid');assert.ok(!hostile.includes('secret-host'));assert.ok(!hostile.includes('D:/private'))
})

test('handoff asset checks distinguish missing, unsupported and present without reading network paths', async () => {
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'screenplay-assets-'))
  try {
    await fs.writeFile(path.join(folder,'found.png'),Buffer.from('fake local fixture'))
    const project={elements:[],production:{locations:[{photoPaths:['found.png','missing.png','https://invalid.test/remote.png','\\\\server\\share\\remote.png']}],assets:[],shots:[]}}
    const report=await require('../electron/portableProject.cjs').inspectPortableAssets(JSON.stringify(project),path.join(folder,'project.ssproj'))
    assert.deepEqual(report,{total:4,checked:4,present:1,missing:1,unsupported:2,omitted:0});assert.ok(!JSON.stringify(report).includes(folder))
  } finally { await fs.rm(folder,{recursive:true,force:true}) }
})
