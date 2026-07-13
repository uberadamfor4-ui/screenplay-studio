import type { ScriptElement, ScriptElementType, ScriptProject, TitlePageData } from './types'
import { createElement } from './formats'
import { createDefaultProject } from './sample'
import { createDefaultTitlePage } from './exportProfiles'

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

  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n  <TitlePage>\n    <Content>\n${titleBody}\n    </Content>\n  </TitlePage>\n  <Content>\n${buildFdxBody(project.elements)}\n  </Content>\n</FinalDraft>\n`
}

function parseParagraph(paragraph: Element) {
  const fdxType = paragraph.getAttribute('Type') ?? 'Action'
  const type = fdxToElement[fdxType] ?? 'action'
  const text = Array.from(paragraph.querySelectorAll('Text')).map((node) => node.textContent ?? '').join('').trimEnd()
  return createElement(type, text)
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

function buildFdxBody(elements: ScriptElement[]) {
  const output: string[] = []
  const consumed = new Set<string>()
  elements.forEach((element) => {
    const dual = element.dualDialogue
    if (!dual) {
      output.push(renderParagraph(element, 4))
      return
    }
    if (consumed.has(dual.groupId)) return
    consumed.add(dual.groupId)
    const grouped = elements.filter((candidate) => candidate.dualDialogue?.groupId === dual.groupId)
    output.push(`    <DualDialogue>\n${grouped.map((candidate) => renderParagraph(candidate, 6)).join('\n')}\n    </DualDialogue>`)
  })
  return output.join('\n')
}

function renderParagraph(element: ScriptElement, spaces: number) {
  const indent = ' '.repeat(spaces)
  return `${indent}<Paragraph Type="${elementToFdx[element.type]}">\n${indent}  <Text>${escapeXml(element.text)}</Text>\n${indent}</Paragraph>`
}

function renderTitleParagraph(type: string, value: string) {
  if (!value.trim()) return ''
  return `      <Paragraph Type="${type}">\n        <Text>${escapeXml(value)}</Text>\n      </Paragraph>`
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
