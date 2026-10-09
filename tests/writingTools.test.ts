import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultProject } from '../src/sample'
import { normalizeScriptElements, normalizeScriptProject } from '../src/projectMigration'
import { serializeProjectForSave } from '../src/projectSerialization'
import { synchronizeProductionData } from '../src/production'
import { resolveLocalMediaSource } from '../src/localMedia'
import { anonymousProject, applyReplacementPreview, canonicalName, continuityWarnings, defaultPrivacyOptions, detectPlaceholders, makeReviewExchange, mergeReviewExchange, normalizeWritingTools, parseReviewExchange, previewReviewMerge, privacyFindings, rehearsalLines, replacementPreview, restoreCutting, restoreCuttingProject, sceneRange, storyLinkWarnings, validateAliases } from '../src/writingTools'
import type { ContinuityEntry, EntityAlias, ReviewNote, ScriptElement } from '../src/types'

const elements: ScriptElement[] = [
  { id: 's1', type: 'scene', text: 'INT. HOME - DAY' },
  { id: 'a1', type: 'action', text: 'TODO: 老李转身。', textStyle: { bold: true, fontFamily: 'SimSun' } },
  { id: 'c1', type: 'character', text: '老李' },
  { id: 'd1', type: 'dialogue', text: '老李……再见。' },
  { id: 's2', type: 'scene', text: 'EXT. STREET - NIGHT' },
  { id: 'c2', type: 'character', text: '李明 (V.O.)' },
  { id: 'd2', type: 'dialogue', text: '待补：这里补对白' },
]
const aliases: EntityAlias[] = [{ id: 'alias', kind: 'character', canonical: '李明', aliases: ['老李'] }]
const project = () => ({ ...createDefaultProject(), elements: structuredClone(elements) })
const note: ReviewNote = { id: 'n1', elementId: 'a1', author: '导演', category: 'director', text: '改一个动作', resolved: false, createdAt: '2026-10-09T00:00:00Z' }

