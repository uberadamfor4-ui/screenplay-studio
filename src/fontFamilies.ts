import type { AppLocale, ScriptProject } from './types'

const chineseNames: Record<string, string> = {
  simsun: '宋体', nsimsun: '新宋体', simhei: '黑体', kaiti: '楷体', fangsong: '仿宋',
  dengxian: '等线', 'microsoft yahei': '微软雅黑', 'microsoft yahei ui': '微软雅黑 UI',
  'microsoft jhenghei': '微软正黑体', 'microsoft jhenghei ui': '微软正黑体 UI',
  'songti sc': '宋体-简', 'songti tc': '宋体-繁', 'pingfang sc': '苹方-简', 'pingfang tc': '苹方-繁',
  'screenplay cjk': '内置中文黑体', 'screenplay cjk sc': '内置中文黑体',
  'simsun-extb': '宋体扩展 B（补充字形）', 'simsun-extg': '宋体扩展 G（补充字形）',
}

const aliases: Record<string, string> = {
  '宋体': 'SimSun', '新宋体': 'NSimSun', '黑体': 'SimHei', '楷体': 'KaiTi', '仿宋': 'FangSong',
  '等线': 'DengXian', '微软雅黑': 'Microsoft YaHei', '微软正黑体': 'Microsoft JhengHei',
  '宋體': 'SimSun', '新宋體': 'NSimSun', '黑體': 'SimHei', '楷體': 'KaiTi', '仿宋體': 'FangSong',
  'screenplay cjk sc': 'Screenplay CJK',
}

export const bundledFonts = ['Courier Prime', 'Screenplay CJK']

export function cleanFontFamily(value: string) {
  return value.normalize('NFC').replace(/["\\;:{}<>]/g, '').replace(/\p{Cc}/gu, '').replace(/\s+/g, ' ').trim().slice(0, 128)
}

export function canonicalFontFamily(family: string) {
  const clean = cleanFontFamily(family)
  return aliases[clean.toLowerCase()] ?? clean
}

export function fontKey(family: string) {
  return canonicalFontFamily(family).toLowerCase()
}

export function isBundledFont(family: string) {
  return bundledFonts.some(font => fontKey(font) === fontKey(family))
}

export function isFontAvailable(family: string, installed: string[]) {
  return isSelectableFont(family) && (isBundledFont(family) || installed.some(font => fontKey(font) === fontKey(family)))
}

export function buildFontCatalog(installed: string[]) {
  const unique = new Map<string, string>()
  for (const family of [...bundledFonts, ...installed]) {
    if (isSelectableFont(family)) unique.set(fontKey(family), canonicalFontFamily(family))
  }
  return [...unique.values()].sort((a, b) => fontDisplayName(a).localeCompare(fontDisplayName(b), 'zh-CN'))
}

export function fontDisplayName(family: string, locale: AppLocale = 'zh-CN') {
  if (!isSelectableFont(family)) return locale === 'en-US' ? 'Unrecognized legacy font' : locale === 'zh-TW' ? '無法識別的舊字體' : '无法识别的旧字体'
  if (locale === 'en-US') return family
  const name = chineseNames[fontKey(family)] ?? family
  return locale === 'zh-TW' ? name.replace(/体/g, '體').replace(/内置/g, '內建').replace(/简/g, '簡').replace(/扩/g, '擴').replace(/补/g, '補') : name
}

export function readStoredInlineFont(style: string) {
  const stored = /--screenplay-font:\s*([^;]+)/.exec(style)?.[1]
  if (stored) {
    try { return cleanFontFamily(decodeURIComponent(stored.trim())) || undefined } catch { return undefined }
  }
  return /font-family:\s*([^;]+)/.exec(style)?.[1]?.replace(/^['"]|['"]$/g, '')
}

export function isSelectableFont(family: string) {
  return Boolean(cleanFontFamily(family)) && !/^@|^w_MSCS|\uFFFD/i.test(family.trim())
}

export function fontFallbacks(family: string) {
  const preferred = canonicalFontFamily(family)
  const key = preferred.toLowerCase()
  const serif = /(?:simsun|nsimsun|songti|serif|times|georgia|baskerville|宋|明朝)/i.test(key) && !/sans/i.test(key)
  const kai = /(?:kaiti|fangsong|楷|仿宋)/i.test(key)
  const related = kai ? ['KaiTi', 'Kaiti SC', 'FangSong', 'STFangsong', 'Songti SC']
    : serif ? ['SimSun', 'Songti SC', 'Songti TC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'Times New Roman']
      : /courier|mono|consolas|menlo/i.test(key) ? ['Courier Prime', 'Courier New'] : ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC']
  return [...new Set([...(isSelectableFont(preferred) ? [preferred] : []), ...related, 'Screenplay CJK'])]
}

export function projectFontFamilies(project: Pick<ScriptProject, 'fontFamily' | 'elements'>) {
  return [...new Set([project.fontFamily, ...project.elements.flatMap(element => [element.textStyle?.fontFamily, ...(element.textRuns ?? []).map(run => run.fontFamily)])].filter((font): font is string => Boolean(font?.trim())))]
}

export function changeProjectFont(project: ScriptProject, family: string): ScriptProject {
  if (!isSelectableFont(family)) return project
  const fontFamily = canonicalFontFamily(family)
  const hasOverrides = project.elements.some(element => element.textStyle?.fontFamily || element.textRuns?.some(run => run.fontFamily))
  if (fontKey(project.fontFamily) === fontKey(fontFamily) && !hasOverrides) return project
  return { ...project, fontFamily, elements: project.elements.map(element => {
    if (!element.textStyle?.fontFamily && !element.textRuns?.some(run => run.fontFamily)) return element
    const textStyle = { ...element.textStyle }
    delete textStyle.fontFamily
    return { ...element, textStyle: Object.keys(textStyle).length ? textStyle : undefined, textRuns: element.textRuns?.map(run => { const next = { ...run }; delete next.fontFamily; return next }).filter(run => Object.keys(run).length > 2) }
  }) }
}
