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
  dualDialogue?: {
    groupId: string
    side: 'left' | 'right'
  }
}

export type ExportProfileId = 'us-spec' | 'us-production' | 'china-a4' | 'bbc-tv' | 'custom'

export type TitlePageData = {
  enabled: boolean
  title: string
  credit: string
  authors: string
  basedOn: string
  draftDate: string
  contact: string
  copyright: string
}

export type ExportSettings = {
  profileId: ExportProfileId
  includeTitlePage: boolean
  moreContinued: boolean
  sceneNumbers: boolean
  lockedPageLabels: boolean
  headerText: string
  footerText: string
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
  titlePage?: TitlePageData
  exportSettings?: ExportSettings
  productionLock?: ProductionLock
  series?: SeriesProject
  reviewNotes?: ReviewNote[]
  versionHistory?: VersionSnapshot[]
  production?: ProductionData
}

export type ProductionLock = {
  enabled: boolean
  pages: number
  scenes: number
  lockedAt: string
  pageLabels?: string[]
  sceneNumbers?: Record<string, string>
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

export type ProductionStage = 'preproduction' | 'onset' | 'post'

export type ProductionDepartment =
  | 'producer'
  | 'location'
  | 'camera'
  | 'storyboard'
  | 'art'
  | 'props'
  | 'costume'
  | 'editorial'

export type ProductionStatus = 'todo' | 'inProgress' | 'review' | 'approved' | 'blocked'

export type BreakdownCategory =
  | 'cast'
  | 'extras'
  | 'location'
  | 'props'
  | 'costume'
  | 'makeup'
  | 'vehicle'
  | 'animal'
  | 'stunt'
  | 'vfx'
  | 'sfx'
  | 'sound'
  | 'setDressing'
  | 'equipment'
  | 'note'

export type BreakdownTag = {
  id: string
  sceneId: string
  category: BreakdownCategory
  name: string
  sourceElementId?: string
  sourceText?: string
  confirmed: boolean
  dismissed?: boolean
  notes: string
}

export type ProductionScene = {
  sceneId: string
  number: string
  heading: string
  locationName: string
  timeOfDay: string
  interiorExterior: string
  pageEighths: number
  shootDayId?: string
  status: ProductionStatus
  notes: string
  tagIds: string[]
}

export type LocationRecord = {
  id: string
  name: string
  address: string
  coordinates: string
  contact: string
  phone: string
  availability: string
  permitStatus: string
  fee: string
  power: string
  noise: string
  parking: string
  facilities: string
  accessibility: string
  safety: string
  sunDirection: string
  dimensions: string
  score: number
  status: ProductionStatus
  notes: string
  photoPaths: string[]
}

export type ShotRecord = {
  id: string
  sceneId: string
  number: string
  description: string
  shotSize: string
  angle: string
  movement: string
  lens: string
  fps: string
  shutter: string
  filter: string
  support: string
  camera: string
  lighting: string
  equipment: string
  estimatedMinutes: number
  durationSeconds: number
  storyboardPath: string
  dialogueReference: string
  status: ProductionStatus
  notes: string
}

export type TakeRecord = {
  id: string
  shotId: string
  takeNumber: number
  timecodeIn: string
  timecodeOut: string
  videoRoll: string
  soundRoll: string
  selected: boolean
  status: 'good' | 'hold' | 'ng'
  notes: string
}

export type ProductionAsset = {
  id: string
  department: 'art' | 'props' | 'costume'
  name: string
  category: string
  sceneIds: string[]
  character: string
  quantity: number
  source: string
  vendor: string
  cost: string
  fittingOrDelivery: string
  returnOrStrike: string
  continuity: string
  photoPaths: string[]
  status: ProductionStatus
  notes: string
}

export type ShootDay = {
  id: string
  dayNumber: number
  date: string
  unit: string
  sceneIds: string[]
  callTime: string
  mealTime: string
  wrapTime: string
  locationName: string
  notes: string
}

export type ProductionTask = {
  id: string
  department: ProductionDepartment
  title: string
  sceneId?: string
  assignee: string
  dueDate: string
  priority: 'low' | 'normal' | 'high'
  status: ProductionStatus
  notes: string
}

export type ProductionNote = {
  id: string
  entityType: 'scene' | 'shot' | 'asset' | 'location' | 'take' | 'task'
  entityId: string
  department: ProductionDepartment
  author: string
  text: string
  status: 'open' | 'resolved'
  createdAt: string
}

export type ScriptChangeImpact = {
  id: string
  sceneId: string
  changeType: 'added' | 'changed' | 'removed'
  summary: string
  departments: ProductionDepartment[]
  acknowledgedBy: ProductionDepartment[]
  createdAt: string
}

export type ProductionData = {
  schemaVersion: 1
  syncedAt: string
  scriptFingerprint: string
  sceneFingerprints: Record<string, string>
  scenes: ProductionScene[]
  tags: BreakdownTag[]
  locations: LocationRecord[]
  shots: ShotRecord[]
  takes: TakeRecord[]
  assets: ProductionAsset[]
  shootDays: ShootDay[]
  tasks: ProductionTask[]
  notes: ProductionNote[]
  changeImpacts: ScriptChangeImpact[]
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
  | 'openWritingWorkspace'
  | 'openPreproduction'
  | 'openOnset'
  | 'openPost'
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
