import courierPrimeBoldItalicUrl from '@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2?inline'
import courierPrimeBoldUrl from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?inline'
import courierPrimeItalicUrl from '@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2?inline'
import courierPrimeRegularUrl from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?inline'
import { getScreenplayFontStack, getScreenplayTypographyCss, type ScriptFormat } from './formats'
import { createCanvasTextMeasurer, layoutScreenplay, type LayoutResult, type PositionedBlock } from './layoutEngine'
import { createDefaultTitlePage, resolveExportProject } from './exportProfiles'
import type { ScriptProject, TitlePageData } from './types'

type PrintHtmlOptions = {
  watermark?: string
}

export async function buildPrintHtml(project: ScriptProject, _format: ScriptFormat, options: PrintHtmlOptions = {}) {
  const resolved = resolveExportProject(project)
  await document.fonts.ready
  await Promise.allSettled([
    document.fonts.load(`${resolved.project.fontSize}pt "Courier Prime"`),
    document.fonts.load(`${resolved.project.fontSize}pt "Screenplay CJK"`),
  ])
  const layout = layoutScreenplay(resolved.project, resolved.format, createCanvasTextMeasurer(resolved.project, resolved.format))
  return buildPrintHtmlFromLayout(resolved.project, resolved.format, layout, options)
}

