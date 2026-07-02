import type { AppLocale } from './types'

export type UiLocale = 'zh-CN' | 'en-US' | 'zh-TW'

export const localeOptions: UiLocale[] = ['zh-CN', 'en-US', 'zh-TW']
export const scriptLocaleOptions: AppLocale[] = ['zh-CN', 'en-US', 'zh-TW', 'ja-JP', 'ko-KR']

export const localeNames: Record<UiLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
  'zh-TW': '繁體中文',
}

export const scriptLocaleNames: Record<AppLocale, Record<UiLocale, string>> = {
  'zh-CN': { 'zh-CN': '简体中文', 'en-US': 'Simplified Chinese', 'zh-TW': '簡體中文' },
  'en-US': { 'zh-CN': '英语', 'en-US': 'English', 'zh-TW': '英文' },
  'zh-TW': { 'zh-CN': '繁体中文', 'en-US': 'Traditional Chinese', 'zh-TW': '繁體中文' },
  'ja-JP': { 'zh-CN': '日语', 'en-US': 'Japanese', 'zh-TW': '日文' },
  'ko-KR': { 'zh-CN': '韩语', 'en-US': 'Korean', 'zh-TW': '韓文' },
}

const messages = {
  appTitle: {
    'zh-CN': '剧本工坊',
    'en-US': 'Screenplay Studio',
    'zh-TW': '劇本工坊',
  },
  newProject: { 'zh-CN': '新建', 'en-US': 'New', 'zh-TW': '新增' },
  newScript: { 'zh-CN': '新建剧本', 'en-US': 'New Script', 'zh-TW': '新增劇本' },
  open: { 'zh-CN': '打开', 'en-US': 'Open', 'zh-TW': '開啟' },
  save: { 'zh-CN': '保存', 'en-US': 'Save', 'zh-TW': '儲存' },
  saveAs: { 'zh-CN': '另存', 'en-US': 'Save As', 'zh-TW': '另存' },
  preferences: { 'zh-CN': '偏好', 'en-US': 'Preferences', 'zh-TW': '偏好' },
  assistiveTools: { 'zh-CN': '辅助功能', 'en-US': 'Assistive Tools', 'zh-TW': '輔助功能' },
  commandPalette: { 'zh-CN': '命令', 'en-US': 'Command', 'zh-TW': '命令' },
  commandPlaceholder: { 'zh-CN': '输入要执行的功能', 'en-US': 'Type a command', 'zh-TW': '輸入要執行的功能' },
  close: { 'zh-CN': '关闭', 'en-US': 'Close', 'zh-TW': '關閉' },
  importFdx: { 'zh-CN': '导入 FDX', 'en-US': 'Import FDX', 'zh-TW': '匯入 FDX' },
  exportFdx: { 'zh-CN': '导出 FDX', 'en-US': 'Export FDX', 'zh-TW': '匯出 FDX' },
  exportPdf: { 'zh-CN': '导出 PDF', 'en-US': 'Export PDF', 'zh-TW': '匯出 PDF' },
  exportPng: { 'zh-CN': '导出 PNG', 'en-US': 'Export PNG', 'zh-TW': '匯出 PNG' },
  project: { 'zh-CN': '项目', 'en-US': 'Project', 'zh-TW': '專案' },
  title: { 'zh-CN': '片名', 'en-US': 'Title', 'zh-TW': '片名' },
  author: { 'zh-CN': '作者', 'en-US': 'Author', 'zh-TW': '作者' },
  language: { 'zh-CN': '语言', 'en-US': 'Language', 'zh-TW': '語言' },
  interfaceLanguage: { 'zh-CN': '界面语言', 'en-US': 'Interface Language', 'zh-TW': '介面語言' },
  scriptLanguage: { 'zh-CN': '剧本语言', 'en-US': 'Script Language', 'zh-TW': '劇本語言' },
  format: { 'zh-CN': '格式', 'en-US': 'Format', 'zh-TW': '格式' },
  font: { 'zh-CN': '字体', 'en-US': 'Font', 'zh-TW': '字體' },
  size: { 'zh-CN': '字号', 'en-US': 'Size', 'zh-TW': '字號' },
  outline: { 'zh-CN': '结构', 'en-US': 'Structure', 'zh-TW': '結構' },
  editor: { 'zh-CN': '正文', 'en-US': 'Editor', 'zh-TW': '正文' },
  preview: { 'zh-CN': '分页预览', 'en-US': 'Page Preview', 'zh-TW': '分頁預覽' },
  addElement: { 'zh-CN': '新增元素', 'en-US': 'Add Element', 'zh-TW': '新增元素' },
  addScene: { 'zh-CN': '添加场景', 'en-US': 'Add Scene', 'zh-TW': '新增場景' },
  transitionPreset: { 'zh-CN': '转场方式', 'en-US': 'Transition', 'zh-TW': '轉場方式' },
  applyTerms: { 'zh-CN': '套用术语', 'en-US': 'Apply Terms', 'zh-TW': '套用術語' },
  termStyle: { 'zh-CN': '场景术语', 'en-US': 'Scene Terms', 'zh-TW': '場景術語' },
  defaultScriptLanguage: { 'zh-CN': '默认剧本语言', 'en-US': 'Default Script Language', 'zh-TW': '預設劇本語言' },
  defaultScenePlace: { 'zh-CN': '默认内外景', 'en-US': 'Default Interior/Exterior', 'zh-TW': '預設內外景' },
  defaultSceneTime: { 'zh-CN': '默认时间', 'en-US': 'Default Time', 'zh-TW': '預設時間' },
  defaultTransition: { 'zh-CN': '默认转场', 'en-US': 'Default Transition', 'zh-TW': '預設轉場' },
  defaultFormat: { 'zh-CN': '默认格式', 'en-US': 'Default Format', 'zh-TW': '預設格式' },
  defaultFont: { 'zh-CN': '默认字体', 'en-US': 'Default Font', 'zh-TW': '預設字體' },
  defaultFontSize: { 'zh-CN': '默认字号', 'en-US': 'Default Size', 'zh-TW': '預設字號' },
  applyToProject: { 'zh-CN': '应用到当前项目', 'en-US': 'Apply to Current Project', 'zh-TW': '套用到目前專案' },
  resetDefaults: { 'zh-CN': '恢复默认', 'en-US': 'Reset Defaults', 'zh-TW': '恢復預設' },
  done: { 'zh-CN': '完成', 'en-US': 'Done', 'zh-TW': '完成' },
  delete: { 'zh-CN': '删除', 'en-US': 'Delete', 'zh-TW': '刪除' },
  moveUp: { 'zh-CN': '上移', 'en-US': 'Move Up', 'zh-TW': '上移' },
  moveDown: { 'zh-CN': '下移', 'en-US': 'Move Down', 'zh-TW': '下移' },
  ready: { 'zh-CN': '就绪', 'en-US': 'Ready', 'zh-TW': '就緒' },
  saved: { 'zh-CN': '已保存', 'en-US': 'Saved', 'zh-TW': '已儲存' },
  exported: { 'zh-CN': '已导出', 'en-US': 'Exported', 'zh-TW': '已匯出' },
  pngDone: { 'zh-CN': 'PNG 已生成', 'en-US': 'PNG pages exported', 'zh-TW': 'PNG 已生成' },
  fdxImported: { 'zh-CN': 'FDX 已导入', 'en-US': 'FDX imported', 'zh-TW': 'FDX 已匯入' },
  wordTxtImported: { 'zh-CN': '文档已导入', 'en-US': 'Document imported', 'zh-TW': '文件已匯入' },
  assistiveDone: { 'zh-CN': '辅助功能已执行', 'en-US': 'Assistive action done', 'zh-TW': '輔助功能已執行' },
  startHere: { 'zh-CN': '从这里开始', 'en-US': 'Start Here', 'zh-TW': '從這裡開始' },
  pickStructure: { 'zh-CN': '套用结构', 'en-US': 'Use Structure', 'zh-TW': '套用結構' },
  exportWork: { 'zh-CN': '导出成品', 'en-US': 'Export Work', 'zh-TW': '匯出成品' },
  currentSelection: { 'zh-CN': '当前选中', 'en-US': 'Current Selection', 'zh-TW': '目前選取' },
  focusWriting: { 'zh-CN': '专注写作', 'en-US': 'Focus Writing', 'zh-TW': '專注寫作' },
  studioWorkspace: { 'zh-CN': '完整面板', 'en-US': 'Full Workspace', 'zh-TW': '完整面板' },
  page: { 'zh-CN': '第 {n} 页', 'en-US': 'Page {n}', 'zh-TW': '第 {n} 頁' },
  pages: { 'zh-CN': '页数', 'en-US': 'Pages', 'zh-TW': '頁數' },
  scenes: { 'zh-CN': '场景', 'en-US': 'Scenes', 'zh-TW': '場景' },
  characters: { 'zh-CN': '角色', 'en-US': 'Characters', 'zh-TW': '角色' },
  dialogueUnits: { 'zh-CN': '对白', 'en-US': 'Dialogues', 'zh-TW': '對白' },
  beats: { 'zh-CN': '节拍', 'en-US': 'Beats', 'zh-TW': '節拍' },
  words: { 'zh-CN': '词数', 'en-US': 'Words', 'zh-TW': '詞數' },
  chars: { 'zh-CN': '字数', 'en-US': 'Chars', 'zh-TW': '字數' },
  selected: { 'zh-CN': '当前元素', 'en-US': 'Selection', 'zh-TW': '目前元素' },
  elementType: { 'zh-CN': '元素类型', 'en-US': 'Element Type', 'zh-TW': '元素類型' },
  position: { 'zh-CN': '位置', 'en-US': 'Position', 'zh-TW': '位置' },
  textLength: { 'zh-CN': '字符长度', 'en-US': 'Text Length', 'zh-TW': '字元長度' },
  noSelection: { 'zh-CN': '没有选中元素', 'en-US': 'No selection', 'zh-TW': '沒有選取元素' },
  formatPanel: { 'zh-CN': '格式', 'en-US': 'Format', 'zh-TW': '格式' },
  structurePanel: { 'zh-CN': '结构', 'en-US': 'Structure', 'zh-TW': '結構' },
  exportPanel: { 'zh-CN': '导出', 'en-US': 'Export', 'zh-TW': '匯出' },
  projectFile: { 'zh-CN': '项目文件', 'en-US': 'Project File', 'zh-TW': '專案檔' },
  statistics: { 'zh-CN': '统计', 'en-US': 'Statistics', 'zh-TW': '統計' },
  typoCorrection: { 'zh-CN': '错别字与用词统一', 'en-US': 'Typo and Term Cleanup', 'zh-TW': '錯別字與用詞統一' },
  correctionPairs: { 'zh-CN': '替换表', 'en-US': 'Replacement Table', 'zh-TW': '替換表' },
  applyCorrections: { 'zh-CN': '统一修正', 'en-US': 'Apply Cleanup', 'zh-TW': '統一修正' },
  replaceText: { 'zh-CN': '替换文字', 'en-US': 'Replace Text', 'zh-TW': '替換文字' },
  findText: { 'zh-CN': '查找文字', 'en-US': 'Find Text', 'zh-TW': '尋找文字' },
  replaceWith: { 'zh-CN': '替换为', 'en-US': 'Replace With', 'zh-TW': '替換為' },
  replaceAll: { 'zh-CN': '全部替换', 'en-US': 'Replace All', 'zh-TW': '全部替換' },
  characterSummary: { 'zh-CN': '角色统计', 'en-US': 'Character Count', 'zh-TW': '角色統計' },
  countCharacters: { 'zh-CN': '识别角色总数', 'en-US': 'Count Characters', 'zh-TW': '識別角色總數' },
  sceneNumbers: { 'zh-CN': '场序编号', 'en-US': 'Scene Numbers', 'zh-TW': '場序編號' },
  renumberScenes: { 'zh-CN': '一键加场序', 'en-US': 'Number Scenes', 'zh-TW': '一鍵加場序' },
  clearSceneNumbers: { 'zh-CN': '清除场序', 'en-US': 'Clear Numbers', 'zh-TW': '清除場序' },
  importWordTxt: { 'zh-CN': '导入文档', 'en-US': 'Import Document', 'zh-TW': '匯入文件' },
  importDocument: { 'zh-CN': '导入文档', 'en-US': 'Import Document', 'zh-TW': '匯入文件' },
  importAsHollywood: { 'zh-CN': '识别为好莱坞格式', 'en-US': 'Recognize Hollywood Format', 'zh-TW': '識別為好萊塢格式' },
  scriptDoctor: { 'zh-CN': '剧本体检', 'en-US': 'Script Doctor', 'zh-TW': '劇本體檢' },
  runScriptDoctor: { 'zh-CN': '开始体检', 'en-US': 'Run Check', 'zh-TW': '開始體檢' },
  structureMap: { 'zh-CN': '结构地图', 'en-US': 'Structure Map', 'zh-TW': '結構地圖' },
  termConversion: { 'zh-CN': '术语转换', 'en-US': 'Term Conversion', 'zh-TW': '術語轉換' },
  convertToSimplified: { 'zh-CN': '转为中文术语', 'en-US': 'Simplified Terms', 'zh-TW': '轉為簡體術語' },
  convertToEnglish: { 'zh-CN': '转为英文术语', 'en-US': 'English Terms', 'zh-TW': '轉為英文術語' },
  convertToTraditional: { 'zh-CN': '转为繁体术语', 'en-US': 'Traditional Terms', 'zh-TW': '轉為繁體術語' },
  productionTools: { 'zh-CN': '制作工具', 'en-US': 'Production Tools', 'zh-TW': '製作工具' },
  productionReport: { 'zh-CN': '制作报告', 'en-US': 'Production Report', 'zh-TW': '製作報告' },
  saveRevisionSnapshot: { 'zh-CN': '保存修订快照', 'en-US': 'Save Revision Snapshot', 'zh-TW': '儲存修訂快照' },
  compareRevisionSnapshot: { 'zh-CN': '比较修订快照', 'en-US': 'Compare Snapshot', 'zh-TW': '比較修訂快照' },
  result: { 'zh-CN': '结果', 'en-US': 'Result', 'zh-TW': '結果' },
  unsavedProject: { 'zh-CN': '尚未保存到文件', 'en-US': 'Not saved to a file', 'zh-TW': '尚未儲存到檔案' },
  fileUnavailable: {
    'zh-CN': '当前运行环境没有桌面文件权限',
    'en-US': 'Desktop file access is unavailable',
    'zh-TW': '目前環境沒有桌面檔案權限',
  },
} satisfies Record<string, Record<UiLocale, string>>

export type MessageKey = keyof typeof messages

export function isUiLocale(value: string): value is UiLocale {
  return localeOptions.includes(value as UiLocale)
}

export function isAppLocale(value: string): value is AppLocale {
  return scriptLocaleOptions.includes(value as AppLocale)
}

export function normalizeUiLocale(value: string | null | undefined): UiLocale {
  return value && isUiLocale(value) ? value : 'zh-CN'
}

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  return value && isAppLocale(value) ? value : 'zh-CN'
}

export function t(locale: UiLocale, key: MessageKey, values: Record<string, string | number> = {}) {
  const template = messages[key][locale] ?? messages[key]['en-US']
  return Object.entries(values).reduce((result, [name, value]) => result.replace(`{${name}}`, String(value)), template)
}
