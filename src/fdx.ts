import type { ScriptElement, ScriptElementType, ScriptProject, TitlePageData } from './types'
import { projectDataLimits, stripControlCharacters } from './dataLimits'
import { createElement, getFormat } from './formats'
import { createDefaultProject } from './sample'
import { createDefaultTitlePage } from './exportProfiles'
import { createFallbackTextMeasurer, layoutScreenplay } from './layoutEngine'
import { getValidDualDialogueGroupIds } from './dualDialogue'

export type FdxInteropCheck = {
  id: string
  label: string
  status: 'pass' | 'warning' | 'fail'
  detail: string
}

export type FdxInteropReport = {
  id: string
  sourceName: string
  checkedAt: string
  documentVersion: string
  score: number
  sourceParagraphs: number
  sourceScenes: number
  localPages: number
  unsupportedTypes: string[]
  checks: FdxInteropCheck[]
  project: ScriptProject
}

const maxStoredFdxReportCharacters = 32 * 1024 * 1024
const maxFdxMarkupTokens = 100_000

const fdxToElement: Record<string, ScriptElementType> = {
  'Scene Heading': 'scene',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
  General: 'action',
}

const elementToFdx: Record<ScriptElementType, string> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  section: 'General',
  note: 'General',
}

export function parseFdx(content: string): ScriptProject {
  assertFdxXmlSafety(content)
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror').item(0)
  if (parserError) throw new Error(parserError.textContent ?? 'Invalid FDX file')

  const project = createDefaultProject()
  const scriptContent = findDirectChild(doc.documentElement, 'Content')
  if (!scriptContent) {
    throw new Error('FDX 文件缺少正文 Content 节点，可能已损坏或不是有效的 Final Draft 剧本。')
  }
  assertFdxParagraphLimit(scriptContent)
  const elements = directChildren(scriptContent)
    .flatMap(parseContentNode)
    .filter((element) => element.text.trim().length > 0)
  const titlePage = parseTitlePage(doc, project)

  return {
    ...project,
    title: titlePage.title || project.title,
    author: titlePage.authors || project.author,
    titlePage,
    elements: elements.length > 0 ? elements : [createElement('action', '')],
  }
}

function assertFdxParagraphLimit(scriptContent: Element) {
  let paragraphCount = 0
  for (const node of directChildren(scriptContent)) {
    if (node.tagName === 'DualDialogue') {
      paragraphCount += directChildren(node, 'Paragraph').length
    } else if (node.tagName === 'Paragraph') {
      const nestedDualDialogue = findDirectChild(node, 'DualDialogue')
      const nestedParagraphs = directChildren(node, 'Paragraph')
      paragraphCount += nestedDualDialogue
        ? directChildren(nestedDualDialogue, 'Paragraph').length
        : node.getAttribute('Type') === 'General' && nestedParagraphs.length > 0
          ? nestedParagraphs.length
          : 1
    }
    if (paragraphCount > projectDataLimits.maxScriptElements) {
      throw new Error(`FDX 正文超过 ${projectDataLimits.maxScriptElements} 个段落，请拆分项目后再导入。`)
    }
  }
}

