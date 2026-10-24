import { getScreenplayFontStack, getScreenplayLineHeight, type ScriptFormat } from './formats'
import { safeFileName } from './fileNames'
import { createDefaultTitlePage, resolveExportProject } from './exportProfiles'
import { waitForExportFonts } from './exportFonts'
import { createCanvasTextMeasurer, layoutScreenplay, wrapMeasuredText, type LayoutPage, type PositionedBlock } from './layoutEngine'
import type { PngPagePayload, ScriptProject, TitlePageData } from './types'
import { projectFontFamilies } from './fontFamilies'
import { CoverOverflowError } from './exportErrors'

export async function renderPngPages(
  project: ScriptProject,
  _format: ScriptFormat,
  onPage?: (page: PngPagePayload) => void | Promise<void>,
): Promise<PngPagePayload[]> {
  const resolved = resolveExportProject(project)
  await waitForExportFonts(resolved.project.fontSize, undefined, projectFontFamilies(resolved.project))
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
    await emitPage(renderPage(
      resolved.project,
      resolved.format,
      page,
      layout.lineHeight,
      layout.settings.sceneNumbers,
      layout.settings.headerText,
      layout.settings.footerText,
    ))
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
  context.fontKerning = 'none'
  context.fontVariantCaps = 'normal'
  return { canvas, context }
}

