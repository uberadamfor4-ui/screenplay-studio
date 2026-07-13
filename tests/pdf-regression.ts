import { buildPrintHtml } from '../src/printHtml'
import { applyExportProfile, createDefaultTitlePage } from '../src/exportProfiles'
import { createElement, getFormat } from '../src/formats'
import type { ExportProfileId, ScriptProject } from '../src/types'

const profileId = (new URLSearchParams(location.search).get('profile') ?? 'us-spec') as ExportProfileId
const project: ScriptProject = {
  appVersion: '0.4.0',
  title: `PDF 回归样本 ${profileId}`,
  author: '1037 Film',
  language: profileId === 'china-a4' ? 'zh-CN' : 'en-US',
  formatId: 'hollywood',
  fontFamily: 'Courier Prime',
  fontSize: 12,
  pageSize: 'letter',
  titlePage: createDefaultTitlePage({ title: `PDF 回归样本 ${profileId}`, author: '1037 Film' }),
  exportSettings: applyExportProfile(profileId),
  elements: [
    createElement('scene', 'INT. MEASUREMENT LAB - NIGHT'),
    createElement('action', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 THE QUICK BROWN FOX.'),
    createElement('character', 'MAYA'),
    createElement('parenthetical', '(quietly)'),
    createElement('dialogue', 'Every baseline must land exactly one sixth of an inch below the previous line.'),
    createElement('transition', 'CUT TO:'),
    createElement('scene', '内景 排版实验室 - 夜'),
    createElement('action', '中文、繁體中文、日本語と한국어가同一份剧本中都必须完整显示。'.repeat(36)),
    createElement('character', '林夏'),
    createElement('dialogue', '我们必须确认这段很长的对白跨页以后，没有丢字，没有重叠，也没有在标点前后出现不自然的断行。'.repeat(90)),
  ],
}

const html = (await buildPrintHtml(project, getFormat('hollywood')))
  .replaceAll('{{SCREENPLAY_CJK_FONT_URL}}', new URL('../src/assets/fonts/NotoSansCJKsc-Regular.otf', location.href).href)

document.open()
document.write(html)
document.close()
await document.fonts.ready
document.documentElement.dataset.pdfReady = 'true'