export function buildFdx(project: ScriptProject) {
  const title = project.titlePage ?? createDefaultTitlePage(project)
  const titleBody = [
    renderTitleParagraph('Title', title.title || project.title),
    renderTitleParagraph('Credit', title.credit),
    renderTitleParagraph('Author', title.authors || project.author),
    renderTitleParagraph('Source', title.basedOn),
    renderTitleParagraph('Draft Date', title.draftDate),
    renderTitleParagraph('Contact', title.contact),
    renderTitleParagraph('Copyright', title.copyright),
  ].filter(Boolean).join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n  <TitlePage>\n    <Content>\n${titleBody}\n    </Content>\n  </TitlePage>\n  <Content>\n${buildFdxBody(project)}\n  </Content>\n</FinalDraft>\n`
}

export function analyzeFdxRoundTrip(content: string, sourceName = 'FDX 样本'): FdxInteropReport {
  assertFdxXmlSafety(content)
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror').item(0)
  if (parserError) throw new Error(parserError.textContent ?? 'FDX XML 无法解析')

  const project = parseFdx(content)
  const roundTripFdx = buildFdx(project)
  const roundTrip = parseFdx(roundTripFdx)
  const scriptContent = findDirectChild(doc.documentElement, 'Content')
  const paragraphs = scriptContent ? collectScriptParagraphs(scriptContent) : []
  const sourceTypes = [...new Set(paragraphs.map((paragraph) => boundedFdxIdentifier(paragraph.getAttribute('Type') ?? 'Action')))]
  const unsupportedTypes = sourceTypes.filter((type) => !(type in fdxToElement))
  const sourceNumbers = paragraphs.filter((paragraph) => paragraph.getAttribute('Type') === 'Scene Heading').map(readParagraphNumber).filter(Boolean)
  const roundTripNumbers = roundTrip.elements.filter((element) => element.type === 'scene').map((element) => element.sceneNumber ?? '').filter(Boolean)
  const sourceRevisionParagraphs = paragraphs.filter((paragraph) => directTextNodes(paragraph).some((node) => node.hasAttribute('RevisionID'))).length
  const mixedRevisionParagraphs = paragraphs.filter(hasMixedRevisionIds).length
  const sourceNotes = ['ScriptNote', 'ScriptNotes', 'Beat', 'Tag']
    .reduce((count, tagName) => count + doc.getElementsByTagName(tagName).length, 0)
  const mixedStyleParagraphs = paragraphs.filter(hasMixedTextStyles).length
  const uniformlyStyledParagraphs = paragraphs.filter(hasUniformTextStyle).length
  const localLayout = layoutScreenplay(project, getFormat(project.formatId), createFallbackTextMeasurer(project.fontSize))
  const checks: FdxInteropCheck[] = [
    compareElementSequence(project.elements, roundTrip.elements),
    compareTitlePage(project.titlePage, roundTrip.titlePage),
    {
      id: 'scene-numbers',
      label: '场景编号',
      status: arraysEqual(sourceNumbers, roundTripNumbers) ? 'pass' : sourceNumbers.length ? 'fail' : 'pass',
      detail: sourceNumbers.length ? `识别 ${sourceNumbers.length} 个场号，往返保留 ${roundTripNumbers.length} 个。` : '源文件没有场景编号。',
    },
    compareDualDialogue(project.elements, roundTrip.elements),
    compareMultilingualText(project.elements, roundTrip.elements),
    {
      id: 'revisions',
      label: '修订标记',
      status: mixedRevisionParagraphs > 0 || roundTrip.elements.filter((element) => element.revisionSetId).length !== sourceRevisionParagraphs ? 'warning' : 'pass',
      detail: sourceRevisionParagraphs
        ? `识别 ${sourceRevisionParagraphs} 个带修订编号的段落${mixedRevisionParagraphs ? `，其中 ${mixedRevisionParagraphs} 段混用多个修订编号` : '，段落级修订编号完整保留'}。`
        : '源文件没有文本修订编号。',
    },
    {
      id: 'paragraph-types',
      label: '段落类型',
      status: unsupportedTypes.length ? 'warning' : 'pass',
      detail: unsupportedTypes.length ? `未映射类型：${unsupportedTypes.join('、')}。导入时按动作段落保留文字。` : `支持全部 ${sourceTypes.length} 种段落类型。`,
    },
    {
      id: 'rich-text',
      label: '局部文字样式',
      status: mixedStyleParagraphs ? 'warning' : compareTextStyles(project.elements, roundTrip.elements) ? 'pass' : 'fail',
      detail: mixedStyleParagraphs
        ? `${mixedStyleParagraphs} 个段落包含真正混合的局部样式；文字会完整保留，共同的粗体、斜体和下划线会保留。`
        : uniformlyStyledParagraphs
          ? `${uniformlyStyledParagraphs} 个带样式段落的粗体、斜体和下划线往返一致。`
          : '没有需要合并的局部文字样式。',
    },
    {
      id: 'notes-tags',
      label: '批注与标签',
      status: sourceNotes ? 'warning' : 'pass',
      detail: sourceNotes ? `检测到 ${sourceNotes} 个 Final Draft 专有批注、节拍或标签节点，请在导入前确认是否需要另行归档。` : '没有未支持的专有批注或标签节点。',
    },
    {
      id: 'pagination',
      label: '本地专业分页',
      status: localLayout.warnings.length ? 'warning' : 'pass',
      detail: `按当前字体与好莱坞排版引擎得到 ${localLayout.pages.length} 页${localLayout.warnings.length ? `，有 ${localLayout.warnings.length} 项分页提示` : '，未发现分页溢出'}。`,
    },
  ]
  const failed = checks.filter((check) => check.status === 'fail').length
  const warnings = checks.filter((check) => check.status === 'warning').length
  const score = Math.max(0, Math.round(((checks.length - failed - warnings * 0.35) / checks.length) * 100))

  return {
    id: `fdx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceName,
    checkedAt: new Date().toISOString(),
    documentVersion: doc.documentElement.getAttribute('Version') ?? '未知',
    score,
    sourceParagraphs: paragraphs.length,
    sourceScenes: project.elements.filter((element) => element.type === 'scene').length,
    localPages: localLayout.pages.length,
    unsupportedTypes,
    checks,
    project,
  }
}

