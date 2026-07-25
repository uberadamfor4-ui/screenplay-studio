import { getScreenplayFontStack, type ScriptFormat } from './formats'
import { safeFileName } from './fileNames'
import { createDefaultTitlePage, resolveExportProject } from './exportProfiles'
import { createCanvasTextMeasurer, layoutScreenplay, type LayoutPage, type PositionedBlock } from './layoutEngine'
import type { PngPagePayload, ScriptProject, TitlePageData } from './types'

export async function renderPngPages(
  project: ScriptProject,
  _format: ScriptFormat,
  onPage?: (page: PngPagePayload) => void | Promise<void>,
): Promise<PngPagePayload[]> {
  const resolved = resolveExportProject(project)
  await document.fonts.ready
  await Promise.allSettled([
    document.fonts.load(`${resolved.project.fontSize}pt "Courier Prime"`),
    document.fonts.load(`${resolved.project.fontSize}pt "Screenplay CJK"`),
    document.fonts.load(`700 ${resolved.project.fontSize}pt "Screenplay CJK"`),
  ])
  const layout = layoutScreenplay(resolved.project, resolved.format, createCanvasTextMeasurer(resolved.project, resolved.format))
  const pages: PngPagePayload[] = []
  const emitPage = async (page: PngPagePayload) => {
    if (onPage) {
      await onPage(page)
    } else {
      pages.push(page)
    }
  }
  const title = resolved.project.titlePage ?? createDefaultTitlePage(resolved.project)
  if (layout.settings.includeTitlePage && title.enabled) {
    await emitPage(renderTitlePage(resolved.project, resolved.format, title))
  }
  for (const page of layout.pages) {
    await emitPage(renderPage(resolved.project, resolved.format, page, layout.lineHeight, layout.settings.sceneNumbers))
  }
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

  return { name: `${safeFileName(project.title)}_${String(page.index).padStart(2, '0')}.png`, dataUrl: canvas.toDataURL('image/png') }
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
  context.font = `${block.italic ? 'italic ' : ''}${block.bold ? '700 ' : '400 '}${project.fontSize}pt ${getScreenplayFontStack(block.fontFamily || project.fontFamily, format, project.language, Boolean(block.fontFamily))}`
  context.textAlign = block.align
  context.fillStyle = block.sourceType === 'note' ? '#4b5563' : '#111111'
  const x = block.align === 'center' ? block.x + block.width / 2 : block.align === 'right' ? block.x + block.width : block.x
  block.lines.forEach((line, index) => {
    const y = block.y + index * lineHeight
    context.fillText(line, x, y)
    if (block.underline && line.trim()) {
      drawUnderline(context, line, x, y + lineHeight - 2, block.align)
    }
  })

  const number = block.sourceId ? block.sceneNumber ?? sceneNumbers.get(block.sourceId) : undefined
  if (includeSceneNumbers && block.sourceType === 'scene' && number) {
    context.textAlign = 'right'
    context.fillText(number, block.x - 10, block.y)
    context.textAlign = 'left'
    context.fillText(number, block.x + block.width + 10, block.y)
  }
}

function drawUnderline(
  context: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  y: number,
  align: CanvasTextAlign,
) {
  const width = context.measureText(text).width
  const startX = align === 'center' ? anchorX - width / 2 : align === 'right' || align === 'end' ? anchorX - width : anchorX
  context.save()
  context.beginPath()
  context.lineWidth = 1
  context.strokeStyle = context.fillStyle
  context.moveTo(startX, y)
  context.lineTo(startX + width, y)
  context.stroke()
  context.restore()
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
  return { name: `${safeFileName(project.title)}_title.png`, dataUrl: canvas.toDataURL('image/png') }
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