test('batch preview respects scene/selected/dialogue scope and preserves paragraph styling', () => {
  const source = project().elements
  const changes = replacementPreview(source, [{ from: '老李', to: '李明' }], new Set(['a1', 'd1']))
  assert.equal(changes.length, 2)
  assert.equal(source[1].text, elements[1].text)
  const result = applyReplacementPreview(source, changes, new Set(['a1']))
  assert.equal(result[1].text, 'TODO: 李明转身。')
  assert.deepEqual(result[1].textStyle, elements[1].textStyle)
  assert.equal(result[3], source[3])
  assert.deepEqual(sceneRange(source, 'd1').map(x => x.id), ['s1', 'a1', 'c1', 'd1'])
})
test('batch preview refuses stale or deleted paragraphs atomically', () => {
  const changes = replacementPreview(elements, [{ from: '老李', to: '李明' }])
  assert.throws(() => applyReplacementPreview(elements.map(x => x.id === 'a1' ? { ...x, type: 'shot' } : x), changes, new Set(['a1', 'd1'])), /stalePreview/u)
  assert.throws(() => applyReplacementPreview(elements.filter(x => x.id !== 'a1'), changes, new Set(['a1'])), /stalePreview/u)
})
test('literal single-pair replacements support equals signs and metacharacters', () => {
  const source: ScriptElement[] = [{ id: 'x', type: 'action', text: 'x=y $& ……' }]
  assert.equal(replacementPreview(source, [{ from: 'x=y', to: '$&' }])[0].after.text, '$& $& ……')
})
test('aliases never infer age identities and reject ambiguity and cycles', () => {
  validateAliases(aliases)
  assert.equal(canonicalName('老李', 'character', aliases), '李明')
  assert.equal(canonicalName('少年李明', 'character', aliases), '少年李明')
  assert.equal(canonicalName('老李', 'location', aliases), '老李')
  assert.throws(() => validateAliases([...aliases, { id: '2', kind: 'character', canonical: '老李', aliases: ['李明'] }]), /aliasConflict/u)
})
test('alias resolution cannot reuse a stale index after an external caller edits its array', () => {
  const items = structuredClone(aliases)
  assert.equal(canonicalName('老李', 'character', items), '李明')
  items[0].aliases.push('阿明')
  assert.equal(canonicalName('阿明', 'character', items), '李明')
  items.splice(0, 1)
  assert.equal(canonicalName('老李', 'character', items), '老李')
})
test('production breakdown aliases are stable across repeated synchronization', () => {
  const source = [...elements.slice(0, 4), { id: 'c3', type: 'character' as const, text: '李明' }]
  const first = synchronizeProductionData(source, undefined, aliases)
  first.tags.filter(x => x.category === 'cast').forEach(x => { x.confirmed = true })
  const second = synchronizeProductionData(source, first, aliases)
  assert.equal(second.tags.filter(x => x.category === 'cast').length, 1)
  assert.equal(second.tags.find(x => x.category === 'cast')?.name, '李明')
  assert.deepEqual(source, [...elements.slice(0, 4), { id: 'c3', type: 'character', text: '李明' }])
})
test('rewrite placeholders recognize Chinese, traditional and English markers', () => {
  assert.deepEqual(detectPlaceholders(elements).map(x => x.id), ['a1', 'd2'])
  assert.equal(detectPlaceholders([{ id: 'a', type: 'action', text: '待補、這裡補台詞' }]).length, 1)
})
test('removing an alias restores the original production tag instead of leaving stale canonical names', () => {
  const source = elements.slice(0, 4)
  const first = synchronizeProductionData(source, undefined, aliases)
  first.tags.filter(x => x.category === 'cast').forEach(x => { x.confirmed = true })
  const restored = synchronizeProductionData(source, first, [])
  assert.equal(restored.tags.filter(x => x.category === 'cast').length, 1)
  assert.equal(restored.tags.find(x => x.category === 'cast')?.name, '老李')
})
test('cutting restoration remaps paragraph and dual-dialogue ids while retaining formatting', () => {
  const saved: ScriptElement[] = [{ ...elements[1], dualDialogue: { groupId: 'g', side: 'left' } }, { ...elements[3], dualDialogue: { groupId: 'g', side: 'right' } }]
  const result = restoreCutting(elements, saved, 's2')
  const restored = result.slice(5, 7)
  assert.equal(new Set(result.map(x => x.id)).size, result.length)
  assert.deepEqual(restored[0].textStyle, saved[0].textStyle)
  assert.notEqual(restored[0].dualDialogue?.groupId, 'g')
  assert.equal(restored[0].dualDialogue?.groupId, restored[1].dualDialogue?.groupId)
  assert.throws(() => restoreCutting(elements, saved, 'missing'), /missingAnchor/u)
})
test('cuttings retain anchored review notes on disk and restore independent note ids', () => {
  const p = project()
  p.writingTools.cuttings = [{ id: 'cut', title: '备用', sourceId: 'a1', sourceHeading: '', createdAt: '', elements: [elements[1]], reviewNotes: [note] }]
  const reopened = normalizeScriptProject(JSON.parse(serializeProjectForSave(p)))
  assert.deepEqual(reopened.writingTools?.cuttings[0].reviewNotes, [note])
  const first = restoreCuttingProject(reopened, reopened.writingTools!.cuttings[0], 's2')
  const second = restoreCuttingProject(first, reopened.writingTools!.cuttings[0], 's2')
  assert.equal(second.reviewNotes?.length, 2)
  assert.equal(new Set(second.reviewNotes?.map(x => x.id)).size, 2)
  for (const restored of second.reviewNotes!) {
    assert.notEqual(restored.elementId, note.elementId)
    assert.equal(second.elements.find(x => x.id === restored.elementId)?.text, elements[1].text)
  }
})