export function buildPrintHtmlFromLayout(project: ScriptProject, format: ScriptFormat, layout: LayoutResult, options: PrintHtmlOptions = {}) {
  const watermark = options.watermark?.trim()
  const sceneNumbers = buildSceneNumberMap(project)
  const titlePage = project.titlePage ?? createDefaultTitlePage(project)
  const titleHtml = layout.settings.includeTitlePage && titlePage.enabled ? renderTitlePage(titlePage, watermark) : ''
  const pageHtml = layout.pages
    .map((page, index) => {
      const items = page.blocks.map((block) => renderBlock(block, layout.lineHeight, layout.settings.sceneNumbers, sceneNumbers)).join('\n')
      const pageNumber = index === 0 ? '' : `${page.label}.`
      const header = layout.settings.headerText.trim()
      const footer = layout.settings.footerText.trim()
      return `<section class="page"${watermark ? ` data-watermark="${escapeHtml(watermark)}"` : ''}>${header ? `<div class="document-header">${escapeHtml(header)}</div>` : ''}${items}<footer><span>${escapeHtml(footer)}</span><b>${pageNumber}</b></footer></section>`
    })
    .join('\n')
  const fontStack = getScreenplayFontStack(project.fontFamily, format, project.language)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(project.title)}</title>
  <style>
    ${embeddedFontCss()}
    @page { size: ${format.page.kind === 'a4' ? 'A4' : 'Letter'}; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #ffffff; color: #111111; }
    .page {
      position: relative;
      width: ${format.page.width}px;
      height: ${format.page.height}px;
      break-after: page;
      page-break-after: always;
      overflow: hidden;
      font-family: ${fontStack};
      font-size: ${project.fontSize}pt;
      line-height: ${layout.lineHeight}px;
      ${getScreenplayTypographyCss()};
      background: #ffffff;
    }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .element { position: absolute; margin: 0; white-space: nowrap; overflow: visible; }
    .script-line { display: block; height: ${layout.lineHeight}px; line-height: ${layout.lineHeight}px; white-space: pre; }
    .scene-number { position: absolute; top: 0; width: 42px; font-weight: 400; }
    .scene-number.left { right: calc(100% + 10px); text-align: right; }
    .scene-number.right { left: calc(100% + 10px); text-align: left; }
    footer { position: absolute; display: flex; justify-content: space-between; align-items: baseline; left: ${format.page.marginLeft}px; right: ${format.page.marginRight}px; top: 48px; font-size: 9pt; font-weight: 400; }
    footer b { margin-left: auto; font-weight: 400; }
    .document-header { position: absolute; top: 48px; left: ${format.page.marginLeft}px; right: ${format.page.marginRight + 48}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9pt; }
    .title-content { position: absolute; top: 34%; left: ${format.page.marginLeft}px; right: ${format.page.marginRight}px; text-align: center; }
    .title-content h1 { margin: 0 0 24px; font: inherit; text-decoration: underline; text-transform: uppercase; }
    .title-content p { margin: 0; white-space: pre-wrap; }
    .title-based-on { margin-top: 22px !important; }
    .title-contact { position: absolute; left: ${format.page.marginLeft}px; bottom: ${format.page.marginBottom}px; max-width: 300px; white-space: pre-wrap; }
    .title-meta { position: absolute; right: ${format.page.marginRight}px; bottom: ${format.page.marginBottom}px; max-width: 300px; text-align: right; white-space: pre-wrap; }
    ${watermark ? `.page::before { content: attr(data-watermark); position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; color: rgba(18, 29, 32, 0.075); font-family: Arial, sans-serif; font-size: 74px; font-weight: 800; transform: rotate(-28deg); text-transform: uppercase; z-index: 4; } .element, footer, .document-header, .title-content, .title-contact, .title-meta { z-index: 5; }` : ''}
  </style>
</head>
<body>
${titleHtml}${pageHtml}
</body>
</html>`
}

function renderBlock(
  block: PositionedBlock,
  lineHeight: number,
  includeSceneNumbers: boolean,
  sceneNumbers: Map<string, string>,
) {
  const lines = block.lines.map((line) => `<span class="script-line">${escapeHtml(line || ' ')}</span>`).join('')
  const number = block.sourceId ? block.sceneNumber ?? sceneNumbers.get(block.sourceId) : undefined
  const sceneNumberHtml = includeSceneNumbers && block.sourceType === 'scene' && number
    ? `<span class="scene-number left">${escapeHtml(number)}</span><span class="scene-number right">${escapeHtml(number)}</span>`
    : ''
  const style = [
    `left:${block.x}px`,
    `top:${block.y}px`,
    `width:${block.width}px`,
    `height:${block.lines.length * lineHeight}px`,
    `text-align:${block.align}`,
    block.bold ? 'font-weight:700' : 'font-weight:400',
    block.italic ? 'font-style:italic' : 'font-style:normal',
  ].join(';')
  return `<div class="element ${block.type}${block.dualSide ? ` dual-${block.dualSide}` : ''}" style="${style}">${sceneNumberHtml}${lines}</div>`
}

function renderTitlePage(title: TitlePageData, watermark?: string) {
  const metadata = [title.draftDate, title.copyright].filter(Boolean).map(escapeHtml).join('<br>')
  return `<section class="page title-page"${watermark ? ` data-watermark="${escapeHtml(watermark)}"` : ''}>
    <div class="title-content">
      <h1>${escapeHtml(title.title || '未命名剧本')}</h1>
      ${title.credit ? `<p>${escapeHtml(title.credit)}</p>` : ''}
      <p>${escapeHtml(title.authors)}</p>
      ${title.basedOn ? `<p class="title-based-on">${escapeHtml(title.basedOn)}</p>` : ''}
    </div>
    ${title.contact ? `<div class="title-contact">${escapeHtml(title.contact)}</div>` : ''}
    ${metadata ? `<div class="title-meta">${metadata}</div>` : ''}
  </section>`
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

function embeddedFontCss() {
  return `
    @font-face { font-family: "Courier Prime"; font-style: normal; font-weight: 400; font-display: block; src: url("${courierPrimeRegularUrl}") format("woff2"); }
    @font-face { font-family: "Courier Prime"; font-style: italic; font-weight: 400; font-display: block; src: url("${courierPrimeItalicUrl}") format("woff2"); }
    @font-face { font-family: "Courier Prime"; font-style: normal; font-weight: 700; font-display: block; src: url("${courierPrimeBoldUrl}") format("woff2"); }
    @font-face { font-family: "Courier Prime"; font-style: italic; font-weight: 700; font-display: block; src: url("${courierPrimeBoldItalicUrl}") format("woff2"); }
    @font-face { font-family: "Screenplay CJK"; font-style: normal; font-weight: 100 900; font-display: block; src: url("{{SCREENPLAY_CJK_FONT_URL}}") format("opentype"); }
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
