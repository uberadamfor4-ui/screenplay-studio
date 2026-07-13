import { normalizeAppLocale } from './i18n'
import type { AppLocale, ScriptFormatId } from './types'
import type { ScenePlaceId, SceneTimeId, TermStyle } from './screenplayTerms'
import type { TransitionPresetId } from './transitions'

export type UserPreferences = {
  scriptLanguage: AppLocale
  termStyle: TermStyle
  defaultScenePlace: ScenePlaceId
  defaultSceneTime: SceneTimeId
  defaultTransition: TransitionPresetId
  defaultFormatId: ScriptFormatId
  defaultFontFamily: string
  defaultFontSize: number
}

export const defaultPreferences: UserPreferences = {
  scriptLanguage: 'zh-CN',
  termStyle: 'zh-CN',
  defaultScenePlace: 'int',
  defaultSceneTime: 'night',
  defaultTransition: 'cut-to',
  defaultFormatId: 'hollywood',
  defaultFontFamily: 'Courier Prime',
  defaultFontSize: 12,
}

const termStyles: TermStyle[] = ['zh-CN', 'en-US', 'zh-TW']
const scenePlaces: ScenePlaceId[] = ['int', 'ext', 'int-ext', 'ext-int']
const sceneTimes: SceneTimeId[] = ['day', 'night', 'morning', 'dawn', 'dusk', 'continuous', 'later']
const transitionIds: TransitionPresetId[] = [
  'cut-to',
  'dissolve-to',
  'fade-in',
  'fade-out',
  'fade-to-black',
  'match-cut-to',
  'jump-cut-to',
  'smash-cut-to',
  'wipe-to',
]
const formatIds: ScriptFormatId[] = ['hollywood', 'eastAsia', 'stage', 'audio']

export function normalizePreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') {
    return defaultPreferences
  }

  const payload = value as Partial<UserPreferences>
  return {
    scriptLanguage: normalizeAppLocale(payload.scriptLanguage),
    termStyle: normalizeOption(payload.termStyle, termStyles, defaultPreferences.termStyle),
    defaultScenePlace: normalizeOption(payload.defaultScenePlace, scenePlaces, defaultPreferences.defaultScenePlace),
    defaultSceneTime: normalizeOption(payload.defaultSceneTime, sceneTimes, defaultPreferences.defaultSceneTime),
    defaultTransition: normalizeOption(payload.defaultTransition, transitionIds, defaultPreferences.defaultTransition),
    defaultFormatId: normalizeOption(payload.defaultFormatId, formatIds, defaultPreferences.defaultFormatId),
    defaultFontFamily: normalizeDefaultFont(payload.defaultFontFamily),
    defaultFontSize: normalizeFontSize(payload.defaultFontSize),
  }
}

function normalizeDefaultFont(value: unknown) {
  const font = typeof value === 'string' && value.trim() ? value.trim() : defaultPreferences.defaultFontFamily
  return /^Courier New$/i.test(font) ? 'Courier Prime' : font
}

function normalizeOption<T extends string>(value: unknown, options: T[], fallback: T): T {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : fallback
}

function normalizeFontSize(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return defaultPreferences.defaultFontSize
  }

  return Math.min(24, Math.max(8, Math.round(numeric)))
}
