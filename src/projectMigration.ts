import { resolveExportSettings } from './exportProfiles'
import { createElement, getFormat } from './formats'
import { normalizeAppLocale } from './i18n'
import { normalizeProductionData, synchronizeProductionData } from './production'
import { createDefaultProject } from './sample'
import { projectDataLimits, stripControlCharacters } from './dataLimits'
import type {
  ExportSettings,
  ProductionLock,
  ReviewNote,
  ScriptElement,
  ScriptElementTextStyle,
  ScriptElementType,
  ScriptFormatId,
  ScriptProject,
  SeriesProject,
  TitlePageData,
  VersionSnapshot,
} from './types'

const currentAppVersion = '0.6.6'
const elementTypes = new Set<ScriptElementType>(['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'section', 'note'])
const formatIds = new Set<ScriptFormatId>(['hollywood', 'eastAsia', 'stage', 'audio'])
const reviewCategories = new Set<ReviewNote['category']>(['writer', 'director', 'producer', 'actor'])

export function normalizeScriptProject(value: unknown, fallback: ScriptProject = createDefaultProject()): ScriptProject {
  if (!isRecord(value)) {
    throw new Error('项目文件不是有效的剧本项目。')
  }
  if (!Array.isArray(value.elements)) {
    throw new Error('项目文件缺少正文段落，可能已损坏或不是剧本工坊项目。')
  }
  assertProductionDataLimits(value.production)

  const formatId = formatIds.has(value.formatId as ScriptFormatId) ? value.formatId as ScriptFormatId : fallback.formatId
  const format = getFormat(formatId)
  const title = boundedStringValue(value.title, fallback.title, 1000)
  const author = boundedStringValue(value.author, fallback.author, 1000)
  const elements = normalizeElements(value.elements)
  const base: ScriptProject = {
    appVersion: currentAppVersion,
    title,
    author,
    language: normalizeAppLocale(typeof value.language === 'string' ? value.language : fallback.language),
    formatId,
    fontFamily: normalizeFontFamily(value.fontFamily, formatId, fallback.fontFamily),
    fontSize: normalizeFontSize(value.fontSize, fallback.fontSize),
    pageSize: value.pageSize === 'a4' || value.pageSize === 'letter' ? value.pageSize : format.page.kind,
    elements: elements.length > 0 ? elements : [createElement('action', '')],
  }

  const project: ScriptProject = {
    ...base,
    titlePage: normalizeTitlePage(value.titlePage, base),
    exportSettings: normalizeExportSettings(value.exportSettings, base),
    productionLock: normalizeProductionLock(value.productionLock),
    series: normalizeSeries(value.series),
    reviewNotes: normalizeReviewNotes(value.reviewNotes, base.elements),
    versionHistory: normalizeVersionHistory(value.versionHistory),
  }
  const production = isRecord(value.production) ? normalizeProductionData(value.production) : undefined
  project.production = synchronizeProductionData(project.elements, production)
  return project
}

export function normalizeScriptElements(value: unknown): ScriptElement[] {
  return Array.isArray(value) ? normalizeElements(value) : []
}

function normalizeElements(value: unknown[]): ScriptElement[] {
  if (value.length > projectDataLimits.maxScriptElements) {
    throw new Error(`项目正文超过 ${projectDataLimits.maxScriptElements} 个段落，请拆分项目后再打开。`)
  }
  const usedIds = new Set<string>()
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const type = elementTypes.has(item.type as ScriptElementType) ? item.type as ScriptElementType : 'action'
    const text = typeof item.text === 'string' ? item.text : ''
    if (text.length > projectDataLimits.maxElementTextCharacters) {
      throw new Error('项目包含过长的单个段落，请拆分该段落后再打开。')
    }
    const generated = createElement(type, text)
    let id = identifierValue(item.id, generated.id)
    if (!id || usedIds.has(id)) id = generated.id
    while (usedIds.has(id)) id = createElement(type, '').id
    usedIds.add(id)

    const element: ScriptElement = { id, type, text }
    const textStyle = normalizeTextStyle(item.textStyle)
    if (textStyle) element.textStyle = textStyle
    if (typeof item.sceneNumber === 'string' && item.sceneNumber.trim()) element.sceneNumber = identifierValue(item.sceneNumber, '')
    if (typeof item.revisionSetId === 'string' && item.revisionSetId.trim()) element.revisionSetId = identifierValue(item.revisionSetId, '')
    if (isRecord(item.dualDialogue) && typeof item.dualDialogue.groupId === 'string' && (item.dualDialogue.side === 'left' || item.dualDialogue.side === 'right')) {
      const groupId = identifierValue(item.dualDialogue.groupId, '')
      if (groupId) element.dualDialogue = { groupId, side: item.dualDialogue.side }
    }
    return [element]
  })
}

