import { projectDataLimits } from './dataLimits'
import { normalizeWritingTools, toolId } from './writingTools'
import { normalizeScriptProject } from './projectMigration'
import type { ScriptElement, ScriptElementType, ScriptProject } from './types'

export type ImportReview = { source: string; project: ScriptProject; sourceVersion?: string }
export type SceneUnit = { key: string; heading: string; elements: ScriptElement[] }
export type WorkflowWarning = 'cue' | 'orphan' | 'empty' | 'version' | 'font' | 'assets' | 'locked' | 'metadata'
const types = new Set<ScriptElementType>(['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'section', 'note'])

export function editImportedElement(project: ScriptProject, id: string, patch: { type?: ScriptElementType; text?: string }) {
  if (patch.type && !types.has(patch.type)) throw new Error('invalidType')
  if (patch.text !== undefined && patch.text.length > projectDataLimits.maxElementTextCharacters) throw new Error('tooLong')
  if (!project.elements.some(e => e.id === id)) throw new Error('missingElement')
  return { ...project, elements: project.elements.map(e => e.id === id ? { ...e, ...patch } : e) }
}

export function importWarning(element: ScriptElement, previous?: ScriptElement): WorkflowWarning | undefined {
  if (!element.text.trim()) return 'empty'
  if (element.type === 'character') return 'cue'
  if ((element.type === 'parenthetical' || element.type === 'dialogue') && !previous) return 'orphan'
  if (element.type === 'parenthetical' && previous && !['character', 'dialogue', 'parenthetical'].includes(previous.type)) return 'orphan'
  if (element.type === 'dialogue' && previous && !['character', 'dialogue', 'parenthetical'].includes(previous.type)) return 'orphan'
  return undefined
}

export function sceneUnits(elements: ScriptElement[]): SceneUnit[] {
  const result: SceneUnit[] = []
  for (const element of elements) {
    if (element.type === 'scene' || !result.length) result.push({ key: element.id, heading: element.type === 'scene' ? element.text : '', elements: [] })
    result[result.length - 1].elements.push(element)
  }
  return result
}

export function sameHandoffFamily(a: ScriptProject, b: ScriptProject) {
  const family = (p: ScriptProject) => p.handoff?.familyId || p.writingTools?.projectId
  return Boolean(family(a) && family(a) === family(b))
}

export function stampHandoff(project: ScriptProject, platform: string, version: string): ScriptProject {
  const familyId = project.handoff?.familyId || project.writingTools?.projectId || toolId()
  const sourcePlatform = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : ['windows', 'mac', 'android', 'browser'].includes(platform) ? platform : 'desktop'
  return { ...project, handoff: { familyId, branchId: project.handoff?.branchId || toolId(), sourcePlatform, sourceVersion: version.slice(0, 30), exportedAt: new Date().toISOString() } }
}

export function handoffWarnings(project: ScriptProject, availableFonts: string[] = [], sourceVersion = project.appVersion): WorkflowWarning[] {
  const warnings: WorkflowWarning[] = []
  if (sourceVersion !== project.appVersion) warnings.push('version')
  const fonts = new Set([project.fontFamily, ...project.elements.map(e => e.textStyle?.fontFamily).filter((f): f is string => Boolean(f))])
  if (availableFonts.length && [...fonts].some(f => !availableFonts.includes(f) && !/^(?:Screenplay CJK|Courier Prime)$/u.test(f))) warnings.push('font')
  if (project.production && (project.production.locations.some(l => l.photoPaths.length) || project.production.shots.some(s => s.storyboardPath) || project.production.assets.some(a => a.photoPaths.length))) warnings.push('assets')
  if (project.productionLock?.enabled) warnings.push('locked')
  if (project.production || project.reviewNotes?.length || project.writingTools?.tasks.length) warnings.push('metadata')
  return warnings
}

export function forkHandoffCopy(project: ScriptProject): ScriptProject {
  const id = toolId()
  return { ...project, writingTools: { ...normalizeWritingTools(project.writingTools, x => x as ScriptElement[]), projectId: id }, handoff: { familyId: project.handoff?.familyId || project.writingTools?.projectId || id, branchId: id, sourcePlatform: project.handoff?.sourcePlatform || 'unknown', sourceVersion: project.handoff?.sourceVersion || project.appVersion, exportedAt: project.handoff?.exportedAt || new Date().toISOString() } }
}

export function sceneDifference(a: SceneUnit | undefined, b: SceneUnit) {
  if (!a) return 'added' as const
  const values = (e: ScriptElement) => [e.id, e.type, e.text, e.sceneNumber, e.revisionSetId, Boolean(e.textStyle?.bold), Boolean(e.textStyle?.italic), Boolean(e.textStyle?.underline), e.textStyle?.fontFamily || '', e.dualDialogue?.groupId, e.dualDialogue?.side]
  return a.elements.length === b.elements.length && a.elements.every((e, i) => JSON.stringify(values(e)) === JSON.stringify(values(b.elements[i]))) ? 'same' as const : 'changed' as const
}

export function mergeHandoffScenes(current: ScriptProject, incoming: ScriptProject, keys: string[], title: string): ScriptProject {
  if (current.productionLock?.enabled || incoming.productionLock?.enabled) throw new Error('locked')
  const selected = new Set(keys), source = sceneUnits(incoming.elements)
  if (!selected.size || source.filter(s => selected.has(s.key)).length !== selected.size) throw new Error('invalidSelection')
  const same = sameHandoffFamily(current, incoming)
  const existing = sceneUnits(current.elements), replacements = new Map(source.filter(s => selected.has(s.key)).map(s => [s.key, s]))
  const removedIds = new Set(same ? existing.filter(s => selected.has(s.key)).flatMap(s => s.elements.map(e => e.id)) : [])
  if (current.elements.length - removedIds.size + source.filter(s => selected.has(s.key)).reduce((n, s) => n + s.elements.length, 0) > projectDataLimits.maxScriptElements) throw new Error('tooManyElements')
  const retainedIds = current.elements.filter(e => !removedIds.has(e.id)).map(e => e.id)
  const used = new Set(retainedIds)
  const usedGroups = new Set(current.elements.filter(e => !removedIds.has(e.id)).map(e => e.dualDialogue?.groupId).filter((s): s is string => Boolean(s)))
  const copyElements = (items: ScriptElement[], preserve: boolean) => {
    const localIds = new Set<string>()
    const cloned = items.map(e => { let id = e.id; if (!preserve) while (used.has(id) || localIds.has(id)) id = toolId(); localIds.add(id); return { ...e, id, textStyle: e.textStyle ? { ...e.textStyle } : undefined, dualDialogue: e.dualDialogue ? { ...e.dualDialogue } : undefined } })
    if (cloned.some(e => used.has(e.id))) throw new Error('idConflict')
    const groups = new Map<string, string>()
    for (const e of cloned) if (e.dualDialogue && !groups.has(e.dualDialogue.groupId)) groups.set(e.dualDialogue.groupId, !preserve || usedGroups.has(e.dualDialogue.groupId) ? toolId() : e.dualDialogue.groupId)
    cloned.forEach(e => { used.add(e.id); if (e.dualDialogue) { e.dualDialogue.groupId = groups.get(e.dualDialogue.groupId)!; usedGroups.add(e.dualDialogue.groupId) } })
    return cloned
  }
  const elements: ScriptElement[] = []
  for (const unit of existing) {
    const replacement = same ? replacements.get(unit.key) : undefined
    if (replacement) { elements.push(...copyElements(replacement.elements, true)); replacements.delete(unit.key) }
    else elements.push(...unit.elements)
  }
  for (const unit of source) if (replacements.has(unit.key)) elements.push(...copyElements(unit.elements, false))
  if (elements.length > projectDataLimits.maxScriptElements) throw new Error('tooManyElements')
  const id = toolId(), writingTools = normalizeWritingTools(current.writingTools, x => x as ScriptElement[])
  const next = normalizeScriptProject({ ...current, title, elements, writingTools: { ...writingTools, projectId: id }, handoff: { familyId: current.handoff?.familyId || current.writingTools?.projectId || id, branchId: id, sourcePlatform: 'desktop', sourceVersion: current.appVersion, exportedAt: new Date().toISOString() } })
  next.titlePage = next.titlePage ? { ...next.titlePage, title } : undefined
  return next
}
