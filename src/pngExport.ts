import type { PngPagePayload, ScriptElement, ScriptProject } from './types'
import type { ElementLayout, ScriptFormat } from './formats'
import { getScreenplayFontStack, getScreenplayLineHeight, paginateElements, resolveElementLayout, wrapElementText } from './formats'

export async function renderPngPages(project: ScriptProject, format: ScriptFormat): Promise<PngPagePayload[]> {
  await document.fonts.ready
  await document.fonts.load(`${project.fontSize}pt "${project.fontFamily}"`)

  const pages = paginateElements(project.elements, format, project.fontSize)
  return pages.map((page, index) => renderPage(project, format, page, index + 1))
}

function renderPage(project: ScriptProject, format: ScriptFormat, page: ScriptElement[], pageNumber: number): PngPagePayload {
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = format.page.width * scale
  canvas.height = format.page.height * scale
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas is unavailable')
  }

  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, format.page.width, format.page.height)
  context.fillStyle = '#111827'
  context.textBaseline = 'top'

  let y = format.page.marginTop
  page.forEach((element, index) => {
    const layout = resolveElementLayout(element, format)
    y += index === 0 ? 0 : layout.before
    y = drawElement(context, project, format, element, layout, y)
    y += layout.after
  })

  if (pageNumber > 1) {
    context.fillStyle = '#111827'
    context.font = `9pt ${getScreenplayFontStack(project.fontFamily, format)}`
    context.textAlign = 'right'
    context.fillText(`${pageNumber}.`, format.page.width - format.page.marginRight, 48)
  }

  return {
    name: `${safeName(project.title)}_${String(pageNumber).padStart(2, '0')}.png`,
    dataUrl: canvas.toDataURL('image/png'),
  }
}

function drawElement(
  context: CanvasRenderingContext2D,
  project: ScriptProject,
  format: ScriptFormat,
  element: ScriptElement,
  layout: ElementLayout,
  startY: number,
) {
  const size = project.fontSize
  const weight = layout.bold ? '700 ' : ''
  const style = layout.italic ? 'italic ' : ''
  const text = layout.uppercase ? element.text.toUpperCase() : element.text
  const lineHeight = getScreenplayLineHeight(size)
  const lines = wrapElementText({ text: text || ' ' }, layout, size)
  const x = format.page.marginLeft + layout.marginLeft

  context.font = `${style}${weight}${size}pt ${getScreenplayFontStack(project.fontFamily, format)}`
  context.textAlign = layout.align
  context.fillStyle = element.type === 'note' ? '#4b5563' : '#111827'

  const drawX = layout.align === 'center' ? x + layout.width / 2 : layout.align === 'right' ? x + layout.width : x
  lines.forEach((line, lineIndex) => {
    context.fillText(line, drawX, startY + lineIndex * lineHeight)
  })

  return startY + lines.length * lineHeight
}
function safeName(value: string) {
  return Array.from(value || 'screenplay')
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char))
    .join('')
    .slice(0, 64)
}