export function assertFdxXmlSafety(content: string) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(content)) {
    throw new Error('FDX 文件包含不受支持的 XML 文档类型或实体声明，已停止导入。')
  }

  let markupTokens = 0
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 60) continue
    markupTokens += 1
    if (markupTokens > maxFdxMarkupTokens) {
      throw new Error('FDX 文件包含过多 XML 节点，已停止导入以防止软件卡死。')
    }
  }
}

export function buildFdxLabReport(reports: FdxInteropReport[]) {
  const total = reports.length
  const average = total ? Math.round(reports.reduce((sum, report) => sum + report.score, 0) / total) : 0
  return `# FDX 专业互通实验室报告\n\n- 检查时间：${new Date().toLocaleString('zh-CN')}\n- 样本数量：${total}\n- 平均互通分：${average}\n- 运行方式：完全离线，本报告未上传任何剧本内容。\n\n${reports.map((report) => `## ${report.sourceName}\n\n- FDX 版本：${report.documentVersion}\n- 段落：${report.sourceParagraphs}\n- 场次：${report.sourceScenes}\n- 本地分页：${report.localPages}\n- 得分：${report.score}\n\n${report.checks.map((check) => `- [${check.status === 'pass' ? '通过' : check.status === 'fail' ? '失败' : '注意'}] ${check.label}：${check.detail}`).join('\n')}`).join('\n\n')}`
}

export function limitFdxInteropReports(
  reports: FdxInteropReport[],
  maxReports = 50,
  maxCharacters = maxStoredFdxReportCharacters,
) {
  const bounded: FdxInteropReport[] = []
  let storedCharacters = 0
  for (const report of reports) {
    if (bounded.length >= maxReports) break
    const reportCharacters = estimateFdxReportCharacters(report)
    if (storedCharacters + reportCharacters > maxCharacters) continue
    bounded.push(report)
    storedCharacters += reportCharacters
  }
  return bounded
}

function estimateFdxReportCharacters(report: FdxInteropReport) {
  return report.sourceName.length
    + report.unsupportedTypes.reduce((sum, value) => sum + value.length, 0)
    + report.checks.reduce((sum, check) => sum + check.label.length + check.detail.length, 0)
    + report.project.elements.reduce((sum, element) => sum + element.text.length + (element.sceneNumber?.length ?? 0), 0)
}

function parseParagraph(paragraph: Element) {
  const fdxType = paragraph.getAttribute('Type') ?? 'Action'
  const type = fdxToElement[fdxType] ?? 'action'
  const textNodes = directTextNodes(paragraph)
  const text = normalizeFdxText(textNodes.map((node) => node.textContent ?? '').join('')).trimEnd()
  if (text.length > projectDataLimits.maxElementTextCharacters) {
    throw new Error('FDX 包含过长的单个段落，请拆分该段落后再导入。')
  }
  const element = createElement(type, text)
  const sceneNumber = type === 'scene' ? boundedFdxIdentifier(readParagraphNumber(paragraph)) : ''
  const revisionSetId = textNodes
    .map((node) => boundedFdxIdentifier(node.getAttribute('RevisionID') ?? ''))
    .find(Boolean) ?? undefined
  const textStyle = commonTextStyle(textNodes)
  return { ...element, textStyle, sceneNumber: sceneNumber || undefined, revisionSetId }
}

