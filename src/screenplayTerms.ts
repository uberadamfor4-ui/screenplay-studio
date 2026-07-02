export type TermStyle = 'zh-CN' | 'en-US' | 'zh-TW'
export type ScenePlaceId = 'int' | 'ext' | 'int-ext' | 'ext-int'
export type SceneTimeId = 'day' | 'night' | 'morning' | 'dawn' | 'dusk' | 'continuous' | 'later'

export type SceneHeadingParts = {
  place: ScenePlaceId
  location: string
  time: SceneTimeId
  style: TermStyle
}

export const scenePlaceTerms: Array<{
  id: ScenePlaceId
  label: string
  token: Record<TermStyle, string>
}> = [
  { id: 'int', label: '内景', token: { 'zh-CN': '内景', 'en-US': 'INT.', 'zh-TW': '內景' } },
  { id: 'ext', label: '外景', token: { 'zh-CN': '外景', 'en-US': 'EXT.', 'zh-TW': '外景' } },
  { id: 'int-ext', label: '内/外景', token: { 'zh-CN': '内/外景', 'en-US': 'INT./EXT.', 'zh-TW': '內/外景' } },
  { id: 'ext-int', label: '外/内景', token: { 'zh-CN': '外/内景', 'en-US': 'EXT./INT.', 'zh-TW': '外/內景' } },
]

export const sceneTimeTerms: Array<{
  id: SceneTimeId
  label: string
  token: Record<TermStyle, string>
}> = [
  { id: 'day', label: '日', token: { 'zh-CN': '日', 'en-US': 'DAY', 'zh-TW': '日' } },
  { id: 'night', label: '夜', token: { 'zh-CN': '夜', 'en-US': 'NIGHT', 'zh-TW': '夜' } },
  { id: 'morning', label: '早晨', token: { 'zh-CN': '早晨', 'en-US': 'MORNING', 'zh-TW': '早晨' } },
  { id: 'dawn', label: '黎明', token: { 'zh-CN': '黎明', 'en-US': 'DAWN', 'zh-TW': '黎明' } },
  { id: 'dusk', label: '黄昏', token: { 'zh-CN': '黄昏', 'en-US': 'DUSK', 'zh-TW': '黃昏' } },
  { id: 'continuous', label: '连续', token: { 'zh-CN': '连续', 'en-US': 'CONTINUOUS', 'zh-TW': '連續' } },
  { id: 'later', label: '稍后', token: { 'zh-CN': '稍后', 'en-US': 'LATER', 'zh-TW': '稍後' } },
]

const defaultLocation: Record<TermStyle, string> = {
  'zh-CN': '地点',
  'en-US': 'LOCATION',
  'zh-TW': '地點',
}

const placeAliases: Array<[ScenePlaceId, RegExp]> = [
  ['int-ext', /^(INT\.?\s*\/\s*EXT\.?|内\s*\/\s*外景|内外景|內\s*\/\s*外景|內外景)(?=\s|$)/i],
  ['ext-int', /^(EXT\.?\s*\/\s*INT\.?|外\s*\/\s*内景|外内景|外\s*\/\s*內景|外內景)(?=\s|$)/i],
  ['int', /^(INT\.?|内景|內景)(?=\s|$)/i],
  ['ext', /^(EXT\.?|外景)(?=\s|$)/i],
]

const timeAliases: Array<[SceneTimeId, RegExp]> = [
  ['continuous', /^(CONTINUOUS|连续|連續)$/i],
  ['morning', /^(MORNING|早晨|早上|上午)$/i],
  ['night', /^(NIGHT|夜|晚上|夜晚)$/i],
  ['later', /^(LATER|稍后|稍後)$/i],
  ['dawn', /^(DAWN|黎明|清晨)$/i],
  ['dusk', /^(DUSK|黄昏|黃昏|傍晚)$/i],
  ['day', /^(DAY|日|白天|日间|日間)$/i],
]

export function buildSceneHeading(parts: SceneHeadingParts) {
  const place = getScenePlaceToken(parts.place, parts.style)
  const time = getSceneTimeToken(parts.time, parts.style)
  const location = parts.location.trim() || defaultLocation[parts.style]
  return `${place} ${location} - ${time}`
}

export function convertSceneHeading(value: string, style: TermStyle) {
  const parsed = parseSceneHeading(value)
  return buildSceneHeading({ ...parsed, style })
}

export function parseSceneHeading(value: string) {
  const source = value.trim()
  const place = detectPlace(source)
  const withoutPlace = removePlace(source)
  const time = detectTime(withoutPlace)
  const location = removeTime(withoutPlace).trim() || defaultLocation['zh-CN']
  return { place, location, time }
}

export function getScenePlaceToken(id: ScenePlaceId, style: TermStyle) {
  return scenePlaceTerms.find((item) => item.id === id)?.token[style] ?? scenePlaceTerms[0].token[style]
}

export function getSceneTimeToken(id: SceneTimeId, style: TermStyle) {
  return sceneTimeTerms.find((item) => item.id === id)?.token[style] ?? sceneTimeTerms[0].token[style]
}

function detectPlace(value: string): ScenePlaceId {
  return placeAliases.find(([, pattern]) => pattern.test(value))?.[0] ?? 'int'
}

function removePlace(value: string) {
  const alias = placeAliases.find(([, pattern]) => pattern.test(value))
  return alias ? value.replace(alias[1], '').trim() : value
}

function detectTime(value: string): SceneTimeId {
  const match = value.match(/[-－—]\s*([^-－—]+)\s*$/)
  const token = match?.[1]?.trim()
  if (!token) {
    return 'day'
  }

  return timeAliases.find(([, pattern]) => pattern.test(token))?.[0] ?? 'day'
}

function removeTime(value: string) {
  return value.replace(/\s*[-－—]\s*([^-－—]+)\s*$/, '')
}