test('restoring numbered scenes allocates suffixes without renumbering locked scenes', () => {
  const p = project()
  p.elements[0].sceneNumber = '1'; p.elements[4].sceneNumber = '2'
  p.productionLock = { enabled: true, pages: 1, scenes: 2, lockedAt: '', sceneNumbers: { s1: '1', s2: '2' } }
  const cutting = { id: 'cut', title: '', sourceId: 's1', sourceHeading: '', createdAt: '', elements: [{ ...elements[0], text: '1. INT. HOME - DAY', sceneNumber: '1', revisionSetId: 'old-revision' }, elements[1]] }
  const result = restoreCuttingProject(p, cutting, 'a1')
  assert.deepEqual(result.elements.filter(x => x.type === 'scene').map(x => x.sceneNumber), ['1', '1A', '2'])
  assert.equal(result.elements[2].text, 'INT. HOME - DAY')
  assert.equal(result.elements[2].revisionSetId, undefined)
  const twice = restoreCuttingProject(result, cutting, 'a1')
  assert.deepEqual(twice.elements.filter(x => x.type === 'scene').map(x => x.sceneNumber), ['1', '1B', '1A', '2'])
  const unnumbered = restoreCuttingProject(project(), cutting, 'a1')
  assert.equal(unnumbered.elements[2].sceneNumber, undefined)
  assert.equal(p.elements[0].sceneNumber, '1')
})

test('cutting restoration never guesses a numeric title is disposable scene-number text', () => {
  const p = project()
  p.elements = [{ id: 'year', type: 'scene', text: '1984. INT. MEMORY - DAY' }, { id: 'a', type: 'action', text: '记忆片段。' }]
  const cutting = { id: 'cut', title: '', sourceId: 'year', sourceHeading: '', createdAt: '', elements: [p.elements[0], { id: 'numeric', type: 'scene' as const, text: '3' }] }
  const result = restoreCuttingProject(p, cutting, 'a')
  assert.deepEqual(result.elements.slice(2).map(x => x.text), ['1984. INT. MEMORY - DAY', '3'])
  assert.ok(result.elements.slice(2).every(x => x.sceneNumber === undefined))
})

test('a full-capacity cutting replaces only an unannotated empty-document placeholder', () => {
  const p = project(); p.elements = [{ id: 'empty', type: 'action', text: '' }]
  const cutting = { id: 'cut', title: '', sourceId: 'old', sourceHeading: '', createdAt: '', elements: Array.from({ length: 5000 }, (_, i) => ({ id: `saved-${i}`, type: 'action' as const, text: '正文' })), reviewNotes: [{ ...note, elementId: 'saved-0' }] }
  const restored = restoreCuttingProject(p, cutting, 'empty')
  assert.equal(restored.elements.length, 5000)
  assert.equal(restored.reviewNotes?.[0].elementId, restored.elements[0].id)
  assert.equal(restored.elements.some(x => x.id === 'empty'), false)
  p.reviewNotes = [{ ...note, elementId: 'empty' }]
  assert.throws(() => restoreCuttingProject(p, cutting, 'empty'), /tooManyElements/u)
  const smaller = restoreCuttingProject(p, { ...cutting, elements: cutting.elements.slice(0, 1) }, 'empty')
  assert.equal(smaller.elements[0].id, 'empty')
  assert.equal(smaller.reviewNotes?.[0].elementId, 'empty')
})

test('bulk numbered-scene restoration allocates unique numbers in one pass', () => {
  const p = project(); p.elements = [{ id: 's1', type: 'scene', text: 'INT. HOME - DAY', sceneNumber: '1' }]
  const cutting = { id: 'cut', title: '', sourceId: 'old', sourceHeading: '', createdAt: '', elements: Array.from({ length: 4999 }, (_, i) => ({ id: `saved-${i}`, type: 'scene' as const, text: 'EXT. ROAD - DAY', sceneNumber: '2' })) }
  const start = performance.now()
  const restored = restoreCuttingProject(p, cutting, 's1')
  assert.equal(restored.elements.length, 5000)
  assert.equal(new Set(restored.elements.map(el => el.sceneNumber)).size, 5000)
  assert.equal(restored.elements[1].sceneNumber, '1A')
  assert.ok(performance.now() - start < 5000, 'Bulk restoration must not repeatedly scan all screenplay scenes')
  const before = { ...p, elements: [{ id: 'lead', type: 'action' as const, text: '开场' }, ...p.elements] }
  const prefixed = restoreCuttingProject(before, { ...cutting, elements: cutting.elements.slice(0, 2) }, 'lead')
  assert.deepEqual(prefixed.elements.filter(el => el.type === 'scene').map(el => el.sceneNumber), ['A1', 'B1', '1'])
})