function parseContentNode(node: Element) {
  if (node.tagName === 'DualDialogue') {
    return parseDualDialogue(node)
  }
  if (node.tagName !== 'Paragraph') {
    return []
  }

  const nestedDualDialogue = findDirectChild(node, 'DualDialogue')
  if (nestedDualDialogue) {
    return parseDualDialogue(nestedDualDialogue)
  }

  const nestedParagraphs = directChildren(node, 'Paragraph')
  if (node.getAttribute('Type') === 'General' && nestedParagraphs.length > 0) {
    return assignDualDialogueSides(nestedParagraphs.map(parseParagraph))
  }

  return [parseParagraph(node)]
}

function collectScriptParagraphs(scriptContent: Element) {
  return directChildren(scriptContent).flatMap((node) => {
    if (node.tagName === 'DualDialogue') {
      return directChildren(node, 'Paragraph')
    }
    if (node.tagName !== 'Paragraph') {
      return []
    }
    const nestedDualDialogue = findDirectChild(node, 'DualDialogue')
    if (nestedDualDialogue) {
      return directChildren(nestedDualDialogue, 'Paragraph')
    }
    const nestedParagraphs = directChildren(node, 'Paragraph')
    return node.getAttribute('Type') === 'General' && nestedParagraphs.length > 0 ? nestedParagraphs : [node]
  })
}

function parseDualDialogue(node: Element) {
  return assignDualDialogueSides(directChildren(node, 'Paragraph').map(parseParagraph))
}

function assignDualDialogueSides(paragraphs: ScriptElement[]) {
  const secondCue = paragraphs.findIndex((element, index) => index > 0 && element.type === 'character')
  if (secondCue <= 0) {
    return paragraphs
  }
  const groupId = globalThis.crypto?.randomUUID?.() ?? `dual-${Date.now()}`
  return paragraphs.map((element, index) => ({
    ...element,
    dualDialogue: { groupId, side: index < secondCue ? 'left' as const : 'right' as const },
  }))
}

function parseTitlePage(doc: Document, project: ScriptProject): TitlePageData {
  const defaults = createDefaultTitlePage(project)
  const values = new Map<string, string>()
  const titlePage = findDirectChild(doc.documentElement, 'TitlePage')
  const titleContent = titlePage ? findDirectChild(titlePage, 'Content') : undefined
  directChildren(titleContent, 'Paragraph').forEach((paragraph) => {
    const type = boundedFdxIdentifier(paragraph.getAttribute('Type') ?? '')
    const text = normalizeFdxText(directTextNodes(paragraph).map((node) => node.textContent ?? '').join('')).trim()
    if (text) values.set(type, text.slice(0, getFdxTitleFieldLimit(type)))
  })
  return {
    enabled: true,
    title: values.get('Title') ?? defaults.title,
    credit: values.get('Credit') ?? defaults.credit,
    authors: values.get('Author') ?? values.get('Authors') ?? defaults.authors,
    basedOn: values.get('Source') ?? defaults.basedOn,
    draftDate: values.get('Draft Date') ?? defaults.draftDate,
    contact: values.get('Contact') ?? defaults.contact,
    copyright: values.get('Copyright') ?? defaults.copyright,
  }
}

function buildFdxBody(project: ScriptProject) {
  const elements = project.elements
  const output: string[] = []
  const consumed = new Set<string>()
  const dualGroups = new Map<string, ScriptElement[]>()
  const validGroupIds = getValidDualDialogueGroupIds(elements)
  elements.forEach((element) => {
    const groupId = element.dualDialogue?.groupId
    if (!groupId || !validGroupIds.has(groupId)) return
    const group = dualGroups.get(groupId) ?? []
    group.push(element)
    dualGroups.set(groupId, group)
  })
  elements.forEach((element) => {
    const dual = element.dualDialogue
    if (!dual || !validGroupIds.has(dual.groupId)) {
      output.push(renderParagraph(element, 4, project.productionLock?.sceneNumbers?.[element.id]))
      return
    }
    if (consumed.has(dual.groupId)) return
    consumed.add(dual.groupId)
    const grouped = dualGroups.get(dual.groupId) ?? []
    output.push(`    <Paragraph Type="General">\n      <DualDialogue>\n${grouped.map((candidate) => renderParagraph(candidate, 8, project.productionLock?.sceneNumbers?.[candidate.id])).join('\n')}\n      </DualDialogue>\n    </Paragraph>`)
  })
  return output.join('\n')
}

