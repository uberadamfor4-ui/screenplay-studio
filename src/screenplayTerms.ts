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
  { id: 'int', label: '\u5185\u666f', token: { 'zh-CN': '\u5185\u666f', 'en-US': 'INT.', 'zh-TW': '\u5167\u666f' } },
  { id: 'ext', label: '\u5916\u666f', token: { 'zh-CN': '\u5916\u666f', 'en-US': 'EXT.', 'zh-TW': '\u5916\u666f' } },
  { id: 'int-ext', label: '\u5185/\u5916\u666f', token: { 'zh-CN': '\u5185/\u5916\u666f', 'en-US': 'INT./EXT.', 'zh-TW': '\u5167/\u5916\u666f' } },
  { id: 'ext-int', label: '\u5916/\u5185\u666f', token: { 'zh-CN': '\u5916/\u5185\u666f', 'en-US': 'EXT./INT.', 'zh-TW': '\u5916/\u5167\u666f' } },
]

export const sceneTimeTerms: Array<{
  id: SceneTimeId
  label: string
  token: Record<TermStyle, string>
}> = [
  { id: 'day', label: '\u65e5', token: { 'zh-CN': '\u65e5', 'en-US': 'DAY', 'zh-TW': '\u65e5' } },
  { id: 'night', label: '\u591c', token: { 'zh-CN': '\u591c', 'en-US': 'NIGHT', 'zh-TW': '\u591c' } },
  { id: 'morning', label: '\u65e9\u6668', token: { 'zh-CN': '\u65e9\u6668', 'en-US': 'MORNING', 'zh-TW': '\u65e9\u6668' } },
  { id: 'dawn', label: '\u9ece\u660e', token: { 'zh-CN': '\u9ece\u660e', 'en-US': 'DAWN', 'zh-TW': '\u9ece\u660e' } },
  { id: 'dusk', label: '\u9ec4\u660f', token: { 'zh-CN': '\u9ec4\u660f', 'en-US': 'DUSK', 'zh-TW': '\u9ec3\u660f' } },
  { id: 'continuous', label: '\u8fde\u7eed', token: { 'zh-CN': '\u8fde\u7eed', 'en-US': 'CONTINUOUS', 'zh-TW': '\u9023\u7e8c' } },
  { id: 'later', label: '\u7a0d\u540e', token: { 'zh-CN': '\u7a0d\u540e', 'en-US': 'LATER', 'zh-TW': '\u7a0d\u5f8c' } },
]

const defaultLocation: Record<TermStyle, string> = {
  'zh-CN': '\u5730\u70b9',
  'en-US': 'LOCATION',
  'zh-TW': '\u5730\u9ede',
}

const placeAliases: Array<[ScenePlaceId, RegExp]> = [
  ['int-ext', /^(?:INT\.?\s*\/\s*EXT\.?|I\/E\.?|\u5185\s*\/\s*\u5916\u666f|\u5185\u5916\u666f|\u5167\s*\/\s*\u5916\u666f|\u5167\u5916\u666f)(?=\s|$|[-\u2013\u2014])/i],
  ['ext-int', /^(?:EXT\.?\s*\/\s*INT\.?|E\/I\.?|\u5916\s*\/\s*\u5185\u666f|\u5916\u5185\u666f|\u5916\s*\/\s*\u5167\u666f|\u5916\u5167\u666f)(?=\s|$|[-\u2013\u2014])/i],
  ['int', /^(?:INT\.?|\u5185\u666f|\u5167\u666f)(?=\s|$|[-\u2013\u2014])/i],
  ['ext', /^(?:EXT\.?|\u5916\u666f)(?=\s|$|[-\u2013\u2014])/i],
]

const timeAliases: Array<[SceneTimeId, RegExp]> = [
  ['continuous', /^(?:CONTINUOUS|\u8fde\u7eed|\u9023\u7e8c)$/i],
  ['morning', /^(?:MORNING|\u65e9\u6668|\u65e9\u4e0a|\u4e0a\u5348)$/i],
  ['night', /^(?:NIGHT|\u591c|\u591c\u665a|\u665a\u4e0a)$/i],
  ['later', /^(?:LATER|\u7a0d\u540e|\u7a0d\u5f8c)$/i],
  ['dawn', /^(?:DAWN|\u9ece\u660e|\u6e05\u6668)$/i],
  ['dusk', /^(?:DUSK|\u9ec4\u660f|\u9ec3\u660f|\u508d\u665a)$/i],
  ['day', /^(?:DAY|\u65e5|\u767d\u5929|\u65e5\u95f4|\u65e5\u9593)$/i],
]

const timeSuffixPattern = /\s*[-\u2013\u2014]\s*([^-\u2013\u2014]+)\s*$/

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
  const token = value.match(timeSuffixPattern)?.[1]?.trim()
  if (!token) {
    return 'day'
  }

  return timeAliases.find(([, pattern]) => pattern.test(token))?.[0] ?? 'day'
}

function removeTime(value: string) {
  return value.replace(timeSuffixPattern, '')
}