test('continuity ledger distinguishes explicit changes, ambiguous time and deleted scenes', () => {
  const base: ContinuityEntry = { id: '1', sceneId: 's1', day: 2, time: '08:00', entity: '李明', attribute: '左手', state: '受伤', change: false }
  const next = { ...base, id: '2', sceneId: 's2', time: '18:00', state: '完好' }
  assert.equal(continuityWarnings(elements, [next, base])[0].code, 'stateConflict')
  assert.equal(continuityWarnings(elements, [base, { ...next, change: true }]).length, 0)
  assert.equal(continuityWarnings(elements, [base, { ...next, time: '' }])[0].code, 'ambiguousTime')
  assert.equal(continuityWarnings(elements, [{ ...base, sceneId: 'gone' }])[0].code, 'missingAnchor')
})
test('setup-payoff anchors survive moves and report missing or reversed anchors', () => {
  const p = project(); p.writingTools.storyLinks = [{ id: 'link', title: '钥匙', setupId: 'a1', payoffId: 'd2', status: 'open' }]
  assert.deepEqual(storyLinkWarnings(p), [])
  assert.equal(storyLinkWarnings({ ...p, elements: [...p.elements].reverse() })[0].code, 'payoffBeforeSetup')
  p.writingTools.storyLinks[0].payoffId = 'gone'
  assert.equal(storyLinkWarnings(p)[0].code, 'missingAnchor')
})
test('rehearsal identifies speakers and canonical aliases without changing dialogue', () => {
  const lines = rehearsalLines(elements, aliases)
  assert.deepEqual(lines.map(x => x.speaker), ['李明', '李明'])
  assert.equal(lines[0].element.text, elements[3].text)
})
test('review exchange round-trip rejects a different project and never overwrites screenplay text', () => {
  const p = project(); p.reviewNotes = [note]
  const exchange = parseReviewExchange(JSON.stringify(makeReviewExchange(p)))
  assert.equal(previewReviewMerge(p, exchange)[0].status, 'duplicate')
  const receiver = { ...p, reviewNotes: [] }
  const merged = mergeReviewExchange(receiver, exchange, new Set(['n1']))
  assert.deepEqual(merged.elements, elements)
  assert.deepEqual(merged.reviewNotes, [note])
  assert.equal(previewReviewMerge(merged, exchange)[0].status, 'duplicate')
  assert.throws(() => previewReviewMerge(project(), exchange), /differentProject/u)
})
test('review conflicts are preserved as distinct notes and are not imported twice', () => {
  const p = project(); p.reviewNotes = [note]
  const exchange = makeReviewExchange({ ...p, reviewNotes: [{ ...note, text: '导演的新批注' }] })
  assert.equal(previewReviewMerge(p, exchange)[0].status, 'conflict')
  const merged = mergeReviewExchange(p, exchange, new Set(['n1']))
  assert.equal(merged.reviewNotes?.length, 2)
  assert.equal(merged.reviewNotes?.[0].text, note.text)
  assert.notEqual(merged.reviewNotes?.[1].id, note.id)
  assert.equal(mergeReviewExchange(merged, exchange, new Set(['n1'])).reviewNotes?.length, 2)
})
test('review merge marks stale source text and refuses deleted anchors', () => {
  const p = project(); const exchange = makeReviewExchange({ ...p, reviewNotes: [note] })
  const changed = { ...p, elements: p.elements.map(x => x.id === 'a1' ? { ...x, text: '另一个动作' } : x) }
  assert.equal(previewReviewMerge(changed, exchange)[0].status, 'staleAnchor')
  const deleted = { ...p, elements: p.elements.filter(x => x.id !== 'a1') }
  assert.equal(previewReviewMerge(deleted, exchange)[0].status, 'missingAnchor')
  assert.equal(mergeReviewExchange(deleted, exchange, new Set(['n1'])).reviewNotes?.length, 0)
})
test('malformed review exchanges and duplicate note ids are rejected', () => {
  const p = project(); p.reviewNotes = [note]
  const exchange = makeReviewExchange(p)
  assert.throws(() => parseReviewExchange(JSON.stringify({ ...exchange, entries: [...exchange.entries, ...exchange.entries] })), /invalidData/u)
  assert.throws(() => parseReviewExchange(JSON.stringify({ ...exchange, entries: [{ note: { ...note, category: 'execute' }, anchorText: '' }] })), /invalidData/u)
})
test('anonymous exports remove identities, comments and paths without mutating the project', () => {
  const p = project(); p.author = '个人姓名'; p.titlePage!.authors = '个人姓名'; p.titlePage!.contact = 'name@example.com'
  p.elements.push({ id: 'private', type: 'note', text: '保密批注' }, { id: 'path', type: 'action', text: 'C:\\Users\\Private\\secret.png 和 /Users/private/image.png name@example.com', textStyle: { bold: true } })
  const before = serializeProjectForSave(p)
  const result = anonymousProject(p, defaultPrivacyOptions)
  assert.equal(result.author, '')
  assert.equal(result.titlePage?.contact, '')
  assert.equal(result.elements.some(x => x.type === 'note'), false)
  assert.equal(result.elements.at(-1)?.text.includes('Private'), false)
  assert.equal(result.elements.at(-1)?.textStyle?.bold, true)
  assert.equal(result.writingTools, undefined)
  assert.equal(privacyFindings(p).length, 1)
  assert.equal(serializeProjectForSave(p), before)
})
test('writing tool metadata survives save/reopen and retains dangling anchors for repair', () => {
  const p = project(); p.writingTools.aliases = aliases
  p.writingTools.tasks = [{ id: 't', elementId: 'deleted', text: '重写结尾', done: false }]
  p.writingTools.cuttings = [{ id: 'cut', title: '备用', sourceId: 'a1', sourceHeading: '原场景', createdAt: '2026-10-09', elements: [elements[1]] }]
  const reopened = normalizeScriptProject(JSON.parse(serializeProjectForSave(p)))
  assert.deepEqual(reopened.writingTools, p.writingTools)
  assert.equal(normalizeScriptProject(JSON.parse(serializeProjectForSave(reopened))).writingTools?.projectId, p.writingTools.projectId)
})
test('privacy redaction stops at Chinese punctuation and handles quoted paths with spaces', () => {
  const p = project()
  p.elements = [{ id: 'a', type: 'action', text: '打开 C:\\Users\\Writer\\frame.png，转身。再看“D:\\My Film\\private image.png”。' }]
  const copy = anonymousProject(p, defaultPrivacyOptions)
  assert.equal(copy.elements[0].text, '打开 [REDACTED]，转身。再看[REDACTED]。')
})
test('anonymous exports cover common Mac, Unix and home paths and offer email opt-out', () => {
  const p = project()
  p.elements = [{ id: 'a', type: 'action', text: '/var/folders/aa/private.pdf /Volumes/Film/shot.png /mnt/drive/x.png /tmp/a.pdf ~/Desktop/a.png name@example.com' }]
  assert.equal(privacyFindings(p)[0].matches.length, 6)
  const hidden = anonymousProject(p, defaultPrivacyOptions)
  assert.equal(hidden.elements[0].text.includes('example.com'), false)
  const retained = anonymousProject(p, { ...defaultPrivacyOptions, emails: false })
  assert.equal(retained.elements[0].text.includes('name@example.com'), true)
})
test('legacy projects acquire one stable local review identity and reject oversized metadata', () => {
  const old = project(); delete (old as { writingTools?: unknown }).writingTools
  const opened = normalizeScriptProject(old)
  assert.ok(opened.writingTools?.projectId)
  assert.equal(normalizeScriptProject(opened).writingTools?.projectId, opened.writingTools?.projectId)
  assert.throws(() => normalizeWritingTools({ ...opened.writingTools, tasks: Array(2001).fill({}) }, normalizeScriptElements), /invalidData/u)
})
test('portable relative image paths resolve after Windows and macOS relocation', () => {
  assert.equal(resolveLocalMediaSource('assets/000001.png', 'D:\\搬家\\project.ssproj'), 'file:///D:/%E6%90%AC%E5%AE%B6/assets/000001.png')
  assert.equal(resolveLocalMediaSource('assets/000001.png', '/Users/me/Film/project.ssproj'), 'file:///Users/me/Film/assets/000001.png')
})
