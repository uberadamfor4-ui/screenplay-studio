import { getScreenplayFontStack, type ScriptFormat } from './formats'
import { createDefaultTitlePage, resolveExportProject } from './exportProfiles'
import { createCanvasTextMeasurer, layoutScreenplay, type LayoutPage, type PositionedBlock } from './layoutEngine'
import type { PngPagePayload, ScriptProject, TitlePageData } from './types'

export async function renderPngPages(project: ScriptProject, _format: ScriptFormat): Promise<PngPagePayload[]> {
  const resolved = resolveExportProject(project)
  await document.fonts.ready
  await Promise.allSettled([
    document.fonts.load(`${resolved.project.fontSize}pt "Courier Prime"`),
    document.fonts.load(`${resolved.project.fontSize}pt "Screenplay CJK"`),
  ])
  const layout = layoutScreenplay(resolved.project, resolved.format, createCanvasTextMeasurer(resolved.project, resolved.format))
  const pages: PngPagePayload[] = []
  const title = resolved.project.titlePage ?? createDefaultTitlePage(resolved.project)
  if (layout.settings.includeTitlePage && title.enabled) {
    pages.push(renderTitlePage(resolved.project, resolved.format, title))
  }
  layout.pages.forEach((page) => pages.push(renderPage(resolved.project, resolved.format, page, layout.lineHeight, layout.settings.sceneNumbers)))
  return pages
}

function createPageCanvas(format: ScriptFormat) {
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = format.page.width * scale
  canvas.height = format.page.height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, format.page.width, format.page.height)
  context.textBaseline = 'top'
  return { canvas, context }
}

function renderPage(project: ScriptProject, format: ScriptFormat, page: LayoutPage, lineHeight: number, includeSceneNumbers: boolean) {
  const { canvas, context } = createPageCanvas(format)
  const sceneNumbers = buildSceneNumberMap(project)
  page.blocks.forEach((block) => drawBlock(context, project, format, block, lineHeight, includeSceneNumbers, sceneNumbers))

  if (page.index > 1) {
    context.fillStyle = '#111111'
    context.font = `9pt ${getScreenplayFontStack(project.fontFamily, format, project.language)}`
    context.textAlign = 'right'
    context.fillText(`${page.label}.`, format.page.width - format.page.marginRight, 48)
  }

  return { name: `${safeName(project.title)}_${String(page.index).padStart(2, '0')}.png`, dataUrl: canvas.toDataURL('image/png') }
}

function drawBlock(
  context: CanvasRenderingContext2D,
  project: ScriptProject,
  format: ScriptFormat,
  block: PositionedBlock,
  lineHeight: number,
  includeSceneNumbers: boolean,
  sceneNumbers: Map<string, string>,
) {
  context.font = `${block.italic ? 'italic ' : ''}${block.bold ? '700 ' : '400 '}${project.fontSize}pt ${getScreenplayFontStack(project.fontFamily, format, project.language)}`
  context.textAlign = block.align
  context.fillStyle = block.sourceType === 'note' ? '#4b5563' : '#111111'
  const x = block.align === 'center' ? block.x + block.width / 2 : block.align === 'right' ? block.x + block.width : block.x
  block.lines.forEach((line, index) => context.fillText(line, x, block.y + index * lineHeight))

  const number = block.sourceId ? block.sceneNumber ?? sceneNumbers.get(block.sourceId) : undefined
  if (includeSceneNumbers && block.sourceType === 'scene' && number) {
    context.textAlign = 'right'
    context.fillText(number, block.x - 10, block.y)
    context.textAlign = 'left'
    context.fillText(number, block.x + block.width + 10, block.y)
  }
}

function renderTitlePage(project: ScriptProject, format: ScriptFormat, title: TitlePageData) {
  const { canvas, context } = createPageCanvas(format)
  const fontStack = getScreenplayFontStack(project.fontFamily, format, project.language)
  context.fillStyle = '#111111'
  context.textAlign = 'center'
  context.font = `${project.fontSize}pt ${fontStack}`
  const centerX = format.page.width / 2
  let y = format.page.height * 0.34
  context.fillText(title.title.toLocaleUpperCase(project.language), centerX, y)
  y += 40
  ;[title.credit, title.authors, title.basedOn].filter(Boolean).forEach((line) => {
    context.fillText(line, centerX, y)
    y += 24
  })
  context.textAlign = 'left'
  drawMultiline(context, title.contact, format.page.marginLeft, format.page.height - format.page.marginBottom - 48, 18)
  context.textAlign = 'right'
  drawMultiline(context, [title.draftDate, title.copyright].filter(Boolean).join('\n'), format.page.width - format.page.marginRight, format.page.height - format.page.marginBottom - 48, 18)
  return { name: `${safeName(project.title)}_title.png`, dataUrl: canvas.toDataURL('image/png') }
}

function drawMultiline(context: CanvasRenderingContext2D, value: string, x: number, y: number, lineHeight: number) {
  value.split(/\r?\n/).forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
}

function buildSceneNumberMap(project: ScriptProject) {
  const output = new Map<string, string>()
  let number = 0
  project.elements.forEach((element) => {
    if (element.type === 'scene') {
      number += 1
      output.set(element.id, project.productionLock?.sceneNumbers?.[element.id] ?? String(number))
    }
  })
  return output
}

function safeName(value: string) {
  return Array.from(value || 'screenplay').map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char)).join('').slice(0, 64)
}
