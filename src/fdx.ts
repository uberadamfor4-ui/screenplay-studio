import type { ScriptElementType, ScriptProject } from './types'
import { createElement } from './formats'
import { createDefaultProject } from './sample'

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
  if (parserError) {
    throw new Error(parserError.textContent ?? 'Invalid FDX file')
  }

  const project = createDefaultProject()
  const scriptContent = doc.querySelector('FinalDraft > Content')
  const paragraphs = Array.from(scriptContent?.querySelectorAll(':scope > Paragraph') ?? [])
  const titleNode = doc.querySelector('TitlePage Paragraph Text')
  const elements = paragraphs
    .map((paragraph) => {
      const fdxType = paragraph.getAttribute('Type') ?? 'Action'
      const type = fdxToElement[fdxType] ?? 'action'
      const text = Array.from(paragraph.querySelectorAll('Text'))
        .map((textNode) => textNode.textContent ?? '')
        .join('')
        .trimEnd()

      return createElement(type, text)
    })
    .filter((element) => element.text.trim().length > 0)

  return {
    ...project,
    title: titleNode?.textContent?.trim() || project.title,
    elements: elements.length > 0 ? elements : project.elements,
  }
}

export function buildFdx(project: ScriptProject) {
  const body = project.elements
    .map((element) => {
      const paragraphType = elementToFdx[element.type]
      const text = escapeXml(element.text)
      return `    <Paragraph Type="${paragraphType}">\n      <Text>${text}</Text>\n    </Paragraph>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n  <TitlePage>\n    <Content>\n      <Paragraph Type="Title">\n        <Text>${escapeXml(project.title)}</Text>\n      </Paragraph>\n      <Paragraph Type="Credit">\n        <Text>${escapeXml(project.author)}</Text>\n      </Paragraph>\n    </Content>\n  </TitlePage>\n  <Content>\n${body}\n  </Content>\n</FinalDraft>\n`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