function normalizeTextStyle(value: unknown): ScriptElementTextStyle | undefined {
  if (!isRecord(value)) return undefined
  const style: ScriptElementTextStyle = {}
  if (typeof value.bold === 'boolean') style.bold = value.bold
  if (typeof value.italic === 'boolean') style.italic = value.italic
  if (typeof value.underline === 'boolean') style.underline = value.underline
  if (typeof value.fontFamily === 'string' && value.fontFamily.trim()) {
    const fontFamily = normalizeFontName(value.fontFamily, '')
    if (fontFamily) style.fontFamily = fontFamily
  }
  return Object.keys(style).length > 0 ? style : undefined
}

function normalizeTitlePage(value: unknown, project: ScriptProject): TitlePageData {
  const defaults = {
    enabled: true,
    title: project.title,
    credit: '编剧',
    authors: project.author,
    basedOn: '',
    draftDate: '',
    contact: '',
    copyright: '',
  }
  if (!isRecord(value)) return defaults
  return {
    enabled: booleanValue(value.enabled, defaults.enabled),
    title: boundedStringValue(value.title, defaults.title, 1000),
    credit: boundedStringValue(value.credit, defaults.credit, 1000),
    authors: boundedStringValue(value.authors, defaults.authors, 1000),
    basedOn: boundedStringValue(value.basedOn, defaults.basedOn, 2000),
    draftDate: boundedStringValue(value.draftDate, defaults.draftDate, 200),
    contact: boundedStringValue(value.contact, defaults.contact, 10_000),
    copyright: boundedStringValue(value.copyright, defaults.copyright, 10_000),
  }
}

function normalizeExportSettings(value: unknown, project: ScriptProject): ExportSettings {
  const raw = isRecord(value) ? value : undefined
  const resolved = resolveExportSettings({ ...project, exportSettings: raw ? raw as unknown as ExportSettings : undefined })
  return {
    profileId: resolved.profileId,
    includeTitlePage: booleanValue(raw?.includeTitlePage, resolved.includeTitlePage),
    moreContinued: booleanValue(raw?.moreContinued, resolved.moreContinued),
    sceneNumbers: booleanValue(raw?.sceneNumbers, resolved.sceneNumbers),
    lockedPageLabels: booleanValue(raw?.lockedPageLabels, resolved.lockedPageLabels),
    headerText: boundedStringValue(raw?.headerText, resolved.headerText, 1000),
    footerText: boundedStringValue(raw?.footerText, resolved.footerText, 1000),
  }
}

function normalizeProductionLock(value: unknown): ProductionLock | undefined {
  if (!isRecord(value)) return undefined
  const sceneNumbers = isRecord(value.sceneNumbers)
    ? Object.fromEntries(
      Object.entries(value.sceneNumbers)
        .slice(0, projectDataLimits.maxScriptElements)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([id, number]) => [identifierValue(id, ''), identifierValue(number, '')])
        .filter(([id, number]) => Boolean(id && number)),
    )
    : undefined
  return {
    enabled: booleanValue(value.enabled, false),
    pages: nonNegativeInteger(value.pages),
    scenes: nonNegativeInteger(value.scenes),
    lockedAt: stringValue(value.lockedAt, ''),
    pageLabels: stringArray(value.pageLabels),
    sceneNumbers,
  }
}

function normalizeSeries(value: unknown): SeriesProject | undefined {
  if (!isRecord(value) || !Array.isArray(value.episodes)) return undefined
  const usedIds = new Set<string>()
  return {
    title: stringValue(value.title, ''),
    episodes: value.episodes.slice(0, projectDataLimits.maxProductionRecordsPerCollection).flatMap((episode) => {
      if (!isRecord(episode)) return []
      return [{
        id: uniqueRecordId(episode.id, usedIds),
        title: stringValue(episode.title, ''),
        logline: stringValue(episode.logline, ''),
        pages: nonNegativeInteger(episode.pages),
        scenes: nonNegativeInteger(episode.scenes),
        characters: stringArray(episode.characters) ?? [],
        updatedAt: stringValue(episode.updatedAt, ''),
      }]
    }),
  }
}