function renderPage(
  project: ScriptProject,
  format: ScriptFormat,
  page: LayoutPage,
  lineHeight: number,
  includeSceneNumbers: boolean,
  headerText: string,
  footerText: string,
) {
  const { canvas, context } = createPageCanvas(format)
  const sceneNumbers = buildSceneNumberMap(project)
  page.blocks.forEach((block) => drawBlock(context, project, format, block, lineHeight, includeSceneNumbers, sceneNumbers))

  context.fillStyle = '#111111'
  context.font = `9pt ${getScreenplayFontStack(project.fontFamily, format, project.language, shouldHonorProjectFont(project))}`
  context.textBaseline = 'top'
  if (headerText.trim()) {
    context.textAlign = 'left'
    context.fillText(headerText.trim(), format.page.marginLeft, 48, format.page.width - format.page.marginLeft - format.page.marginRight - 48)
  }
  if (page.index > 1) {
    context.textAlign = 'right'
    context.fillText(`${page.label}.`, format.page.width - format.page.marginRight, 48)
  }
  if (footerText.trim()) {
    context.textAlign = 'center'
    context.fillText(footerText.trim(), format.page.width / 2, format.page.height - 60, format.page.width - format.page.marginLeft - format.page.marginRight)
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
  const fontStack = getScreenplayFontStack(
    block.fontFamily || project.fontFamily,
    format,
    project.language,
    Boolean(block.fontFamily) || shouldHonorProjectFont(project),
  )
  context.font = `${block.italic ? 'italic ' : ''}${block.bold ? '700 ' : '400 '}${project.fontSize}pt ${fontStack}`
  context.textAlign = block.align
  context.fillStyle = block.sourceType === 'note' ? '#4b5563' : '#111111'
  const x = block.align === 'center' ? block.x + block.width / 2 : block.align === 'right' ? block.x + block.width : block.x
  block.lines.forEach((line, index) => {
    const y = block.y + index * lineHeight
    const runs = block.lineRuns?.[index]
    if (runs?.length) {
      const prepared = runs.map(segment => {
        const font = `${(segment.style.italic ?? block.italic) ? 'italic ' : ''}${(segment.style.bold ?? block.bold) ? '700 ' : '400 '}${project.fontSize}pt ${getScreenplayFontStack(segment.style.fontFamily || block.fontFamily || project.fontFamily, format, project.language, Boolean(segment.style.fontFamily || block.fontFamily) || shouldHonorProjectFont(project))}`
        context.font = font
        return { segment, font, width: context.measureText(segment.text).width }
      })
      const width = prepared.reduce((sum, part) => sum + part.width, 0)
      let cursor = block.align === 'center' ? x - width / 2 : block.align === 'right' ? x - width : x
      context.save()
      context.textAlign = 'left'
      for (const part of prepared) {
        context.font = part.font
        context.fillText(part.segment.text, cursor, y)
        if (part.segment.style.underline ?? block.underline) drawUnderline(context, part.segment.text, cursor, y + lineHeight - 2, 'left')
        cursor += part.width
      }
      context.restore()
      return
    }
    context.fillText(line, x, y)
    if (block.underline && line.trim()) {
      drawUnderline(context, line, x, y + lineHeight - 2, block.align)
    }
  })

  const number = block.sourceId ? block.sceneNumber ?? sceneNumbers.get(block.sourceId) : undefined
  if (includeSceneNumbers && block.sourceType === 'scene' && number) {
    context.font = `${block.italic ? 'italic ' : ''}400 ${project.fontSize}pt ${fontStack}`
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
  const fontStack = getScreenplayFontStack(project.fontFamily, format, project.language, shouldHonorProjectFont(project))
  context.fillStyle = '#111111'
  context.textAlign = 'center'
  context.font = `${project.fontSize}pt ${fontStack}`
  const titleWidth = format.page.width - format.page.marginLeft - format.page.marginRight
  const centerX = format.page.marginLeft + titleWidth / 2
  const y = format.page.height * 0.34
  const titleText = title.title.toLocaleUpperCase(project.language)
  const lineHeight = getScreenplayLineHeight(project.fontSize)
  const wrap = (value: string, width: number) => wrapMeasuredText(value, width, text => context.measureText(text).width, project.language)
  const titleLines = wrap(titleText, titleWidth)
  // Measure all cover fields before painting so an overflow cannot emit a partial page.
  let contentBottom = y + titleLines.length * lineHeight
  let creditY = y + (titleLines.length - 1) * lineHeight + 40
  const credits = [title.credit, title.authors, title.basedOn].filter(Boolean).map(value => {
    const lines = wrap(value, titleWidth), top = creditY
    contentBottom = top + lines.length * lineHeight
    creditY = contentBottom + 8
    return { lines, top }
  })
  const columnWidth = Math.min(300, (titleWidth - 24) / 2)
  const contact = title.contact ? wrap(title.contact, columnWidth) : []
  const metadata = [title.draftDate, title.copyright].filter(Boolean).join('\n')
  const right = metadata ? wrap(metadata, columnWidth) : []
  const bottom = format.page.height - format.page.marginBottom
  const contactTop = bottom - contact.length * lineHeight
  const rightTop = bottom - right.length * lineHeight
  const footerTop = Math.min(contact.length ? contactTop : bottom, right.length ? rightTop : bottom)
  const contentLimit = contact.length || right.length ? footerTop - 16 : bottom
  if (contentBottom > contentLimit || footerTop < format.page.marginTop) {
    throw new CoverOverflowError()
  }
  titleLines.forEach((line, index) => {
    const lineY = y + index * lineHeight
    context.fillText(line, centerX, lineY)
    if (line.trim()) drawUnderline(context, line, centerX, lineY + getTitleUnderlineOffset(project.fontSize), 'center')
  })
  credits.forEach(block => block.lines.forEach((line, index) => context.fillText(line, centerX, block.top + index * lineHeight)))
  context.textAlign = 'left'
  contact.forEach((line, index) => context.fillText(line, format.page.marginLeft, contactTop + index * lineHeight))
  context.textAlign = 'right'
  right.forEach((line, index) => context.fillText(line, format.page.width - format.page.marginRight, rightTop + index * lineHeight))
  return { name: `${safeFileName(project.title)}_title.png`, dataUrl: canvas.toDataURL('image/png') }
}

function getTitleUnderlineOffset(fontSize: number) {
  return Math.round(fontSize * (96 / 72)) - 2
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

function shouldHonorProjectFont(project: ScriptProject) {
  return project.exportSettings?.profileId === 'custom'
}
