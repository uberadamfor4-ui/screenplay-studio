export type ScriptElementType =
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'section'
  | 'note'

export type ScriptFormatId = 'hollywood' | 'eastAsia' | 'stage' | 'audio'

export type AppLocale = 'zh-CN' | 'en-US' | 'zh-TW' | 'ja-JP' | 'ko-KR'

export type ScriptElement = {
  id: string
  type: ScriptElementType
  text: string
}

export type ScriptProject = {
  appVersion: string
  title: string
  author: string
  language: AppLocale
  formatId: ScriptFormatId
  fontFamily: string
  fontSize: number
  pageSize: 'letter' | 'a4'
  elements: ScriptElement[]
  productionLock?: ProductionLock
  series?: SeriesProject
  reviewNotes?: ReviewNote[]
  versionHistory?: VersionSnapshot[]
}

export type ProductionLock = {
  enabled: boolean
  pages: number
  scenes: number
  lockedAt: string
}

export type SeriesEpisode = {
  id: string
  title: string
  logline: string
  pages: number
  scenes: number
  characters: string[]
  updatedAt: string
}

export type SeriesProject = {
  title: string
  episodes: SeriesEpisode[]
}

export type ReviewNoteCategory = 'writer' | 'director' | 'producer' | 'actor'

export type ReviewNote = {
  id: string
  elementId: string
  author: string
  category: ReviewNoteCategory
  text: string
  resolved: boolean
  createdAt: string
}

export type VersionSnapshot = {
  id: string
  title: string
  note: string
  createdAt: string
  elements: ScriptElement[]
}

export type FontPayload = {
  fonts: string[]
}

export type DesktopFileResult = {
  canceled: boolean
  filePath?: string
  content?: string
}

export type SaveTextPayload = {
  content: string
  filePath?: string
  suggestedName: string
  filters: Array<{
    name: string
    extensions: string[]
  }>
}

export type PngPagePayload = {
  name: string
  dataUrl: string
}

export type ExportPdfPayload = {
  html: string
  suggestedName: string
}

export type ExportPngPayload = {
  pages: PngPagePayload[]
  suggestedFolderName: string
}

export type MenuCommand =
  | 'undoProject'
  | 'redoProject'
  | 'newProject'
  | 'openProject'
  | 'saveProject'
  | 'saveProjectAs'
  | 'openPreferences'
  | 'openAssistiveTools'
  | 'openCommandPalette'
  | 'importFdx'
  | 'importWordTxt'
  | 'exportFdx'
  | 'exportPdf'
  | 'exportPng'

export type DesktopApi = {
  listFonts: () => Promise<FontPayload>
  openTextFile: (filters: SaveTextPayload['filters']) => Promise<DesktopFileResult>
  saveTextFile: (payload: SaveTextPayload) => Promise<DesktopFileResult>
  exportPdf: (payload: ExportPdfPayload) => Promise<DesktopFileResult>
  exportPngPages: (payload: ExportPngPayload) => Promise<DesktopFileResult>
  onMenuCommand: (callback: (command: MenuCommand) => void) => () => void
}