function renderParagraph(element: ScriptElement, spaces: number, lockedSceneNumber?: string) {
  const indent = ' '.repeat(spaces)
  const sceneNumber = element.type === 'scene' ? element.sceneNumber ?? lockedSceneNumber : undefined
  const numberAttribute = sceneNumber ? ` Number="${escapeXml(sceneNumber)}"` : ''
  const revisionAttribute = element.revisionSetId ? ` RevisionID="${escapeXml(element.revisionSetId)}"` : ''
  const styleAttribute = renderTextStyleAttribute(element)
  return `${indent}<Paragraph Type="${elementToFdx[element.type]}"${numberAttribute}>\n${indent}  <Text${revisionAttribute}${styleAttribute}>${escapeXml(toFdxText(element.text))}</Text>\n${indent}</Paragraph>`
}

function renderTitleParagraph(type: string, value: string) {
  if (!value.trim()) return ''
  return `      <Paragraph Type="${type}">\n        <Text>${escapeXml(value)}</Text>\n      </Paragraph>`
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function readParagraphNumber(paragraph: Element) {
  return paragraph.getAttribute('Number') ?? paragraph.getAttribute('SceneNumber') ?? ''
}

function readTextStyleTokens(node: Element) {
  return new Set((node.getAttribute('Style') ?? '').split(/[+,\s]+/u).map((token) => token.trim().toLowerCase()).filter(Boolean))
}

function commonTextStyle(textNodes: Element[]): ScriptElement['textStyle'] {
  const meaningfulNodes = textNodes.filter((node) => (node.textContent ?? '').length > 0)
  if (!meaningfulNodes.length) return undefined
  const styles = meaningfulNodes.map(readTextStyleTokens)
  const textStyle = {
    bold: styles.every((style) => style.has('bold')),
    italic: styles.every((style) => style.has('italic')),
    underline: styles.every((style) => style.has('underline')),
  }
  return textStyle.bold || textStyle.italic || textStyle.underline ? textStyle : undefined
}

function renderTextStyleAttribute(element: ScriptElement) {
  const styles = [
    element.textStyle?.bold ? 'Bold' : '',
    element.textStyle?.italic ? 'Italic' : '',
    element.textStyle?.underline ? 'Underline' : '',
  ].filter(Boolean)
  return styles.length ? ` Style="${styles.join('+')}"` : ''
}

function hasMixedTextStyles(paragraph: Element) {
  const signatures = directTextNodes(paragraph)
    .filter((node) => (node.textContent ?? '').length > 0)
    .map((node) => [...readTextStyleTokens(node)].sort().join('+'))
  return new Set(signatures).size > 1
}

function hasUniformTextStyle(paragraph: Element) {
  const signatures = directTextNodes(paragraph)
    .filter((node) => (node.textContent ?? '').length > 0)
    .map((node) => [...readTextStyleTokens(node)].sort().join('+'))
  return signatures.length > 0 && new Set(signatures).size === 1 && signatures[0].length > 0
}

function hasMixedRevisionIds(paragraph: Element) {
  const revisionIds = directTextNodes(paragraph)
    .filter((node) => (node.textContent ?? '').length > 0)
    .map((node) => node.getAttribute('RevisionID') ?? '')
  return new Set(revisionIds).size > 1
}

function compareElementSequence(source: ScriptElement[], roundTrip: ScriptElement[]): FdxInteropCheck {
  const matches = source.length === roundTrip.length && source.every((element, index) => element.type === roundTrip[index]?.type && normalizeText(element.text) === normalizeText(roundTrip[index]?.text))
  return {
    id: 'elements',
    label: '正文与段落顺序',
    status: matches ? 'pass' : 'fail',
    detail: matches ? `${source.length} 个段落往返一致。` : `源文件 ${source.length} 段，往返后 ${roundTrip.length} 段，存在类型、顺序或文字差异。`,
  }
}

function compareTitlePage(source?: TitlePageData, roundTrip?: TitlePageData): FdxInteropCheck {
  const keys: Array<keyof TitlePageData> = ['title', 'credit', 'authors', 'basedOn', 'draftDate', 'contact', 'copyright']
  const mismatches = keys.filter((key) => normalizeText(String(source?.[key] ?? '')) !== normalizeText(String(roundTrip?.[key] ?? '')))
  return {
    id: 'title-page',
    label: '标题页',
    status: mismatches.length ? 'fail' : 'pass',
    detail: mismatches.length ? `以下字段往返不一致：${mismatches.join('、')}。` : '标题、署名、作者、来源、日期、联系与版权字段均保留。',
  }
}

function compareDualDialogue(source: ScriptElement[], roundTrip: ScriptElement[]): FdxInteropCheck {
  const sourceGroups = new Set(source.map((element) => element.dualDialogue?.groupId).filter(Boolean)).size
  const roundTripGroups = new Set(roundTrip.map((element) => element.dualDialogue?.groupId).filter(Boolean)).size
  return {
    id: 'dual-dialogue',
    label: '双栏对白',
    status: sourceGroups === roundTripGroups ? 'pass' : 'fail',
    detail: `源文件 ${sourceGroups} 组，往返后 ${roundTripGroups} 组。`,
  }
}

function compareTextStyles(source: ScriptElement[], roundTrip: ScriptElement[]) {
  return source.length === roundTrip.length && source.every((element, index) => {
    const candidate = roundTrip[index]
    return Boolean(element.textStyle?.bold) === Boolean(candidate?.textStyle?.bold)
      && Boolean(element.textStyle?.italic) === Boolean(candidate?.textStyle?.italic)
      && Boolean(element.textStyle?.underline) === Boolean(candidate?.textStyle?.underline)
  })
}

function compareMultilingualText(source: ScriptElement[], roundTrip: ScriptElement[]): FdxInteropCheck {
  const sourceText = source.map((element) => element.text).join('\n')
  const roundTripText = roundTrip.map((element) => element.text).join('\n')
  const scripts = [
    ['简繁中文', /[\u3400-\u9fff]/u],
    ['拉丁字母', /[A-Za-z]/u],
    ['日文假名', /[\u3040-\u30ff]/u],
    ['韩文', /[\uac00-\ud7af]/u],
  ].filter(([, pattern]) => (pattern as RegExp).test(sourceText)).map(([label]) => label)
  return {
    id: 'multilingual',
    label: '多语言字符',
    status: sourceText === roundTripText ? 'pass' : 'fail',
    detail: `${scripts.length ? scripts.join('、') : '常规字符'}${sourceText === roundTripText ? '完整保留' : '存在字符差异'}。`,
  }
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').trimEnd()
}

function directChildren(parent: Element | undefined, tagName?: string) {
  if (!parent) return []
  return Array.from(parent.childNodes)
    .filter((node): node is Element => node.nodeType === 1)
    .filter((node) => !tagName || node.tagName === tagName)
}

function findDirectChild(parent: Element | undefined, tagName: string) {
  return directChildren(parent, tagName)[0]
}

function directTextNodes(paragraph: Element) {
  return directChildren(paragraph, 'Text')
}

function normalizeFdxText(value: string) {
  return value.replace(/\r\n?/gu, '\n').replace(/[\u2028\u2029]/gu, '\n')
}

function boundedFdxIdentifier(value: string) {
  return stripControlCharacters(value).trim().slice(0, projectDataLimits.maxIdentifierCharacters)
}

function getFdxTitleFieldLimit(type: string) {
  if (type === 'Contact' || type === 'Copyright') return 10_000
  if (type === 'Source') return 2000
  if (type === 'Draft Date') return 200
  return 1000
}

function toFdxText(value: string) {
  return value.replace(/\r\n?/gu, '\n').replace(/\n/gu, '\u2028')
}
