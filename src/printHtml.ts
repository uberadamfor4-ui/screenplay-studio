import type { ScriptElement, ScriptProject } from './types'
import type { ScriptFormat } from './formats'
import { getElementLabel, paginateElements, resolveElementLayout } from './formats'

export function buildPrintHtml(project: ScriptProject, format: ScriptFormat) {
  const pages = paginateElements(project.elements, format, project.fontSize)
  const pageHtml = pages
    .map((page, index) => {
      const items = page.map((element) => renderElement(element, project, format)).join('\n')
      return `<section class="page">${items}<footer>${index + 1}</footer></section>`
    })
    .join('\n')

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
      min-height: ${format.page.height}px;
      padding: ${format.page.marginTop}px ${format.page.marginRight}px ${format.page.marginBottom}px ${format.page.marginLeft}px;
      break-after: page;
      page-break-after: always;
      font-family: "${escapeCss(project.fontFamily)}", "Courier New", "Microsoft YaHei", monospace;
      font-size: ${project.fontSize}pt;
      line-height: 1;
      background: #ffffff;
    }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .element { white-space: pre-wrap; overflow-wrap: break-word; }
    footer { position: absolute; right: ${format.page.marginRight}px; top: 36px; font-size: 9pt; color: #6b7280; }
  </style>
</head>
<body>
${pageHtml}
</body>
</html>`
}

function renderElement(element: ScriptElement, project: ScriptProject, format: ScriptFormat) {
  const layout = resolveElementLayout(element, format)
  const label = element.type === 'note' ? `[${getElementLabel(element.type, project.language)}] ` : ''
  const text = layout.uppercase ? `${label}${element.text}`.toUpperCase() : `${label}${element.text}`
  const style = [
    `margin-left:${layout.marginLeft}px`,
    `width:${layout.width}px`,
    `text-align:${layout.align}`,
    `margin-top:${layout.before}px`,
    `margin-bottom:${layout.after}px`,
    layout.bold ? 'font-weight:700' : '',
    layout.italic ? 'font-style:italic' : '',
  ]
    .filter(Boolean)
    .join(';')

  return `<div class="element" style="${style}">${escapeHtml(text || ' ')}</div>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeCss(value: string) {
  return value.replace(/["\\]/g, '')
}