function normalizeReviewNotes(value: unknown, elements: ScriptElement[]): ReviewNote[] | undefined {
  if (!Array.isArray(value)) return undefined
  const elementIds = new Set(elements.map((element) => element.id))
  const usedIds = new Set<string>()
  return value.slice(0, projectDataLimits.maxProductionRecordsPerCollection).flatMap((note) => {
    if (!isRecord(note) || typeof note.elementId !== 'string') return []
    const elementId = identifierValue(note.elementId, '')
    if (!elementIds.has(elementId)) return []
    const category = reviewCategories.has(note.category as ReviewNote['category']) ? note.category as ReviewNote['category'] : 'writer'
    return [{
      id: uniqueRecordId(note.id, usedIds),
      elementId,
      author: stringValue(note.author, ''),
      category,
      text: stringValue(note.text, ''),
      resolved: booleanValue(note.resolved, false),
      createdAt: stringValue(note.createdAt, ''),
    }]
  })
}

function normalizeVersionHistory(value: unknown): VersionSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined
  const usedIds = new Set<string>()
  return value.slice(0, 40).flatMap((snapshot) => {
    if (!isRecord(snapshot) || !Array.isArray(snapshot.elements)) return []
    try {
      return [{
        id: uniqueRecordId(snapshot.id, usedIds),
        title: stringValue(snapshot.title, ''),
        note: stringValue(snapshot.note, ''),
        createdAt: stringValue(snapshot.createdAt, ''),
        elements: normalizeElements(snapshot.elements),
      }]
    } catch {
      return []
    }
  })
}

function normalizeFontFamily(value: unknown, formatId: ScriptFormatId, fallback: string) {
  const font = normalizeFontName(value, fallback)
  return formatId === 'hollywood' && /^Courier New$/i.test(font) ? 'Courier Prime' : font
}

function normalizeFontName(value: unknown, fallback: string) {
  const font = (typeof value === 'string' ? value : fallback)
    .normalize('NFC')
  const cleanFont = stripControlCharacters(font)
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 128)
  return cleanFont || fallback
}

function normalizeFontSize(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(24, Math.max(8, Math.round(number))) : fallback
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
      .slice(0, projectDataLimits.maxStringArrayItems)
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.slice(0, projectDataLimits.maxMetadataTextCharacters))
    : undefined
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.slice(0, projectDataLimits.maxMetadataTextCharacters) : fallback
}

function boundedStringValue(value: unknown, fallback: string, maxCharacters: number) {
  return typeof value === 'string' ? value.slice(0, maxCharacters) : fallback
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function uniqueRecordId(value: unknown, usedIds: Set<string>) {
  let id = identifierValue(value, '')
  while (!id || usedIds.has(id)) id = createElement('note', '').id
  usedIds.add(id)
  return id
}

function identifierValue(value: unknown, fallback: string) {
  return stripControlCharacters(typeof value === 'string' ? value : fallback)
    .trim()
    .slice(0, projectDataLimits.maxIdentifierCharacters)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertProductionDataLimits(value: unknown) {
  if (!isRecord(value)) return
  const collectionKeys = [
    'scenes',
    'tags',
    'locations',
    'shots',
    'takes',
    'assets',
    'shootDays',
    'tasks',
    'notes',
    'changeImpacts',
    'revisionSets',
    'revisionDistributions',
    'castAvailability',
    'travelTimes',
    'budgetLines',
    'assetEvents',
  ]
  for (const key of collectionKeys) {
    const collection = value[key]
    if (Array.isArray(collection) && collection.length > projectDataLimits.maxProductionRecordsPerCollection) {
      throw new Error(`项目中的${key}记录过多，请拆分项目后再打开。`)
    }
  }
  if (isRecord(value.sceneFingerprints)) {
    let fingerprints = 0
    for (const _key in value.sceneFingerprints) {
      fingerprints += 1
      if (fingerprints > projectDataLimits.maxProductionRecordsPerCollection) {
        throw new Error('项目中的场景指纹记录过多，请拆分项目后再打开。')
      }
    }
  }
}
