import type { ContinuityEntry, Cutting, EntityAlias, ProductionData, ReviewNote, ScriptElement, ScriptProject, WritingToolsData } from './types'
import { replaceElementsBounded, type ReplacementPair } from './textReplacement'
import { projectDataLimits } from './dataLimits'
import { cloneSnapshotElements } from './snapshotRestore'
import { stripSceneNumber } from './plainTextImport'
import { nextSceneSuffixes, parseSceneNumber } from './sceneNumbers'

export const toolLimits = { records: 2000, cuttings: 200, text: 10000, reviewBytes: 8 * 1024 * 1024 }
export class WritingToolError extends Error {}
function fail(code: string): never { throw new WritingToolError(code) }
export function toolId() { return crypto.randomUUID() }
export function emptyWritingTools(): WritingToolsData {
  return { projectId: toolId(), aliases: [], tasks: [], cuttings: [], continuity: [], storyLinks: [], reviewImports: [] }
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
function string(v: unknown, max = toolLimits.text) {
  if (typeof v !== 'string' || v.length > max) fail('invalidData')
  return v
}
function rows(v: unknown, max = toolLimits.records): Record<string, unknown>[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max || v.some(x => !x || typeof x !== 'object' || Array.isArray(x))) fail('invalidData')
  return v as Record<string, unknown>[]
}
function id(v: unknown) { return string(v, 256) || fail('invalidData') }
export function normalizeWritingTools(value: unknown, normalizeElements: (v: unknown) => ScriptElement[]): WritingToolsData {
  if (value === undefined) return emptyWritingTools()
  const r = record(value)
  const data: WritingToolsData = {
    projectId: id(r.projectId),
    aliases: rows(r.aliases).map(x => ({ id: id(x.id), kind: x.kind === 'location' || x.kind === 'character' ? x.kind : fail('invalidData'), canonical: string(x.canonical, 1000).trim(), aliases: rowsOfStrings(x.aliases, 100, 1000) })),
    tasks: rows(r.tasks).map(x => ({ id: id(x.id), elementId: id(x.elementId), text: string(x.text), done: x.done === true })),
    cuttings: rows(r.cuttings, toolLimits.cuttings).map(x => {
      if (!Array.isArray(x.elements) || x.elements.length > projectDataLimits.maxScriptElements) fail('invalidData')
      const elements = normalizeElements(x.elements)
      const anchors = new Set(elements.map(el => el.id))
      const reviewNotes = x.reviewNotes === undefined ? undefined : rows(x.reviewNotes, projectDataLimits.maxProductionRecordsPerCollection).map(value => {
        const note = normalizeCuttingNote(value)
        if (!anchors.has(note.elementId)) fail('invalidData')
        return note
      })
      if (reviewNotes && new Set(reviewNotes.map(note => note.id)).size !== reviewNotes.length) fail('invalidData')
      return { id: id(x.id), title: string(x.title, 1000), sourceId: string(x.sourceId, 256), sourceHeading: string(x.sourceHeading, 2000), createdAt: string(x.createdAt, 100), elements, ...(reviewNotes ? { reviewNotes } : {}) }
    }),
    continuity: rows(r.continuity).map(x => ({ id: id(x.id), sceneId: id(x.sceneId), day: typeof x.day === 'number' && Number.isInteger(x.day) && x.day >= 0 && x.day <= 100000 ? x.day : fail('invalidData'), time: string(x.time, 100), entity: string(x.entity, 1000), attribute: string(x.attribute, 1000), state: string(x.state), change: x.change === true })),
    storyLinks: rows(r.storyLinks).map(x => ({ id: id(x.id), title: string(x.title, 1000), setupId: id(x.setupId), payoffId: typeof x.payoffId === 'string' ? string(x.payoffId, 256) : '', status: x.status === 'resolved' ? 'resolved' : 'open' })),
    reviewImports: rowsOfStrings(r.reviewImports, toolLimits.records, 32000),
  }
  for (const collection of [data.aliases, data.tasks, data.cuttings, data.continuity, data.storyLinks]) {
    if (new Set(collection.map(x => x.id)).size !== collection.length) fail('invalidData')
  }
  validateAliases(data.aliases)
  return data
}
function rowsOfStrings(v: unknown, max: number, length: number): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max) fail('invalidData')
  return v.map(x => string(x, length))
}
function normalizeCuttingNote(x: Record<string, unknown>): ReviewNote {
  if (!['writer', 'director', 'producer', 'actor'].includes(x.category as string)) fail('invalidData')
  return { id: id(x.id), elementId: id(x.elementId), author: string(x.author, projectDataLimits.maxMetadataTextCharacters), category: x.category as ReviewNote['category'], text: string(x.text, projectDataLimits.maxMetadataTextCharacters), resolved: x.resolved === true, createdAt: string(x.createdAt, 100) }
}
export function entityKey(name: string) { return name.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() }
export function validateAliases(aliases: EntityAlias[]) {
  const used = new Set<string>()
  for (const alias of aliases) {
    if (!alias.canonical.trim() || alias.aliases.length === 0) fail('invalidAlias')
    const own = new Set<string>()
    for (const name of [alias.canonical, ...alias.aliases]) {
      const key = `${alias.kind}:${entityKey(name)}`
      if (!name.trim() || used.has(key) || own.has(key)) fail('aliasConflict')
      own.add(key)
    }
    own.forEach(key => used.add(key))
  }
}
export function createAliasResolver(aliases: EntityAlias[] = []) {
  const index = new Map<string, string>()
  for (const alias of aliases) for (const value of [alias.canonical, ...alias.aliases]) index.set(`${alias.kind}:${entityKey(value)}`, alias.canonical)
  return (name: string, kind: EntityAlias['kind']) => index.get(`${kind}:${entityKey(name)}`) ?? name
}
export function canonicalName(name: string, kind: EntityAlias['kind'], aliases: EntityAlias[] = []) {
  return createAliasResolver(aliases)(name, kind)
}
export function canonicalizeProduction(data: ProductionData, aliases: EntityAlias[]): ProductionData {
  if (!aliases.length && !data.scenes.some(x => x.aliasSourceLocationName) && !data.tags.some(x => x.aliasSourceName)) return data
  const resolve = createAliasResolver(aliases)
  return {
    ...data,
    scenes: data.scenes.map(x => {
      const source = x.aliasSourceLocationName ?? x.locationName
      const name = resolve(source, 'location')
      return { ...x, locationName: name, aliasSourceLocationName: name !== source ? source : undefined }
    }),
    tags: data.tags.map(x => {
      const source = x.aliasSourceName ?? x.name
      const name = x.category === 'cast' ? resolve(source, 'character') : x.category === 'location' ? resolve(source, 'location') : source
      return { ...x, name, aliasSourceName: name !== source ? source : undefined }
    }),
  }
}
export function sceneRange(elements: ScriptElement[], elementId: string) {
  const position = elements.findIndex(x => x.id === elementId)
  if (position < 0) return []
  let start = position
  while (start > 0 && elements[start].type !== 'scene') start--
  let end = start + 1
  while (end < elements.length && elements[end].type !== 'scene') end++
  return elements.slice(start, end)
}
export type ReplacementChange = { id: string; before: ScriptElement; after: ScriptElement }
export function replacementPreview(elements: ScriptElement[], pairs: ReplacementPair[], ids?: Set<string>): ReplacementChange[] {
  const source = ids ? elements.filter(x => ids.has(x.id)) : elements
  const result = replaceElementsBounded(source, pairs)
  return result.elements.flatMap((x, i) => x.text !== source[i].text ? [{ id: x.id, before: source[i], after: x }] : [])
}
export function applyReplacementPreview(elements: ScriptElement[], changes: ReplacementChange[], selected: Set<string>) {
  const map = new Map(elements.map(x => [x.id, x]))
  const accepted = changes.filter(x => selected.has(x.id))
  if (accepted.some(x => !map.has(x.id) || JSON.stringify(map.get(x.id)) !== JSON.stringify(x.before))) fail('stalePreview')
  const updates = new Map(accepted.map(x => [x.id, x.after]))
  return elements.map(x => updates.get(x.id) ?? x)
}
export function restoreCutting(elements: ScriptElement[], saved: ScriptElement[], afterId: string, replaceEmptyPlaceholder = false) {
  if (replaceEmptyPlaceholder && !(elements.length === 1 && elements[0].type === 'action' && elements[0].text === '' && saved.length)) fail('invalidData')
  if (elements.length + saved.length - (replaceEmptyPlaceholder ? 1 : 0) > projectDataLimits.maxScriptElements) fail('tooManyElements')
  const index = elements.findIndex(x => x.id === afterId)
  if (index < 0) fail('missingAnchor')
  const restored = cloneSnapshotElements(saved, [...elements, ...saved].map(x => x.id), toolId)
  const groups = new Map<string, string>()
  for (const el of restored) {
    delete el.revisionSetId
    if (el.type === 'scene') {
      if (el.sceneNumber && parseSceneNumber(el.text)?.value === el.sceneNumber.toUpperCase()) {
        const heading = stripSceneNumber(el.text)
        if (heading) el.text = heading
      }
      delete el.sceneNumber
    }
  }
  for (const el of restored) if (el.dualDialogue) {
    const group = el.dualDialogue.groupId
    if (!groups.has(group)) groups.set(group, toolId())
    el.dualDialogue = { ...el.dualDialogue, groupId: groups.get(group)! }
  }
  return replaceEmptyPlaceholder ? restored : [...elements.slice(0, index + 1), ...restored, ...elements.slice(index + 1)]
}
export function restoreCuttingProject(project: ScriptProject, cutting: Cutting, afterId: string): ScriptProject {
  const numbered = project.productionLock?.enabled || project.elements.some(el => el.type === 'scene' && el.sceneNumber)
  let ordinal = 0
  const source = project.elements.map(el => {
    if (el.type !== 'scene') return el
    ordinal++
    return numbered ? { ...el, sceneNumber: el.sceneNumber ?? project.productionLock?.sceneNumbers?.[el.id] ?? parseSceneNumber(el.text)?.value ?? String(ordinal) } : el
  })
  const only = source.length === 1 ? source[0] : undefined
  const replaceEmpty = Boolean(only && only.id === afterId && only.type === 'action' && only.text === '' && !only.textStyle && !only.revisionSetId && !only.dualDialogue
    && !project.reviewNotes?.some(note => note.elementId === only.id)
    && !project.writingTools?.tasks.some(task => task.elementId === only.id)
    && !project.writingTools?.storyLinks.some(link => link.setupId === only.id || link.payoffId === only.id))
  const elements = restoreCutting(source, cutting.elements, afterId, replaceEmpty)
  const index = source.findIndex(el => el.id === afterId)
  const offset = replaceEmpty ? 0 : index + 1
  const inserted = elements.slice(offset, offset + cutting.elements.length)
  const idMap = new Map(cutting.elements.map((el, i) => [el.id, inserted[i].id]))
  if (numbered) {
    const scenes = inserted.filter(el => el.type === 'scene')
    const previous = [...source.slice(0, index + 1)].reverse().find(el => el.type === 'scene')
    const next = source.slice(index + 1).find(el => el.type === 'scene')
    const previousNumber = previous ? parseSceneNumber(previous.sceneNumber ?? '') : undefined
    const base = previousNumber?.base ?? (next ? parseSceneNumber(next.sceneNumber ?? '')?.base : undefined) ?? 1
    const used = source.filter(el => el.type === 'scene').map(el => parseSceneNumber(el.sceneNumber ?? '')).filter(value => value?.base === base && (previousNumber ? !value.prefix : value.prefix))
    const suffixes = nextSceneSuffixes(used.map(value => previousNumber ? value!.suffix : value!.prefix), scenes.length)
    scenes.forEach((el, i) => { el.sceneNumber = previousNumber ? `${base}${suffixes[i]}` : `${suffixes[i]}${base}` })
  }
  const restoredNotes = (cutting.reviewNotes ?? []).map(note => ({ ...note, id: toolId(), elementId: idMap.get(note.elementId) ?? fail('invalidData') }))
  if ((project.reviewNotes?.length ?? 0) + restoredNotes.length > projectDataLimits.maxProductionRecordsPerCollection) fail('invalidData')
  return { ...project, elements, ...(restoredNotes.length ? { reviewNotes: [...(project.reviewNotes ?? []), ...restoredNotes] } : {}) }
}
export function detectPlaceholders(elements: ScriptElement[]) {
  return elements.filter(x => /\bTODO\b|待补|待補|这里补|這裡補|待完善|\[\?\?\?\]/iu.test(x.text))
}
export function continuityWarnings(elements: ScriptElement[], entries: ContinuityEntry[]) {
  const sceneIds = new Set(elements.filter(x => x.type === 'scene').map(x => x.id))
  const warnings: Array<{ id: string; code: 'missingAnchor' | 'stateConflict' | 'ambiguousTime'; previous?: ContinuityEntry }> = []
  const groups = new Map<string, ContinuityEntry[]>()
  for (const entry of entries) {
    if (!sceneIds.has(entry.sceneId)) { warnings.push({ id: entry.id, code: 'missingAnchor' }); continue }
    const key = JSON.stringify([entityKey(entry.entity), entityKey(entry.attribute)])
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
    group.forEach((entry, i) => {
      const previous = group[i - 1]
      if (!previous || entry.state === previous.state || entry.change) return
      const ambiguous = entry.day === previous.day && (!entry.time || !previous.time || entry.time === previous.time)
      warnings.push({ id: entry.id, code: ambiguous ? 'ambiguousTime' : 'stateConflict', previous })
    })
  }
  return warnings
}
export function storyLinkWarnings(project: ScriptProject) {
  const positions = new Map(project.elements.map((x, i) => [x.id, i]))
  return (project.writingTools?.storyLinks ?? []).flatMap(link => {
    if (!positions.has(link.setupId) || (link.payoffId && !positions.has(link.payoffId))) return [{ id: link.id, code: 'missingAnchor' }]
    if (!link.payoffId) return [{ id: link.id, code: 'missingPayoff' }]
    if (positions.get(link.payoffId)! <= positions.get(link.setupId)!) return [{ id: link.id, code: 'payoffBeforeSetup' }]
    return []
  })
}
export type RehearsalLine = { element: ScriptElement; speaker: string; scene: string }
export function rehearsalLines(elements: ScriptElement[], aliases: EntityAlias[] = []): RehearsalLine[] {
  let speaker = '', scene = ''
  const resolve = createAliasResolver(aliases)
  return elements.flatMap(element => {
    if (element.type === 'scene') { scene = element.text; speaker = '' }
    if (element.type === 'character') speaker = resolve(element.text.replace(/\s*[（(].*$/u, '').trim(), 'character')
    return element.type === 'dialogue' ? [{ element, speaker, scene }] : []
  })
}
export type ReviewExchange = { kind: 'screenplay-review'; version: 1; projectId: string; title: string; exportedAt: string; entries: Array<{ note: ReviewNote; anchorText: string }> }
export function makeReviewExchange(project: ScriptProject): ReviewExchange {
  if (!project.writingTools?.projectId) fail('invalidData')
  const elements = new Map(project.elements.map(x => [x.id, x.text]))
  return { kind: 'screenplay-review', version: 1, projectId: project.writingTools.projectId, title: project.title, exportedAt: new Date().toISOString(), entries: (project.reviewNotes ?? []).map(note => ({ note: { ...note }, anchorText: elements.get(note.elementId) ?? '' })) }
}
export function parseReviewExchange(source: string): ReviewExchange {
  if (new TextEncoder().encode(source).length > toolLimits.reviewBytes) fail('invalidData')
  const r = record(JSON.parse(source))
  if (r.kind !== 'screenplay-review' || r.version !== 1) fail('invalidData')
  const entries = rows(r.entries).map(entry => {
    const x = record(entry.note)
    const category = x.category
    if (!['writer', 'director', 'producer', 'actor'].includes(category as string)) fail('invalidData')
    return { note: { id: id(x.id), elementId: id(x.elementId), author: string(x.author, 1000), category: category as ReviewNote['category'], text: string(x.text), resolved: x.resolved === true, createdAt: string(x.createdAt, 100) }, anchorText: string(entry.anchorText, projectDataLimits.maxElementTextCharacters) }
  })
  if (new Set(entries.map(x => x.note.id)).size !== entries.length) fail('invalidData')
  return { kind: 'screenplay-review', version: 1, projectId: id(r.projectId), title: string(r.title, 1000), exportedAt: string(r.exportedAt, 100), entries }
}
const reviewToken = (note: ReviewNote) => JSON.stringify([note.id, note.elementId, note.author, note.category, note.text, note.resolved, note.createdAt])
export function previewReviewMerge(project: ScriptProject, exchange: ReviewExchange) {
  if (project.writingTools?.projectId !== exchange.projectId) fail('differentProject')
  const elements = new Map(project.elements.map(x => [x.id, x.text]))
  const notes = new Map((project.reviewNotes ?? []).map(x => [x.id, x]))
  const imported = new Set(project.writingTools?.reviewImports ?? [])
  return exchange.entries.map(entry => {
    const existing = notes.get(entry.note.id)
    const status = imported.has(reviewToken(entry.note)) || (existing && reviewToken(existing) === reviewToken(entry.note)) ? 'duplicate'
      : !elements.has(entry.note.elementId) ? 'missingAnchor'
        : existing ? 'conflict' : elements.get(entry.note.elementId) !== entry.anchorText ? 'staleAnchor' : 'new'
    return { ...entry, status }
  })
}
export function mergeReviewExchange(project: ScriptProject, exchange: ReviewExchange, selected: Set<string>): ScriptProject {
  const preview = previewReviewMerge(project, exchange)
  const accepted = preview.filter(x => selected.has(x.note.id) && x.status !== 'duplicate' && x.status !== 'missingAnchor')
  const imports = [...new Set([...(project.writingTools?.reviewImports ?? []), ...accepted.map(x => reviewToken(x.note))])]
  if (imports.length > toolLimits.records || (project.reviewNotes?.length ?? 0) + accepted.length > toolLimits.records) fail('invalidData')
  return { ...project, reviewNotes: [...(project.reviewNotes ?? []), ...accepted.map(x => ({ ...x.note, id: x.status === 'conflict' ? toolId() : x.note.id }))], writingTools: { ...project.writingTools!, reviewImports: imports } }
}
export type PrivacyOptions = { identity: boolean; notes: boolean; headers: boolean; paths: boolean; emails: boolean }
export const defaultPrivacyOptions: PrivacyOptions = { identity: true, notes: true, headers: true, paths: true, emails: true }
const pathPattern = /(?:["“](?:[a-z]:[\\/]|file:\/\/|\\\\[^\\\s]+\\|\/(?:Users|home|Volumes|var|private|mnt|media|tmp|opt|usr|Library|Applications)\/|~\/)[^"”\r\n]+["”]|(?:[a-z]:[\\/]|file:\/\/|\\\\[^\\\s]+\\|\/(?:Users|home|Volumes|var|private|mnt|media|tmp|opt|usr|Library|Applications)\/|~\/)[^\s<>"|，。；！？、）】》“”‘’]+)/giu
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu
export function privacyFindings(project: ScriptProject) {
  return project.elements.flatMap(el => {
    const matches = [...el.text.matchAll(pathPattern), ...el.text.matchAll(emailPattern)].map(x => x[0])
    return matches.length ? [{ id: el.id, matches }] : []
  })
}
export function anonymousProject(project: ScriptProject, options: PrivacyOptions): ScriptProject {
  const copy = structuredClone(project)
  delete copy.versionHistory
  delete copy.production
  delete copy.writingTools
  if (options.identity) {
    copy.author = ''
    if (copy.titlePage) Object.assign(copy.titlePage, { authors: '', contact: '', copyright: '' })
  }
  if (options.notes) { copy.reviewNotes = []; copy.elements = copy.elements.filter(x => x.type !== 'note') }
  if (options.headers && copy.exportSettings) Object.assign(copy.exportSettings, { headerText: '', footerText: '' })
  if (options.paths || options.emails) {
    const redact = (text: string) => {
      const withoutPaths = options.paths ? text.replace(pathPattern, '[REDACTED]') : text
      return options.emails ? withoutPaths.replace(emailPattern, '[REDACTED]') : withoutPaths
    }
    copy.elements = copy.elements.map(x => ({ ...x, text: redact(x.text) }))
    copy.title = redact(copy.title); copy.author = redact(copy.author)
    if (copy.titlePage) for (const key of ['title', 'credit', 'authors', 'basedOn', 'draftDate', 'contact', 'copyright'] as const) copy.titlePage[key] = redact(copy.titlePage[key])
    if (copy.exportSettings) { copy.exportSettings.headerText = redact(copy.exportSettings.headerText); copy.exportSettings.footerText = redact(copy.exportSettings.footerText) }
  }
  return copy
}
