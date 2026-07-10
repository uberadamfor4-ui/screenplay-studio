import type { ScriptElement, ScriptProject } from './types'
import type { ScriptFormat } from './formats'
import {
  getElementLabel,
  getScreenplayFontStack,
  getScreenplayLineHeight,
  getScreenplayTypographyCss,
  paginateElements,
  resolveElementLayout,
  wrapElementText,
} from './formats'

export function buildPrintHtml(project: ScriptProject, format: ScriptFormat) {
  const pages = paginateElements(project.elements, format, project.fontSize)
  const pageHtml = pages
    .map((page, index) => {
      const items = page.map((element, elementIndex) => renderElement(element, project, format, elementIndex === 0)).join('\n')
      const pageNumber = index === 0 ? '' : `${index + 1}.`
      return `<section class="page">${items}<footer>${pageNumber}</footer></section>`
    })
    .join('\n')
  const lineHeight = getScreenplayLineHeight(project.fontSize)
  const fontStack = getScreenplayFontStack(project.fontFamily, format)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(project.title)}</title>
  <style>
    @page { size: ${format.page.kind === 'a4' ? 'A4' : 'Letter'}; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; color: #111827; }
    .page {
      position: relative;
      width: ${format.page.width}px;
      height: ${format.page.height}px;
      padding: ${format.page.marginTop}px ${format.page.marginRight}px ${format.page.marginBottom}px ${format.page.marginLeft}px;
      break-after: page;
      page-break-after: always;
      font-family: ${fontStack};
      font-size: ${project.fontSize}pt;
      line-height: ${lineHeight}px;
      ${getScreenplayTypographyCss()};
      background: #ffffff;
    }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .element { overflow-wrap: normal; word-break: normal; }
    .script-line { height: ${lineHeight}px; line-height: ${lineHeight}px; white-space: pre; }
    footer { position: absolute; right: ${format.page.marginRight}px; top: 48px; font-size: 9pt; color: #111827; }
  </style>
</head>
<body>
${pageHtml}
</body>
</html>`
}

function renderElement(element: ScriptElement, project: ScriptProject, format: ScriptFormat, isFirstOnPage: boolean) {
  const layout = resolveElementLayout(element, format)
  const label = element.type === 'note' ? `[${getElementLabel(element.type, project.language)}] ` : ''
  const text = layout.uppercase ? `${label}${element.text}`.toUpperCase() : `${label}${element.text}`
  const lines = wrapElementText({ text: text || ' ' }, layout, project.fontSize)
    .map((line) => `<div class="script-line">${escapeHtml(line || ' ')}</div>`)
    .join('')
  const style = [
    `margin-left:${layout.marginLeft}px`,
    `width:${layout.width}px`,
    `text-align:${layout.align}`,
    `margin-top:${isFirstOnPage ? 0 : layout.before}px`,
    `margin-bottom:${layout.after}px`,
    layout.bold ? 'font-weight:700' : '',
    layout.italic ? 'font-style:italic' : '',
  ]
    .filter(Boolean)
    .join(';')

  return `<div class="element" style="${style}">${lines}</div>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
