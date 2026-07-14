import type { ScriptElement, ScriptElementType, ScriptProject, TitlePageData } from './types'
import { createElement, getFormat } from './formats'
import { createDefaultProject } from './sample'
import { createDefaultTitlePage } from './exportProfiles'
import { createFallbackTextMeasurer, layoutScreenplay } from './layoutEngine'

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
  roundTripFdx: string
}

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
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) throw new Error(parserError.textContent ?? 'Invalid FDX file')

  const project = createDefaultProject()
  const scriptContent = doc.querySelector('FinalDraft > Content')
  const elements = Array.from(scriptContent?.children ?? []).flatMap((node) => {
    if (node.tagName === 'Paragraph') return [parseParagraph(node)]
    if (node.tagName !== 'DualDialogue') return []
    return parseDualDialogue(node)
  }).filter((element) => element.text.trim().length > 0)
  const titlePage = parseTitlePage(doc, project)

  return {
    ...project,
    title: titlePage.title || project.title,
    author: titlePage.authors || project.author,
    titlePage,
    elements: elements.length > 0 ? elements : project.elements,
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
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) throw new Error(parserError.textContent ?? 'FDX XML 无法解析')

  const project = parseFdx(content)
  const roundTripFdx = buildFdx(project)
  const roundTrip = parseFdx(roundTripFdx)
  const paragraphs = Array.from(doc.querySelectorAll('FinalDraft > Content Paragraph, FinalDraft > Content DualDialogue > Paragraph'))
  const sourceTypes = [...new Set(paragraphs.map((paragraph) => paragraph.getAttribute('Type') ?? 'Action'))]
  const unsupportedTypes = sourceTypes.filter((type) => !(type in fdxToElement))
  const sourceNumbers = paragraphs.filter((paragraph) => paragraph.getAttribute('Type') === 'Scene Heading').map(readParagraphNumber).filter(Boolean)
  const roundTripNumbers = roundTrip.elements.filter((element) => element.type === 'scene').map((element) => element.sceneNumber ?? '').filter(Boolean)
  const sourceRevisionIds = Array.from(doc.querySelectorAll('FinalDraft > Content Text[RevisionID]')).map((node) => node.getAttribute('RevisionID') ?? '').filter(Boolean)
  const sourceNotes = doc.querySelectorAll('ScriptNote, ScriptNotes, Beat, Tag').length
  const sourceRichRuns = paragraphs.filter((paragraph) => paragraph.querySelectorAll('Text').length > 1).length
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
      status: sourceRevisionIds.length === 0 || roundTrip.elements.filter((element) => element.revisionSetId).length === sourceRevisionIds.length ? 'pass' : 'warning',
      detail: sourceRevisionIds.length ? `识别 ${sourceRevisionIds.length} 个带修订编号的文本段。` : '源文件没有文本修订编号。',
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
      status: sourceRichRuns ? 'warning' : 'pass',
      detail: sourceRichRuns ? `${sourceRichRuns} 个段落包含多个文字样式片段；文字会完整保留，局部粗体/斜体可能被合并。` : '没有需要合并的局部文字样式。',
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
    roundTripFdx,
  }
}

export function buildFdxLabReport(reports: FdxInteropReport[]) {
  const total = reports.length
  const average = total ? Math.round(reports.reduce((sum, report) => sum + report.score, 0) / total) : 0
  return `# FDX 专业互通实验室报告\n\n- 检查时间：${new Date().toLocaleString('zh-CN')}\n- 样本数量：${total}\n- 平均互通分：${average}\n- 运行方式：完全离线，本报告未上传任何剧本内容。\n\n${reports.map((report) => `## ${report.sourceName}\n\n- FDX 版本：${report.documentVersion}\n- 段落：${report.sourceParagraphs}\n- 场次：${report.sourceScenes}\n- 本地分页：${report.localPages}\n- 得分：${report.score}\n\n${report.checks.map((check) => `- [${check.status === 'pass' ? '通过' : check.status === 'fail' ? '失败' : '注意'}] ${check.label}：${check.detail}`).join('\n')}`).join('\n\n')}`
}

function parseParagraph(paragraph: Element) {
  const fdxType = paragraph.getAttribute('Type') ?? 'Action'
  const type = fdxToElement[fdxType] ?? 'action'
  const textNodes = Array.from(paragraph.querySelectorAll('Text'))
  const text = textNodes.map((node) => node.textContent ?? '').join('').trimEnd()
  const element = createElement(type, text)
  const sceneNumber = type === 'scene' ? readParagraphNumber(paragraph) : ''
  const revisionSetId = textNodes.map((node) => node.getAttribute('RevisionID')).find(Boolean) ?? undefined
  return { ...element, sceneNumber: sceneNumber || undefined, revisionSetId }
}

function parseDualDialogue(node: Element) {
  const paragraphs = Array.from(node.querySelectorAll(':scope > Paragraph')).map(parseParagraph)
  const secondCue = paragraphs.findIndex((element, index) => index > 0 && element.type === 'character')
  const splitAt = secondCue > 0 ? secondCue : Math.ceil(paragraphs.length / 2)
  const groupId = globalThis.crypto?.randomUUID?.() ?? `dual-${Date.now()}`
  return paragraphs.map((element, index) => ({
    ...element,
    dualDialogue: { groupId, side: index < splitAt ? 'left' as const : 'right' as const },
  }))
}

function parseTitlePage(doc: Document, project: ScriptProject): TitlePageData {
  const defaults = createDefaultTitlePage(project)
  const values = new Map<string, string>()
  doc.querySelectorAll('TitlePage Paragraph').forEach((paragraph) => {
    const type = paragraph.getAttribute('Type') ?? ''
    const text = Array.from(paragraph.querySelectorAll('Text')).map((node) => node.textContent ?? '').join('').trim()
    if (text) values.set(type, text)
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
  elements.forEach((element) => {
    const dual = element.dualDialogue
    if (!dual) {
      output.push(renderParagraph(element, 4, project.productionLock?.sceneNumbers?.[element.id]))
      return
    }
    if (consumed.has(dual.groupId)) return
    consumed.add(dual.groupId)
    const grouped = elements.filter((candidate) => candidate.dualDialogue?.groupId === dual.groupId)
    output.push(`    <DualDialogue>\n${grouped.map((candidate) => renderParagraph(candidate, 6, project.productionLock?.sceneNumbers?.[candidate.id])).join('\n')}\n    </DualDialogue>`)
  })
  return output.join('\n')
}

function renderParagraph(element: ScriptElement, spaces: number, lockedSceneNumber?: string) {
  const indent = ' '.repeat(spaces)
  const sceneNumber = element.type === 'scene' ? element.sceneNumber ?? lockedSceneNumber : undefined
  const numberAttribute = sceneNumber ? ` Number="${escapeXml(sceneNumber)}"` : ''
  const revisionAttribute = element.revisionSetId ? ` RevisionID="${escapeXml(element.revisionSetId)}"` : ''
  return `${indent}<Paragraph Type="${elementToFdx[element.type]}"${numberAttribute}>\n${indent}  <Text${revisionAttribute}>${escapeXml(element.text)}</Text>\n${indent}</Paragraph>`
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
