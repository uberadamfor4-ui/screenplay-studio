import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  CheckSquare,
  Clapperboard,
  ClipboardList,
  Columns2,
  Download,
  FileDown,
  FileJson,
  FilePlus,
  FileText,
  FolderOpen,
  GraduationCap,
  Image,
  Languages,
  LayoutTemplate,
  ListTree,
  GripVertical,
  MoreHorizontal,
  Plus,
  Redo2,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import './fonts.css'
import { buildFdx, parseFdx } from './fdx'
import { buildPrintHtml } from './printHtml'
import { renderPngPages } from './pngExport'
import { applyExportProfile, createDefaultTitlePage, exportProfiles, resolveExportProject, resolveExportSettings } from './exportProfiles'
import { createCanvasTextMeasurer, layoutScreenplay, type LayoutPage, type LayoutResult, type PositionedBlock } from './layoutEngine'
import { detectElementTypeForLine, parsePlainTextScript, stripSceneNumber } from './plainTextImport'
import { createDefaultProject } from './sample'
import { beatSheets, createBeatElements } from './structures'
import type { AppLocale, ExportProfileId, ExportSettings, MenuCommand, ProductionStage, ReviewNote, ReviewNoteCategory, ScriptElement, ScriptElementType, ScriptFormatId, ScriptProject, SeriesEpisode, TitlePageData, VersionSnapshot } from './types'
import {
  createElement,
  elementOrder,
  getElementLabel,
  getFormat,
  getScreenplayFontStack,
  getScreenplayLineHeight,
  paginateElements,
  resolveElementLayout,
  scriptFormats,
  type ScriptFormat,
  wrapElementText,
} from './formats'
import { getTransitionPresetOptions, getTransitionPresetText, transitionPresets } from './transitions'
import { localeNames, localeOptions, normalizeAppLocale, normalizeUiLocale, scriptLocaleNames, scriptLocaleOptions, t } from './i18n'
import type { MessageKey, UiLocale } from './i18n'
import { defaultPreferences, normalizePreferences, type UserPreferences } from './preferences'
import { formatShortcut, keyboardShortcuts, matchesShortcut, type ShortcutDefinition, type ShortcutId } from './shortcuts'
import { hollywoodExamples, hollywoodFormatRules, softwareLessons, type HollywoodExample } from './tutorials'
import { ProductionWorkspace } from './ProductionWorkspace'
import { synchronizeProductionData } from './production'
import {
  buildSceneHeading,
  convertSceneHeading,
  getScenePlaceToken,
  getSceneTimeToken,
  parseSceneHeading,
  scenePlaceTerms,
  sceneTimeTerms,
  type ScenePlaceId,
  type SceneTimeId,
  type TermStyle,
} from './screenplayTerms'

type LeftTab = 'outline' | 'scenes' | 'characters'
type RightTab = 'format' | 'structure' | 'export'
type WorkspaceMode = 'focus'
type RevisionColor = 'blue' | 'pink' | 'yellow' | 'green'
type RevisionState = 'added' | 'changed' | 'none'
type AuditLevel = 'pass' | 'warning' | 'error'
type DepartmentId = 'director' | 'producer' | 'camera' | 'art' | 'cast'
type ShortcutProfile = 'finalDraft' | 'chinese' | 'minimal'

type ContextMenuState = {
  elementId: string
  x: number
  y: number
}

type AutoSaveSnapshot = {
  savedAt: string
  filePath?: string
  project: ScriptProject
}

type PendingTextSelection = {
  elementId: string
  start: number
  end: number
}

type HistoryGroup = {
  elementId?: string
  timestamp: number
}

type ShortcutSettings = {
  profile: ShortcutProfile
  overrides: Partial<Record<ShortcutId, ShortcutDefinition>>
}

type FormatAuditItem = {
  id: string
  level: AuditLevel
  title: string
  detail: string
  elementId?: string
}

type SceneSummary = {
  id: string
  index: number
  page: number
  title: string
  characters: string[]
  elementCount: number
  lineCount: number
}

type HealthReport = {
  dialogueRatio: number
  averageSceneLines: number
  longestScenes: SceneSummary[]
  warnings: string[]
}

type SceneBoardCard = SceneSummary & {
  location: string
  time: string
  summary: string
}

type CharacterArc = {
  name: string
  count: number
  firstPage: number
  lastPage: number
  scenes: Array<{ title: string; page: number; beat: string }>
}

type ContinuityIssue = {
  level: AuditLevel
  title: string
  detail: string
}

type BreakdownRow = {
  scene: string
  page: number
  location: string
  time: string
  characters: string[]
  props: string[]
  costumes: string[]
  vfx: string[]
  vehicles: string[]
  extras: string[]
  summary: string
}

type ProjectLibrary = {
  characters: Array<{ name: string; count: number }>
  locations: Array<{ name: string; count: number }>
  props: Array<{ name: string; count: number }>
}

type RevisionDiff = {
  id: string
  type: RevisionState | 'removed'
  label: string
  before?: string
  after?: string
}

const commonFonts = [
  'Courier New',
  'Courier Prime',
  'Consolas',
  'Microsoft YaHei',
  'SimSun',
  'DengXian',
  'Arial',
  'Times New Roman',
  'Noto Sans CJK SC',
  'Source Han Sans SC',
]

const uiLocaleStorageKey = 'screenplay-studio.uiLocale.v3'
const preferencesStorageKey = 'screenplay-studio.preferences.v1'
const revisionSnapshotStorageKey = 'screenplay-studio.revisionSnapshot.v1'
const autoSaveStorageKey = 'screenplay-studio.autosave.v1'
const recoveryTimelineStorageKey = 'screenplay-studio.recoveryTimeline.v1'
const shortcutSettingsStorageKey = 'screenplay-studio.shortcuts.v1'
const onboardingStorageKey = 'screenplay-studio.onboarding.v1'
const developerCredit = '本软件由1037 Film 郭之然独立开发完成'

const termStyleOptions: Array<{ id: TermStyle; label: string }> = [
  { id: 'zh-CN', label: '\u7b80\u4f53\u4e2d\u6587\u672f\u8bed' },
  { id: 'en-US', label: '\u82f1\u6587\u672f\u8bed' },
  { id: 'zh-TW', label: '\u7e41\u9ad4\u4e2d\u6587\u8853\u8a9e' },
]

const defaultCorrectionPairsText = ['\u767b\u9646=\u767b\u5f55', '\u5e10\u53f7=\u8d26\u53f7', '\u5e10\u6237=\u8d26\u6237', '\u5f71\u8c61=\u5f71\u50cf', '\u5176\u5b83=\u5176\u4ed6'].join('\n')

const revisionColors: Array<{ id: RevisionColor; label: Record<UiLocale, string> }> = [
  { id: 'blue', label: { 'zh-CN': '\u84dd\u9875', 'en-US': 'Blue', 'zh-TW': '\u85cd\u9801' } },
  { id: 'pink', label: { 'zh-CN': '\u7c89\u9875', 'en-US': 'Pink', 'zh-TW': '\u7c89\u9801' } },
  { id: 'yellow', label: { 'zh-CN': '\u9ec4\u9875', 'en-US': 'Yellow', 'zh-TW': '\u9ec3\u9801' } },
  { id: 'green', label: { 'zh-CN': '\u7eff\u9875', 'en-US': 'Green', 'zh-TW': '\u7da0\u9801' } },
]

const reviewCategories: Array<{ id: ReviewNoteCategory; label: Record<UiLocale, string> }> = [
  { id: 'writer', label: { 'zh-CN': '编剧', 'en-US': 'Writer', 'zh-TW': '編劇' } },
  { id: 'director', label: { 'zh-CN': '导演', 'en-US': 'Director', 'zh-TW': '導演' } },
  { id: 'producer', label: { 'zh-CN': '制片', 'en-US': 'Producer', 'zh-TW': '製片' } },
  { id: 'actor', label: { 'zh-CN': '演员', 'en-US': 'Actor', 'zh-TW': '演員' } },
]

const departmentPackages: Array<{ id: DepartmentId; label: Record<UiLocale, string>; detail: Record<UiLocale, string> }> = [
  { id: 'director', label: { 'zh-CN': '导演包', 'en-US': 'Director', 'zh-TW': '導演包' }, detail: { 'zh-CN': '分场、节拍、审稿批注', 'en-US': 'Scenes, beats, notes', 'zh-TW': '分場、節拍、審稿批註' } },
  { id: 'producer', label: { 'zh-CN': '制片包', 'en-US': 'Producer', 'zh-TW': '製片包' }, detail: { 'zh-CN': '场景、角色、道具、锁定状态', 'en-US': 'Scenes, cast, props, lock status', 'zh-TW': '場景、角色、道具、鎖定狀態' } },
  { id: 'camera', label: { 'zh-CN': '摄影包', 'en-US': 'Camera', 'zh-TW': '攝影包' }, detail: { 'zh-CN': '地点、时间、镜头提示', 'en-US': 'Location, time, shots', 'zh-TW': '地點、時間、鏡頭提示' } },
  { id: 'art', label: { 'zh-CN': '美术包', 'en-US': 'Art', 'zh-TW': '美術包' }, detail: { 'zh-CN': '地点、道具、服化线索', 'en-US': 'Locations, props, costume cues', 'zh-TW': '地點、道具、服化線索' } },
  { id: 'cast', label: { 'zh-CN': '演员包', 'en-US': 'Cast', 'zh-TW': '演員包' }, detail: { 'zh-CN': '角色出场和分本索引', 'en-US': 'Cast appearances and sides index', 'zh-TW': '角色出場與分本索引' } },
]

const uxMessages = {
  sceneMap: { 'zh-CN': '\u5267\u672c\u5730\u56fe', 'en-US': 'Script Map', 'zh-TW': '\u5287\u672c\u5730\u5716' },
  projectHealth: { 'zh-CN': '\u9879\u76ee\u5065\u5eb7', 'en-US': 'Project Health', 'zh-TW': '\u5c08\u6848\u5065\u5eb7' },
  formatPreflight: { 'zh-CN': '\u683c\u5f0f\u9884\u68c0', 'en-US': 'Format Preflight', 'zh-TW': '\u683c\u5f0f\u9810\u6aa2' },
  professionalPreview: { 'zh-CN': '\u4e13\u4e1a\u9884\u89c8', 'en-US': 'Professional Preview', 'zh-TW': '\u5c08\u696d\u9810\u89bd' },
  typewriterMode: { 'zh-CN': '\u6253\u5b57\u673a', 'en-US': 'Typewriter', 'zh-TW': '\u6253\u5b57\u6a5f' },
  revisionMode: { 'zh-CN': '\u4fee\u8ba2\u6a21\u5f0f', 'en-US': 'Revision Mode', 'zh-TW': '\u4fee\u8a02\u6a21\u5f0f' },
  oneClickFix: { 'zh-CN': '\u4e00\u952e\u4fee\u6b63\u4e13\u4e1a\u683c\u5f0f', 'en-US': 'Fix Professional Format', 'zh-TW': '\u4e00\u9375\u4fee\u6b63\u5c08\u696d\u683c\u5f0f' },
  exportAfterCheck: { 'zh-CN': '\u786e\u8ba4\u5e76\u5bfc\u51fa PDF', 'en-US': 'Export PDF', 'zh-TW': '\u78ba\u8a8d\u4e26\u532f\u51fa PDF' },
  checksPassed: { 'zh-CN': '\u6838\u5fc3\u683c\u5f0f\u5df2\u901a\u8fc7', 'en-US': 'Core checks passed', 'zh-TW': '\u6838\u5fc3\u683c\u5f0f\u5df2\u901a\u904e' },
  checksNeedAttention: { 'zh-CN': '\u9700\u8981\u5904\u7406\u7684\u683c\u5f0f\u9879', 'en-US': 'Needs attention', 'zh-TW': '\u9700\u8981\u8655\u7406\u7684\u683c\u5f0f\u9805' },
  previewPages: { 'zh-CN': '\u524d 3 \u9875\u4e0e\u672b\u9875', 'en-US': 'First 3 Pages and Last Page', 'zh-TW': '\u524d 3 \u9801\u8207\u672b\u9801' },
  dialogueRatio: { 'zh-CN': '\u5bf9\u767d\u5360\u6bd4', 'en-US': 'Dialogue Ratio', 'zh-TW': '\u5c0d\u767d\u5360\u6bd4' },
  averageScene: { 'zh-CN': '\u5e73\u5747\u573a\u957f', 'en-US': 'Average Scene', 'zh-TW': '\u5e73\u5747\u5834\u9577' },
  longestScenes: { 'zh-CN': '\u6700\u957f\u573a\u6b21', 'en-US': 'Longest Scenes', 'zh-TW': '\u6700\u9577\u5834\u6b21' },
  warnings: { 'zh-CN': '\u98ce\u9669\u63d0\u793a', 'en-US': 'Warnings', 'zh-TW': '\u98a8\u96aa\u63d0\u793a' },
  page: { 'zh-CN': '\u9875', 'en-US': 'Page', 'zh-TW': '\u9801' },
  elements: { 'zh-CN': '\u6bb5', 'en-US': 'elements', 'zh-TW': '\u6bb5' },
  lines: { 'zh-CN': '\u884c', 'en-US': 'lines', 'zh-TW': '\u884c' },
  noSnapshot: { 'zh-CN': '\u5c1a\u672a\u4fdd\u5b58\u4fee\u8ba2\u5feb\u7167', 'en-US': 'No revision snapshot yet', 'zh-TW': '\u5c1a\u672a\u5132\u5b58\u4fee\u8a02\u5feb\u7167' },
  added: { 'zh-CN': '\u65b0\u589e', 'en-US': 'Added', 'zh-TW': '\u65b0\u589e' },
  changed: { 'zh-CN': '\u4fee\u6539', 'en-US': 'Changed', 'zh-TW': '\u4fee\u6539' },
  lockPages: { 'zh-CN': '\u9501\u9875\u53c2\u8003', 'en-US': 'Page Lock Reference', 'zh-TW': '\u9396\u9801\u53c3\u8003' },
  lockScenes: { 'zh-CN': '\u9501\u573a\u5e8f\u53c2\u8003', 'en-US': 'Scene Lock Reference', 'zh-TW': '\u9396\u5834\u5e8f\u53c3\u8003' },
  characterSuggestions: { 'zh-CN': '\u89d2\u8272\u5efa\u8bae', 'en-US': 'Character Suggestions', 'zh-TW': '\u89d2\u8272\u5efa\u8b70' },
  formatFixApplied: { 'zh-CN': '\u5df2\u5957\u7528\u597d\u83b1\u575e\u4e13\u4e1a\u683c\u5f0f\u3002', 'en-US': 'Hollywood professional format applied.', 'zh-TW': '\u5df2\u5957\u7528\u597d\u840a\u5862\u5c08\u696d\u683c\u5f0f\u3002' },
  sceneBoard: { 'zh-CN': '\u573a\u666f\u5361\u7247\u5899', 'en-US': 'Scene Board', 'zh-TW': '\u5834\u666f\u5361\u7247\u7246' },
  characterArcs: { 'zh-CN': '\u89d2\u8272\u5f27\u7ebf', 'en-US': 'Character Arcs', 'zh-TW': '\u89d2\u8272\u5f27\u7dda' },
  continuityCheck: { 'zh-CN': '\u8fde\u7eed\u6027\u68c0\u67e5', 'en-US': 'Continuity Check', 'zh-TW': '\u9023\u7e8c\u6027\u6aa2\u67e5' },
  visualRevisionCompare: { 'zh-CN': '\u53cc\u680f\u7248\u672c\u5bf9\u6bd4', 'en-US': 'Side-by-side Compare', 'zh-TW': '\u96d9\u6b04\u7248\u672c\u5c0d\u6bd4' },
  productionLock: { 'zh-CN': '\u9501\u9875/\u9501\u573a\u5e8f', 'en-US': 'Lock Pages/Scenes', 'zh-TW': '\u9396\u9801/\u9396\u5834\u5e8f' },
  sceneOutline: { 'zh-CN': '\u5bfc\u51fa\u5206\u573a\u5927\u7eb2', 'en-US': 'Export Scene Outline', 'zh-TW': '\u532f\u51fa\u5206\u5834\u5927\u7db1' },
  shootingBreakdown: { 'zh-CN': '\u62cd\u6444\u5206\u89e3\u8868', 'en-US': 'Shooting Breakdown', 'zh-TW': '\u62cd\u651d\u5206\u89e3\u8868' },
  seriesMode: { 'zh-CN': '\u5267\u96c6\u6a21\u5f0f', 'en-US': 'Series Mode', 'zh-TW': '\u5287\u96c6\u6a21\u5f0f' },
  projectLibrary: { 'zh-CN': '\u89d2\u8272/\u5730\u70b9/\u9053\u5177\u5e93', 'en-US': 'Project Library', 'zh-TW': '\u89d2\u8272/\u5730\u9ede/\u9053\u5177\u5eab' },
  fountainExport: { 'zh-CN': '\u5bfc\u51fa Fountain', 'en-US': 'Export Fountain', 'zh-TW': '\u532f\u51fa Fountain' },
  markdownExport: { 'zh-CN': '\u5bfc\u51fa Markdown', 'en-US': 'Export Markdown', 'zh-TW': '\u532f\u51fa Markdown' },
  lockProductionNow: { 'zh-CN': '\u9501\u5b9a\u5f53\u524d\u9875\u6570\u548c\u573a\u5e8f', 'en-US': 'Lock Current Pages and Scenes', 'zh-TW': '\u9396\u5b9a\u76ee\u524d\u9801\u6578\u8207\u5834\u5e8f' },
  unlockProduction: { 'zh-CN': '\u89e3\u9664\u5236\u7247\u9501\u5b9a', 'en-US': 'Unlock Production', 'zh-TW': '\u89e3\u9664\u88fd\u7247\u9396\u5b9a' },
  addCurrentEpisode: { 'zh-CN': '\u52a0\u5165\u5f53\u524d\u96c6', 'en-US': 'Add Current Episode', 'zh-TW': '\u52a0\u5165\u76ee\u524d\u96c6' },
  exportSeriesBible: { 'zh-CN': '\u5bfc\u51fa\u5267\u96c6\u5723\u7ecf', 'en-US': 'Export Series Bible', 'zh-TW': '\u532f\u51fa\u5287\u96c6\u8056\u7d93' },
  renameAll: { 'zh-CN': '\u5168\u5c40\u6539\u540d', 'en-US': 'Rename All', 'zh-TW': '\u5168\u5c40\u6539\u540d' },
  exportCsv: { 'zh-CN': '\u5bfc\u51fa CSV', 'en-US': 'Export CSV', 'zh-TW': '\u532f\u51fa CSV' },
  reviewMode: { 'zh-CN': '批注/审稿', 'en-US': 'Review Notes', 'zh-TW': '批註/審稿' },
  addReviewNote: { 'zh-CN': '添加批注', 'en-US': 'Add Note', 'zh-TW': '新增批註' },
  reviewPdf: { 'zh-CN': '导出审稿 PDF', 'en-US': 'Export Review PDF', 'zh-TW': '匯出審稿 PDF' },
  reviewWatermark: { 'zh-CN': '审稿水印', 'en-US': 'Review Watermark', 'zh-TW': '審稿浮水印' },
  characterSides: { 'zh-CN': '角色分本', 'en-US': 'Character Sides', 'zh-TW': '角色分本' },
  exportSides: { 'zh-CN': '导出分本', 'en-US': 'Export Sides', 'zh-TW': '匯出分本' },
  departmentPackage: { 'zh-CN': '部门交付包', 'en-US': 'Department Package', 'zh-TW': '部門交付包' },
  versionTimeline: { 'zh-CN': '版本时间线', 'en-US': 'Version Timeline', 'zh-TW': '版本時間線' },
  saveTimelineSnapshot: { 'zh-CN': '保存当前版本', 'en-US': 'Save Version', 'zh-TW': '儲存目前版本' },
  restoreVersion: { 'zh-CN': '恢复此版本', 'en-US': 'Restore Version', 'zh-TW': '還原此版本' },
  deleteVersion: { 'zh-CN': '删除版本', 'en-US': 'Delete Version', 'zh-TW': '刪除版本' },
  unresolvedNotes: { 'zh-CN': '未解决批注', 'en-US': 'Open Notes', 'zh-TW': '未解決批註' },
  quickJump: { 'zh-CN': '快速跳转', 'en-US': 'Quick Jump', 'zh-TW': '快速跳轉' },
  quickJumpPlaceholder: { 'zh-CN': '输入场号、地点、角色或关键词', 'en-US': 'Scene, location, character, or keyword', 'zh-TW': '輸入場號、地點、角色或關鍵詞' },
  shortcutPreferences: { 'zh-CN': '快捷键偏好', 'en-US': 'Shortcut Preferences', 'zh-TW': '快捷鍵偏好' },
  shortcutProfileFinalDraft: { 'zh-CN': 'Final Draft 风格', 'en-US': 'Final Draft Style', 'zh-TW': 'Final Draft 風格' },
  shortcutProfileChinese: { 'zh-CN': '中文写作风格', 'en-US': 'Chinese Writing Style', 'zh-TW': '中文寫作風格' },
  shortcutProfileMinimal: { 'zh-CN': '极简风格', 'en-US': 'Minimal Style', 'zh-TW': '極簡風格' },
  pressShortcut: { 'zh-CN': '按下新的快捷键', 'en-US': 'Press a new shortcut', 'zh-TW': '按下新的快捷鍵' },
  autoSaved: { 'zh-CN': '已自动保存', 'en-US': 'Auto-saved', 'zh-TW': '已自動儲存' },
  recoverAutoSave: { 'zh-CN': '恢复自动保存版本', 'en-US': 'Recover Auto-save', 'zh-TW': '恢復自動儲存版本' },
  dismiss: { 'zh-CN': '忽略', 'en-US': 'Dismiss', 'zh-TW': '忽略' },
  finalCheck: { 'zh-CN': '最终检查', 'en-US': 'Final Check', 'zh-TW': '最終檢查' },
  addAbove: { 'zh-CN': '在上方插入', 'en-US': 'Insert Above', 'zh-TW': '在上方插入' },
  addBelow: { 'zh-CN': '在下方插入', 'en-US': 'Insert Below', 'zh-TW': '在下方插入' },
  splitParagraph: { 'zh-CN': '拆分段落', 'en-US': 'Split Paragraph', 'zh-TW': '拆分段落' },
  mergePrevious: { 'zh-CN': '合并到上一段', 'en-US': 'Merge Previous', 'zh-TW': '合併到上一段' },
  moreTools: { 'zh-CN': '更多工具', 'en-US': 'More Tools', 'zh-TW': '更多工具' },
  undo: { 'zh-CN': '撤销', 'en-US': 'Undo', 'zh-TW': '復原' },
  redo: { 'zh-CN': '重做', 'en-US': 'Redo', 'zh-TW': '重做' },
  selectParagraph: { 'zh-CN': '选择段落', 'en-US': 'Select Paragraph', 'zh-TW': '選擇段落' },
  clearSelection: { 'zh-CN': '清除多选', 'en-US': 'Clear Selection', 'zh-TW': '清除多選' },
  dragParagraph: { 'zh-CN': '拖动段落', 'en-US': 'Drag Paragraph', 'zh-TW': '拖動段落' },
  autoRecovery: { 'zh-CN': '自动恢复', 'en-US': 'Auto Recovery', 'zh-TW': '自動恢復' },
  manualVersion: { 'zh-CN': '手动版本', 'en-US': 'Manual Version', 'zh-TW': '手動版本' },
  restoreScene: { 'zh-CN': '恢复当前场', 'en-US': 'Restore Current Scene', 'zh-TW': '恢復目前場' },
  selectedParagraphs: { 'zh-CN': '已选段落', 'en-US': 'Selected Paragraphs', 'zh-TW': '已選段落' },
  tutorialCenter: { 'zh-CN': '教学中心', 'en-US': 'Learning Center', 'zh-TW': '教學中心' },
  tutorialIntro: { 'zh-CN': '软件入门', 'en-US': 'App Basics', 'zh-TW': '軟體入門' },
  tutorialFormat: { 'zh-CN': '格式规范', 'en-US': 'Format Guide', 'zh-TW': '格式規範' },
  tutorialExamples: { 'zh-CN': '10 个示例', 'en-US': '10 Examples', 'zh-TW': '10 個範例' },
  lessonSteps: { 'zh-CN': '操作步骤', 'en-US': 'Steps', 'zh-TW': '操作步驟' },
  recommended: { 'zh-CN': '推荐做法', 'en-US': 'Recommended', 'zh-TW': '推薦做法' },
  avoid: { 'zh-CN': '避免这样做', 'en-US': 'Avoid', 'zh-TW': '避免這樣做' },
  exampleFocus: { 'zh-CN': '本例重点', 'en-US': 'Focus', 'zh-TW': '本例重點' },
  insertExample: { 'zh-CN': '以好莱坞格式插入当前剧本', 'en-US': 'Insert in Hollywood Format', 'zh-TW': '以好萊塢格式插入目前劇本' },
  tutorialSources: { 'zh-CN': '规范依据：Academy Nicholl、Writers Guild Foundation 与 BBC Writersroom 的公开编剧资料。行业并不存在唯一的绝对模板，交付时应同时遵循收件方要求。', 'en-US': 'Based on public screenplay guidance from Academy Nicholl, Writers Guild Foundation, and BBC Writersroom. Always follow the recipient’s requirements.', 'zh-TW': '規範依據：Academy Nicholl、Writers Guild Foundation 與 BBC Writersroom 的公開編劇資料。交付時仍應遵循收件方要求。' },
} satisfies Record<string, Record<UiLocale, string>>

function ux(locale: UiLocale, key: keyof typeof uxMessages) {
  return uxMessages[key][locale] ?? uxMessages[key]['zh-CN']
}

function App() {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => readStoredPreferences())
  const [project, setProject] = useState<ScriptProject>(() => createDefaultProject(readStoredPreferences()))
  const [uiLocale, setUiLocale] = useState<UiLocale>(() => readStoredUiLocale())
  const [productionStage, setProductionStage] = useState<ProductionStage | undefined>()
  const workspaceMode: WorkspaceMode = 'focus'
  const [filePath, setFilePath] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>(() => project.elements[0]?.id ?? '')
  const [fonts, setFonts] = useState<string[]>(commonFonts)
  const [installedFonts, setInstalledFonts] = useState<string[]>([])
  const [statusKey, setStatusKey] = useState<MessageKey>('ready')
  const [leftTab, setLeftTab] = useState<LeftTab>('outline')
  const [rightTab, setRightTab] = useState<RightTab>('format')
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [shortcutPreferencesOpen, setShortcutPreferencesOpen] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [quickJumpOpen, setQuickJumpOpen] = useState(false)
  const [quickJumpTransient, setQuickJumpTransient] = useState(false)
  const [sceneMapOpen, setSceneMapOpen] = useState(false)
  const [sceneBoardOpen, setSceneBoardOpen] = useState(false)
  const [characterArcsOpen, setCharacterArcsOpen] = useState(false)
  const [continuityOpen, setContinuityOpen] = useState(false)
  const [revisionCompareOpen, setRevisionCompareOpen] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [sidesOpen, setSidesOpen] = useState(false)
  const [departmentPackageOpen, setDepartmentPackageOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [formatPreviewOpen, setFormatPreviewOpen] = useState(false)
  const [titlePageOpen, setTitlePageOpen] = useState(false)
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [revisionMode, setRevisionMode] = useState(false)
  const [revisionColor, setRevisionColor] = useState<RevisionColor>('blue')
  const [revisionBaselineVersion, setRevisionBaselineVersion] = useState(0)
  const [pageLockReference, setPageLockReference] = useState<number>()
  const [sceneLockReference, setSceneLockReference] = useState<number>()
  const [contextMenu, setContextMenu] = useState<ContextMenuState>()
  const [autoSaveNotice, setAutoSaveNotice] = useState<AutoSaveSnapshot | undefined>(() => readAutoSaveSnapshot())
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string>()
  const [shortcutSettings, setShortcutSettings] = useState<ShortcutSettings>(() => readShortcutSettings())
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(() => new Set())
  const [draggingElementIds, setDraggingElementIds] = useState<string[]>([])
  const [recoverySnapshots, setRecoverySnapshots] = useState<VersionSnapshot[]>(() => readRecoverySnapshots())
  const [onboardingActive, setOnboardingActive] = useState(() => readOnboardingState())
  const [historyVersion, setHistoryVersion] = useState(0)
  const [fontReadyVersion, setFontReadyVersion] = useState(0)
  const composingElementIdsRef = useRef(new Set<string>())
  const pendingTextSelectionRef = useRef<PendingTextSelection | undefined>(undefined)
  const undoStackRef = useRef<ScriptProject[]>([])
  const redoStackRef = useRef<ScriptProject[]>([])
  const lastProjectRef = useRef(project)
  const applyingHistoryRef = useRef(false)
  const historyGroupRef = useRef<HistoryGroup>({ timestamp: 0 })
  const quickJumpHoldTimerRef = useRef<number | undefined>(undefined)
  const quickJumpHeldRef = useRef(false)

  const locale = uiLocale
  const status = t(locale, statusKey)
  const format = useMemo(() => getFormat(project.formatId), [project.formatId])
  const productionData = useMemo(() => synchronizeProductionData(project.elements, project.production), [project.elements, project.production])
  const deferredProject = useDeferredValue(project)
  const deferredFormat = useMemo(() => getFormat(deferredProject.formatId), [deferredProject.formatId])
  const pages = useMemo(() => paginateElements(deferredProject.elements, deferredFormat, deferredProject.fontSize), [deferredFormat, deferredProject.elements, deferredProject.fontSize])
  const exportDocument = useMemo(() => resolveExportProject(deferredProject), [deferredProject])
  const exportLayout = useMemo(() => {
    void fontReadyVersion
    return layoutScreenplay(
      exportDocument.project,
      exportDocument.format,
      createCanvasTextMeasurer(exportDocument.project, exportDocument.format),
    )
  }, [exportDocument, fontReadyVersion])
  const selectedElement = project.elements.find((element) => element.id === selectedId)
  const selectedIndex = project.elements.findIndex((element) => element.id === selectedId)
  const scenes = useMemo(() => deferredProject.elements.filter((element) => element.type === 'scene'), [deferredProject.elements])
  const characters = useMemo(() => extractCharacters(deferredProject.elements), [deferredProject.elements])
  const stats = useMemo(() => calculateStats(deferredProject.elements, pages.length), [deferredProject.elements, pages.length])
  const transitionOptions = useMemo(() => getTransitionPresetOptions(project.language, locale), [project.language, locale])
  const sceneSummaries = useMemo(() => summarizeScenes(deferredProject.elements, pages, deferredFormat, deferredProject.fontSize), [deferredFormat, deferredProject.elements, deferredProject.fontSize, pages])
  const sceneBoardCards = useMemo(() => buildSceneBoardCards(sceneSummaries, deferredProject.elements), [deferredProject.elements, sceneSummaries])
  const breakdownRows = useMemo(() => buildBreakdownRows(sceneSummaries, deferredProject.elements), [deferredProject.elements, sceneSummaries])
  const characterArcs = useMemo(() => buildCharacterArcs(deferredProject.elements, sceneSummaries), [deferredProject.elements, sceneSummaries])
  const continuityIssues = useMemo(() => buildContinuityIssues(deferredProject.elements, sceneSummaries), [deferredProject.elements, sceneSummaries])
  const projectLibrary = useMemo(() => buildProjectLibrary(deferredProject.elements), [deferredProject.elements])
  const revisionDiffs = useMemo(() => {
    void revisionBaselineVersion
    return buildRevisionDiffs(project)
  }, [project, revisionBaselineVersion])
  const reviewNotes = project.reviewNotes ?? []
  const unresolvedReviewNotes = reviewNotes.filter((note) => !note.resolved)
  const formatAudit = useMemo(
    () => auditProfessionalFormat(exportDocument.project, exportDocument.format, installedFonts, exportLayout),
    [exportDocument, exportLayout, installedFonts],
  )
  const healthReport = useMemo(() => buildHealthReport(sceneSummaries, deferredProject.elements), [deferredProject.elements, sceneSummaries])
  const revisionStates = useMemo(() => {
    void revisionBaselineVersion
    return getRevisionStates(project)
  }, [project, revisionBaselineVersion])
  const activeShortcuts = useMemo(() => mergeShortcutSettings(shortcutSettings), [shortcutSettings])
  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0

  useEffect(() => {
    window.screenplay
      ?.listFonts()
      .then((payload) => {
        const merged = Array.from(new Set([...commonFonts, ...payload.fonts])).sort((a, b) => a.localeCompare(b))
        setInstalledFonts(payload.fonts)
        setFonts(merged)
      })
      .catch(() => {
        setInstalledFonts([])
        setFonts(commonFonts)
      })
  }, [])

  useEffect(() => {
    let active = true
    void document.fonts.ready.then(() => {
      if (active) setFontReadyVersion((version) => version + 1)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => window.screenplay?.onMenuCommand(handleMenuCommand),)

  useLayoutEffect(() => {
    const element = document.querySelector<HTMLTextAreaElement>(`textarea[data-element-id="${selectedId}"]`)
    if (!element) {
      return
    }

    if (document.activeElement !== element) {
      element.focus({ preventScroll: true })
    }

    const pending = pendingTextSelectionRef.current
    if (pending?.elementId === selectedId) {
      element.setSelectionRange(pending.start, pending.end)
      pendingTextSelectionRef.current = undefined
    }
  }, [selectedId])

  useEffect(() => {
    if (!typewriterMode) {
      return
    }

    document.querySelector<HTMLElement>(`article[data-element-id="${selectedId}"]`)?.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [selectedId, typewriterMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return
      }

      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redoProject()
        } else {
          undoProject()
        }
        return
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redoProject()
        return
      }
      if (event.key === 'Escape' && selectedElementIds.size > 0) {
        event.preventDefault()
        setSelectedElementIds(new Set())
        return
      }

      const matched = getMatchedGlobalShortcut(event)
      if (matched) {
        event.preventDefault()
        if (matched === 'openQuickJump' && !event.repeat) {
          window.clearTimeout(quickJumpHoldTimerRef.current)
          quickJumpHeldRef.current = false
          quickJumpHoldTimerRef.current = window.setTimeout(() => {
            quickJumpHeldRef.current = true
            setQuickJumpTransient(true)
            setQuickJumpOpen(true)
          }, 220)
          return
        }
        runShortcut(matched)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const quickJumpShortcut = activeShortcuts.openQuickJump
      if (event.key.toLowerCase() !== quickJumpShortcut.key.toLowerCase()) {
        return
      }

      const wasPending = Boolean(quickJumpHoldTimerRef.current)
      if (!wasPending && !quickJumpHeldRef.current) {
        return
      }
      if (wasPending) {
        window.clearTimeout(quickJumpHoldTimerRef.current)
        quickJumpHoldTimerRef.current = undefined
      }
      if (quickJumpHeldRef.current) {
        quickJumpHeldRef.current = false
        setQuickJumpOpen(false)
        setQuickJumpTransient(false)
      } else {
        setQuickJumpTransient(false)
        setQuickJumpOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.clearTimeout(quickJumpHoldTimerRef.current)
    }
  })

  useEffect(() => {
    const previous = lastProjectRef.current
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false
      lastProjectRef.current = project
      historyGroupRef.current = { timestamp: 0 }
      setHistoryVersion((version) => version + 1)
      return
    }
    if (previous === project) {
      return
    }

    const now = Date.now()
    const typingElementId = detectTypingElementChange(previous, project)
    const currentGroup = historyGroupRef.current
    const continuesTypingGroup = Boolean(typingElementId && currentGroup.elementId === typingElementId && now - currentGroup.timestamp < 1200)

    if (!continuesTypingGroup) {
      undoStackRef.current = [...undoStackRef.current, previous].slice(-100)
    }
    redoStackRef.current = []
    historyGroupRef.current = { elementId: typingElementId, timestamp: now }
    lastProjectRef.current = project
    setHistoryVersion((version) => version + 1)
  }, [project])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const close = () => setContextMenu(undefined)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const snapshot: AutoSaveSnapshot = {
        savedAt: new Date().toISOString(),
        filePath,
        project: { ...project, production: productionData },
      }
      writeAutoSaveSnapshot(snapshot)
      setLastAutoSavedAt(snapshot.savedAt)
      setRecoverySnapshots((current) => {
        const latest = current[0]
        const latestTime = latest ? new Date(latest.createdAt).getTime() : 0
        if (latest && Date.now() - latestTime < 45_000) {
          return current
        }

        const recoverySnapshot = createVersionSnapshot(project, '\u81ea\u52a8\u6062\u590d')
        const next = [recoverySnapshot, ...current].slice(0, 30)
        writeRecoverySnapshots(next)
        return next
      })
    }, 1200)

    return () => window.clearTimeout(handle)
  }, [filePath, productionData, project])

  function updateProject(patch: Partial<ScriptProject>) {
    setProject((current) => ({ ...current, ...patch }))
  }

  function openProductionWorkspace(stage: ProductionStage = 'preproduction') {
    setProject((current) => ({ ...current, production: synchronizeProductionData(current.elements, current.production) }))
    setProductionStage(stage)
    setToolbarExpanded(false)
  }

  function resetHistory(nextProject: ScriptProject) {
    undoStackRef.current = []
    redoStackRef.current = []
    historyGroupRef.current = { timestamp: 0 }
    applyingHistoryRef.current = true
    lastProjectRef.current = nextProject
    setHistoryVersion((version) => version + 1)
  }

  function undoProject() {
    const previous = undoStackRef.current.pop()
    if (!previous) {
      return
    }

    redoStackRef.current = [...redoStackRef.current, project].slice(-100)
    applyingHistoryRef.current = true
    lastProjectRef.current = previous
    setProject(previous)
    setSelectedElementIds(new Set())
    setSelectedId((currentId) => (previous.elements.some((element) => element.id === currentId) ? currentId : previous.elements[0]?.id ?? ''))
    setHistoryVersion((version) => version + 1)
  }

  function redoProject() {
    const next = redoStackRef.current.pop()
    if (!next) {
      return
    }

    undoStackRef.current = [...undoStackRef.current, project].slice(-100)
    applyingHistoryRef.current = true
    lastProjectRef.current = next
    setProject(next)
    setSelectedElementIds(new Set())
    setSelectedId((currentId) => (next.elements.some((element) => element.id === currentId) ? currentId : next.elements[0]?.id ?? ''))
    setHistoryVersion((version) => version + 1)
  }

  function selectElementForEditing(elementId: string) {
    setSelectedId(elementId)
  }

  function toggleElementSelection(elementId: string, extendRange = false) {
    setSelectedElementIds((current) => {
      if (extendRange && selectedId) {
        const anchor = project.elements.findIndex((element) => element.id === selectedId)
        const target = project.elements.findIndex((element) => element.id === elementId)
        if (anchor >= 0 && target >= 0) {
          const start = Math.min(anchor, target)
          const end = Math.max(anchor, target)
          return new Set(project.elements.slice(start, end + 1).map((element) => element.id))
        }
      }

      const next = new Set(current)
      if (next.has(elementId)) {
        next.delete(elementId)
      } else {
        next.add(elementId)
      }
      return next
    })
    setSelectedId(elementId)
  }

  function updateUiLocale(nextLocale: UiLocale) {
    const lockedLocale = nextLocale === 'zh-CN' ? nextLocale : 'zh-CN'
    setUiLocale(lockedLocale)
    localStorage.setItem(uiLocaleStorageKey, lockedLocale)
  }

  function updatePreferences(patch: Partial<UserPreferences>) {
    setPreferencesState((current) => {
      const next = normalizePreferences({ ...current, ...patch })
      writeStoredPreferences(next)
      return next
    })
  }

  function resetPreferences() {
    setPreferencesState(defaultPreferences)
    writeStoredPreferences(defaultPreferences)
  }

  function applyPreferencesToCurrentProject(nextPreferences = preferences) {
    const nextFormat = getFormat(nextPreferences.defaultFormatId)
    updateProject({
      language: nextPreferences.scriptLanguage,
      formatId: nextFormat.id,
      pageSize: nextFormat.page.kind,
      fontFamily: nextPreferences.defaultFontFamily,
      fontSize: nextPreferences.defaultFontSize,
    })
  }

  function updateShortcutSettings(nextSettings: ShortcutSettings) {
    setShortcutSettings(nextSettings)
    writeShortcutSettings(nextSettings)
  }

  function recoverAutoSave(snapshot: AutoSaveSnapshot) {
    const recovered = normalizeProjectLanguage(snapshot.project)
    resetHistory(recovered)
    setProject(recovered)
    setFilePath(snapshot.filePath)
    setSelectedId(recovered.elements[0]?.id ?? '')
    setAutoSaveNotice(undefined)
    setStatusKey('ready')
  }

  function dismissAutoSaveNotice() {
    setAutoSaveNotice(undefined)
  }

  function openFormatPreview() {
    setFormatPreviewOpen(true)
  }

  function openAssistDestination(open: () => void) {
    setAssistOpen(false)
    open()
  }

  function openToolbarDestination(open: () => void) {
    setToolbarExpanded(false)
    open()
  }

  function applyProfessionalFormat() {
    const exportSettings = resolveExportSettings(project)
    const profiled = resolveExportProject({ ...project, exportSettings })
    updateProject({
      formatId: 'hollywood',
      pageSize: profiled.format.page.kind,
      fontFamily: profiled.project.fontFamily,
      fontSize: profiled.project.fontSize,
      exportSettings,
      titlePage: project.titlePage ?? createDefaultTitlePage(project),
      elements: normalizeProfessionalTerms(project.elements, preferences.termStyle, project.language),
    })
    setStatusKey('assistiveDone')
    return ux(locale, 'formatFixApplied')
  }

  function updateExportSettings(patch: Partial<ExportSettings>) {
    updateProject({ exportSettings: { ...resolveExportSettings(project), ...patch } })
  }

  function selectExportProfile(profileId: ExportProfileId) {
    updateProject({ exportSettings: applyExportProfile(profileId) })
  }

  function updateTitlePage(patch: Partial<TitlePageData>) {
    updateProject({ titlePage: { ...(project.titlePage ?? createDefaultTitlePage(project)), ...patch } })
  }

  function toggleDualDialogue() {
    const selectedGroups = new Set(
      project.elements
        .filter((element) => selectedElementIds.has(element.id) && element.dualDialogue)
        .map((element) => element.dualDialogue?.groupId)
        .filter((value): value is string => Boolean(value)),
    )
    if (selectedGroups.size > 0) {
      updateProject({
        elements: project.elements.map((element) =>
          element.dualDialogue && selectedGroups.has(element.dualDialogue.groupId) ? { ...element, dualDialogue: undefined } : element,
        ),
      })
      setStatusKey('assistiveDone')
      return
    }

    const ranges = getDialogueBlockRanges(project.elements).filter((range) => range.ids.some((id) => selectedElementIds.has(id)))
    if (ranges.length !== 2) {
      window.alert('请先多选两组完整对白中的任意段落，再点击“双栏对白”。')
      return
    }

    const groupId = createLocalId()
    const leftIds = new Set(ranges[0].ids)
    const rightIds = new Set(ranges[1].ids)
    updateProject({
      elements: project.elements.map((element) => {
        if (leftIds.has(element.id)) return { ...element, dualDialogue: { groupId, side: 'left' as const } }
        if (rightIds.has(element.id)) return { ...element, dualDialogue: { groupId, side: 'right' as const } }
        return element
      }),
    })
    setSelectedElementIds(new Set([...leftIds, ...rightIds]))
    setStatusKey('assistiveDone')
  }

  function saveRevisionBaseline() {
    writeRevisionSnapshot(project)
    setPageLockReference(pages.length)
    setSceneLockReference(scenes.length)
    setRevisionMode(true)
    setRevisionBaselineVersion((version) => version + 1)
    return `\u5df2\u4fdd\u5b58\u4fee\u8ba2\u57fa\u51c6\uff1a${project.elements.length} \u6bb5\uff0c${pages.length} \u9875\uff0c${scenes.length} \u573a\u3002`
  }

  function setSelectedElementType(type: ScriptElementType) {
    if (selectedElementIds.size > 0) {
      setProject((current) => ({
        ...current,
        elements: current.elements.map((element) =>
          selectedElementIds.has(element.id) ? { ...element, type, text: element.text || getDefaultElementText(type, preferences) } : element,
        ),
      }))
      return
    }

    if (selectedElement) {
      updateElement(selectedElement.id, { type, text: selectedElement.text || getDefaultElementText(type, preferences) })
      return
    }

    addElement(type)
  }

  function updateElement(id: string, patch: Partial<ScriptElement>) {
    setProject((current) => ({
      ...current,
      elements: current.elements.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    }))
  }

  function addElement(type: ScriptElementType = selectedElement?.type ?? 'action', afterId = selectedId) {
    setProject((current) => {
      const text = type === 'scene' && current.productionLock?.enabled ? buildLockedSceneHeading(current.elements, afterId, preferences) : getDefaultElementText(type, preferences)
      const element = createElement(type, text)
      const index = current.elements.findIndex((item) => item.id === afterId)
      const insertAt = index >= 0 ? index + 1 : current.elements.length
      const elements = [...current.elements]
      elements.splice(insertAt, 0, element)
      setSelectedId(element.id)
      return { ...current, elements }
    })
  }

  function insertTutorialExample(example: HollywoodExample) {
    const inserted = example.elements.map((element) => createElement(element.type, element.text))
    setProject((current) => {
      const selectedIndex = current.elements.findIndex((element) => element.id === selectedId)
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : current.elements.length
      const elements = [...current.elements]
      elements.splice(insertAt, 0, ...inserted)
      return {
        ...current,
        formatId: 'hollywood',
        pageSize: 'letter',
        fontFamily: 'Courier Prime',
        fontSize: 12,
        elements,
      }
    })
    setSelectedId(inserted[0]?.id ?? selectedId)
    setSelectedElementIds(new Set())
    setTutorialOpen(false)
    setStatusKey('ready')
  }

  function addElementBefore(type: ScriptElementType = selectedElement?.type ?? 'action', beforeId = selectedId) {
    setProject((current) => {
      const text = type === 'scene' && current.productionLock?.enabled ? buildLockedSceneHeading(current.elements, beforeId, preferences) : getDefaultElementText(type, preferences)
      const element = createElement(type, text)
      const index = current.elements.findIndex((item) => item.id === beforeId)
      const insertAt = index >= 0 ? index : 0
      const elements = [...current.elements]
      elements.splice(insertAt, 0, element)
      setSelectedId(element.id)
      return { ...current, elements }
    })
  }

  function openElementContextMenu(event: ReactMouseEvent<HTMLElement>, elementId: string) {
    event.preventDefault()
    setSelectedId(elementId)
    setContextMenu({
      elementId,
      x: Math.min(event.clientX, window.innerWidth - 260),
      y: Math.min(event.clientY, window.innerHeight - 360),
    })
  }

  function getMatchedGlobalShortcut(event: KeyboardEvent): ShortcutId | undefined {
    const globalShortcuts: ShortcutId[] = [
      'newProject',
      'openProject',
      'saveProject',
      'saveProjectAs',
      'openPreferences',
      'openShortcutPreferences',
      'openAssistiveTools',
      'openCommandPalette',
      'openQuickJump',
      'openSceneMap',
      'openProjectHealth',
      'openProfessionalPreview',
      'toggleTypewriterMode',
      'toggleRevisionMode',
      'exportPdf',
      'addNextParagraph',
      'addNextScene',
      'deleteParagraph',
      'deleteSceneBlock',
      'moveParagraphUp',
      'moveParagraphDown',
      'focusPreviousParagraph',
      'focusNextParagraph',
    ]

    return globalShortcuts.find((shortcutId) => matchesShortcut(event, activeShortcuts[shortcutId]))
  }

  function runShortcut(shortcutId: ShortcutId) {
    switch (shortcutId) {
      case 'newProject':
        newProject()
        break
      case 'openProject':
        void openProject()
        break
      case 'saveProject':
        void saveProject(false)
        break
      case 'saveProjectAs':
        void saveProject(true)
        break
      case 'openPreferences':
        setPreferencesOpen(true)
        break
      case 'openShortcutPreferences':
        setShortcutPreferencesOpen(true)
        break
      case 'openAssistiveTools':
        setAssistOpen(true)
        break
      case 'openCommandPalette':
        setCommandOpen(true)
        break
      case 'openQuickJump':
        setQuickJumpOpen(true)
        break
      case 'openSceneMap':
        setSceneMapOpen(true)
        break
      case 'openProjectHealth':
        setHealthOpen(true)
        break
      case 'openProfessionalPreview':
        openFormatPreview()
        break
      case 'toggleTypewriterMode':
        setTypewriterMode((value) => !value)
        break
      case 'toggleRevisionMode':
        setRevisionMode((value) => !value)
        break
      case 'exportPdf':
        openFormatPreview()
        break
      case 'addNextParagraph':
        addElement(selectedElement ? getNextElementType(selectedElement) : 'action', selectedId)
        break
      case 'addNextScene':
        addElement('scene', selectedId)
        break
      case 'deleteParagraph':
        deleteElement(selectedId)
        break
      case 'deleteSceneBlock':
        deleteCurrentSceneBlock()
        break
      case 'moveParagraphUp':
        moveElement(selectedId, -1)
        break
      case 'moveParagraphDown':
        moveElement(selectedId, 1)
        break
      case 'focusPreviousParagraph':
        focusRelativeElement(-1)
        break
      case 'focusNextParagraph':
        focusRelativeElement(1)
        break
      default:
        break
    }
  }

  function applyTransitionPreset(text: string) {
    if (!selectedElement || !text) {
      return
    }

    updateElement(selectedElement.id, { type: 'transition', text })
  }

  function applySelectedSceneHeading(patch: Partial<{ place: ScenePlaceId; time: SceneTimeId; style: TermStyle }>) {
    if (!selectedElement || selectedElement.type !== 'scene') {
      return
    }

    const parsed = parseSceneHeading(selectedElement.text)
    updateElement(selectedElement.id, {
      type: 'scene',
      text: buildSceneHeading({
        style: patch.style ?? preferences.termStyle,
        place: patch.place ?? parsed.place,
        location: parsed.location,
        time: patch.time ?? parsed.time,
      }),
    })
  }

  function updateElementTextSmart(element: ScriptElement, text: string, detectType = true) {
    const detectedType = detectType ? detectSmartElementType(text, element.type) : element.type
    updateElement(element.id, { text, type: detectedType })
    if (onboardingActive) {
      setOnboardingActive(false)
      writeOnboardingState()
    }
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>, element: ScriptElement) {
    if (event.nativeEvent.isComposing || composingElementIdsRef.current.has(element.id)) {
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const nextType = cycleElementType(element.type, event.shiftKey ? -1 : 1)
      updateElement(element.id, { type: nextType, text: element.text || getDefaultElementText(nextType, preferences) })
      return
    }

    if (matchesShortcut(event.nativeEvent, activeShortcuts.deleteSceneBlock)) {
      event.preventDefault()
      deleteCurrentSceneBlock()
      return
    }

    if (matchesShortcut(event.nativeEvent, activeShortcuts.deleteParagraph)) {
      event.preventDefault()
      deleteElement(element.id)
      return
    }

    const selectionStart = event.currentTarget.selectionStart
    const selectionEnd = event.currentTarget.selectionEnd

    if ((event.key === 'Backspace' || event.key === 'Delete') && element.text.trim().length === 0 && project.elements.length > 1) {
      event.preventDefault()
      deleteElement(element.id, event.key === 'Delete' ? 'next' : 'previous')
      return
    }

    if (event.key === 'Backspace' && selectionStart === 0 && selectionEnd === 0 && canMergeWithPrevious(element.id)) {
      event.preventDefault()
      mergeElementWithPrevious(element.id)
      return
    }

    if (event.key === 'Delete' && selectionStart === element.text.length && selectionEnd === element.text.length && canMergeWithNext(element.id)) {
      event.preventDefault()
      mergeElementWithNext(element.id)
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      splitOrAdvanceElement(element, selectionStart, selectionEnd)
    }
  }

  function handleElementBlur(element: ScriptElement) {
    if (element.type !== 'character') {
      return
    }

    const normalized = normalizeCharacterCue(element.text)
    if (normalized && normalized !== element.text) {
      const existing = characters.find((character) => normalizeEntityKey(character.name) === normalizeEntityKey(normalized))
      updateElement(element.id, { text: existing?.name ?? normalized })
    }
  }

  function splitOrAdvanceElement(element: ScriptElement, selectionStart: number, selectionEnd: number) {
    setProject((current) => {
      const index = current.elements.findIndex((item) => item.id === element.id)
      if (index < 0) {
        return current
      }

      const currentElement = current.elements[index]
      const before = currentElement.text.slice(0, selectionStart)
      const after = currentElement.text.slice(selectionEnd)
      const hasTail = after.trim().length > 0
      const nextType = hasTail ? currentElement.type : getNextElementType(currentElement)
      const nextText = hasTail ? after.trimStart() : getDefaultElementText(nextType, preferences)
      const nextElement = createElement(nextType, nextText)
      const elements = [...current.elements]
      elements.splice(index, 1, { ...currentElement, text: before.trimEnd() }, nextElement)
      pendingTextSelectionRef.current = { elementId: nextElement.id, start: 0, end: 0 }
      setSelectedId(nextElement.id)
      return { ...current, elements }
    })
  }

  function splitElementAtCursor(elementId: string) {
    const element = project.elements.find((item) => item.id === elementId)
    const textarea = document.querySelector<HTMLTextAreaElement>(`textarea[data-element-id="${elementId}"]`)
    if (!element) {
      return
    }
    const cursor = textarea?.selectionStart ?? Math.ceil(element.text.length / 2)
    splitOrAdvanceElement(element, cursor, textarea?.selectionEnd ?? cursor)
  }

  function canMergeWithPrevious(elementId: string) {
    const index = project.elements.findIndex((element) => element.id === elementId)
    const previous = project.elements[index - 1]
    const current = project.elements[index]
    return Boolean(previous && current && current.type !== 'scene' && previous.type !== 'scene')
  }

  function canMergeWithNext(elementId: string) {
    const index = project.elements.findIndex((element) => element.id === elementId)
    const next = project.elements[index + 1]
    const current = project.elements[index]
    return Boolean(next && current && current.type !== 'scene' && next.type !== 'scene')
  }

  function mergeElementWithPrevious(elementId: string) {
    mergeElementWithNeighbor(elementId, -1)
  }

  function mergeElementWithNext(elementId: string) {
    mergeElementWithNeighbor(elementId, 1)
  }

  function mergeElementWithNeighbor(elementId: string, direction: -1 | 1) {
    setProject((current) => {
      const index = current.elements.findIndex((element) => element.id === elementId)
      const neighborIndex = index + direction
      const currentElement = current.elements[index]
      const neighbor = current.elements[neighborIndex]
      if (!currentElement || !neighbor || currentElement.type === 'scene' || neighbor.type === 'scene') {
        return current
      }

      const mergedText = direction === -1 ? joinParagraphText(neighbor.text, currentElement.text) : joinParagraphText(currentElement.text, neighbor.text)
      const keepIndex = direction === -1 ? neighborIndex : index
      const keepId = direction === -1 ? neighbor.id : currentElement.id
      const removeId = direction === -1 ? currentElement.id : neighbor.id
      const elements = current.elements
        .map((element, itemIndex) => (itemIndex === keepIndex ? { ...element, text: mergedText } : element))
        .filter((_, itemIndex) => itemIndex !== (direction === -1 ? index : neighborIndex))
      const caret = direction === -1 ? joinParagraphText(neighbor.text, '').length + (neighbor.text.trim() && currentElement.text.trim() ? 1 : 0) : currentElement.text.length
      pendingTextSelectionRef.current = { elementId: keepId, start: caret, end: caret }
      setSelectedId(elements[Math.min(keepIndex, elements.length - 1)]?.id ?? '')
      return { ...current, elements, reviewNotes: current.reviewNotes?.map((note) => (note.elementId === removeId ? { ...note, elementId: keepId } : note)) }
    })
  }

  function deleteElement(id: string, focus: 'previous' | 'next' = 'previous') {
    setProject((current) => {
      const index = current.elements.findIndex((element) => element.id === id)
      if (index < 0) {
        return current
      }

      if (current.elements.length <= 1) {
        setSelectedId(id)
        return { ...current, elements: current.elements.map((element) => (element.id === id ? { ...element, text: '' } : element)) }
      }

      const elements = current.elements.filter((element) => element.id !== id)
      const nextIndex = focus === 'next' ? Math.min(index, elements.length - 1) : Math.max(0, index - 1)
      const nextElement = elements[nextIndex] ?? elements[0]
      if (nextElement) {
        const caret = focus === 'next' ? 0 : nextElement.text.length
        pendingTextSelectionRef.current = { elementId: nextElement.id, start: caret, end: caret }
      }
      setSelectedId(nextElement?.id ?? '')
      return { ...current, elements, reviewNotes: current.reviewNotes?.filter((note) => note.elementId !== id) }
    })
  }

  function deleteSelectedElements() {
    const ids = new Set(selectedElementIds)
    if (ids.size === 0) {
      deleteElement(selectedId)
      return
    }

    setProject((current) => {
      const firstIndex = current.elements.findIndex((element) => ids.has(element.id))
      let elements = current.elements.filter((element) => !ids.has(element.id))
      if (elements.length === 0) {
        elements = [createElement('action', '')]
      }
      const target = elements[Math.max(0, Math.min(firstIndex - 1, elements.length - 1))] ?? elements[0]
      pendingTextSelectionRef.current = { elementId: target.id, start: target.text.length, end: target.text.length }
      setSelectedId(target.id)
      return { ...current, elements, reviewNotes: current.reviewNotes?.filter((note) => !ids.has(note.elementId)) }
    })
    setSelectedElementIds(new Set())
  }

  function deleteCurrentSceneBlock() {
    setProject((current) => {
      const selectedIndexInCurrent = current.elements.findIndex((element) => element.id === selectedId)
      if (selectedIndexInCurrent < 0) {
        return current
      }

      const blocks = getSceneBlocks(current.elements)
      const block = blocks.find((item) => selectedIndexInCurrent >= item.start && selectedIndexInCurrent < item.end)
      if (!block) {
        if (current.elements.length <= 1) {
          return { ...current, elements: current.elements.map((element) => (element.id === selectedId ? { ...element, text: '' } : element)) }
        }

        const elements = current.elements.filter((element) => element.id !== selectedId)
        setSelectedId(elements[Math.max(0, selectedIndexInCurrent - 1)]?.id ?? elements[0]?.id ?? '')
        return { ...current, elements, reviewNotes: current.reviewNotes?.filter((note) => note.elementId !== selectedId) }
      }

      const elements = current.elements.filter((_, index) => index < block.start || index >= block.end)
      const removedIds = new Set(block.elements.map((element) => element.id))
      if (elements.length === 0) {
        const blank = createElement('scene', buildSceneHeading({ style: preferences.termStyle, place: preferences.defaultScenePlace, location: '\u5730\u70b9', time: preferences.defaultSceneTime }))
        setSelectedId(blank.id)
        return { ...current, elements: [blank], reviewNotes: current.reviewNotes?.filter((note) => !removedIds.has(note.elementId)) }
      }

      setSelectedId(elements[Math.min(block.start, elements.length - 1)]?.id ?? elements[0].id)
      return { ...current, elements, reviewNotes: current.reviewNotes?.filter((note) => !removedIds.has(note.elementId)) }
    })
  }

  function focusRelativeElement(direction: -1 | 1) {
    const index = project.elements.findIndex((element) => element.id === selectedId)
    if (index < 0) {
      setSelectedId(project.elements[0]?.id ?? '')
      return
    }

    const target = project.elements[Math.min(project.elements.length - 1, Math.max(0, index + direction))]
    if (target) {
      setSelectedId(target.id)
    }
  }

  function moveElement(id: string, direction: -1 | 1) {
    if (selectedElementIds.size > 1 && selectedElementIds.has(id)) {
      moveSelectedElements(direction)
      return
    }

    setProject((current) => {
      const index = current.elements.findIndex((element) => element.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.elements.length) {
        return current
      }

      const elements = [...current.elements]
      const [element] = elements.splice(index, 1)
      elements.splice(target, 0, element)
      return { ...current, elements }
    })
  }

  function moveSelectedElements(direction: -1 | 1) {
    setProject((current) => {
      const selectedIndices = current.elements.map((element, index) => (selectedElementIds.has(element.id) ? index : -1)).filter((index) => index >= 0)
      if (selectedIndices.length === 0) {
        return current
      }
      const boundary = direction === -1 ? Math.min(...selectedIndices) : Math.max(...selectedIndices)
      const swapIndex = boundary + direction
      if (swapIndex < 0 || swapIndex >= current.elements.length || selectedElementIds.has(current.elements[swapIndex].id)) {
        return current
      }

      const elements = [...current.elements]
      const adjacent = elements.splice(swapIndex, 1)[0]
      const insertAt = direction === -1 ? Math.max(...selectedIndices) : Math.min(...selectedIndices)
      elements.splice(insertAt, 0, adjacent)
      return { ...current, elements }
    })
  }

  function beginElementDrag(event: ReactDragEvent<HTMLButtonElement>, elementId: string) {
    const ids = selectedElementIds.has(elementId)
      ? project.elements.filter((element) => selectedElementIds.has(element.id)).map((element) => element.id)
      : [elementId]
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', elementId)
    setDraggingElementIds(ids)
    if (!selectedElementIds.has(elementId)) {
      setSelectedElementIds(new Set([elementId]))
    }
  }

  function dropElements(event: ReactDragEvent<HTMLElement>, targetId: string) {
    event.preventDefault()
    const movingIds = new Set(draggingElementIds)
    if (movingIds.size === 0 || movingIds.has(targetId)) {
      setDraggingElementIds([])
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const placeAfter = event.clientY > bounds.top + bounds.height / 2
    setProject((current) => {
      const moving = current.elements.filter((element) => movingIds.has(element.id))
      const targetIndex = current.elements.findIndex((element) => element.id === targetId)
      if (moving.length === 0 || targetIndex < 0) {
        return current
      }

      const removedBeforeTarget = current.elements.slice(0, targetIndex).filter((element) => movingIds.has(element.id)).length
      const remaining = current.elements.filter((element) => !movingIds.has(element.id))
      const insertAt = Math.max(0, Math.min(targetIndex - removedBeforeTarget + (placeAfter ? 1 : 0), remaining.length))
      remaining.splice(insertAt, 0, ...moving)
      return { ...current, elements: remaining }
    })
    setSelectedId(draggingElementIds[0] ?? targetId)
    setDraggingElementIds([])
  }

  function handleFormatChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextFormat = getFormat(event.target.value as ScriptFormatId)
    updateProject({
      formatId: nextFormat.id,
      pageSize: nextFormat.page.kind,
      fontFamily: project.fontFamily || nextFormat.defaultFont,
      fontSize: project.fontSize || nextFormat.defaultFontSize,
    })
  }

  function newProject() {
    const fresh = createDefaultProject(preferences)
    resetHistory(fresh)
    setProject(fresh)
    setFilePath(undefined)
    setSelectedId(fresh.elements[0]?.id ?? '')
    setSelectedElementIds(new Set())
    setAutoSaveNotice(undefined)
    setProductionStage(undefined)
    setStatusKey('ready')
  }

  async function openProject() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.openTextFile([
      { name: 'Script Project', extensions: ['ssproj', 'json'] },
      { name: 'Final Draft XML', extensions: ['fdx'] },
    ])

    if (result.canceled || !result.content) {
      return
    }

    const isFdx = result.filePath?.toLowerCase().endsWith('.fdx')
    const openedProject = normalizeProjectLanguage(isFdx ? parseFdx(result.content) : (JSON.parse(result.content) as ScriptProject))
    resetHistory(openedProject)
    setProject(openedProject)
    setFilePath(isFdx ? undefined : result.filePath)
    setSelectedId(openedProject.elements[0]?.id ?? '')
    setSelectedElementIds(new Set())
    setAutoSaveNotice(undefined)
    setProductionStage(undefined)
    setStatusKey('ready')
  }

  async function saveProject(forcePicker = false) {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.saveTextFile({
      content: JSON.stringify({ ...project, production: productionData }, null, 2),
      filePath: forcePicker ? undefined : filePath,
      suggestedName: `${safeFileName(project.title)}.ssproj`,
      filters: [{ name: 'Script Project', extensions: ['ssproj'] }],
    })

    if (!result.canceled) {
      setFilePath(result.filePath)
      setStatusKey('saved')
    }
  }

  async function importFdx() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.openTextFile([{ name: 'Final Draft XML', extensions: ['fdx'] }])
    if (result.canceled || !result.content) {
      return
    }

    const imported = parseFdx(result.content)
    resetHistory(imported)
    setProject(imported)
    setFilePath(undefined)
    setSelectedId(imported.elements[0]?.id ?? '')
    setSelectedElementIds(new Set())
    setAutoSaveNotice(undefined)
    setProductionStage(undefined)
    setStatusKey('fdxImported')
  }

  async function importWordTxt() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return t(locale, 'fileUnavailable')
    }

    const result = await api.openTextFile([
      { name: 'Documents (DOCX/TXT/PDF/Fountain/Markdown/SRT)', extensions: ['docx', 'txt', 'pdf', 'fountain', 'md', 'markdown', 'srt'] },
      { name: 'Word DOCX', extensions: ['docx'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'Fountain / Markdown / SRT', extensions: ['fountain', 'md', 'markdown', 'srt'] },
    ])

    if (result.canceled || !result.content) {
      return '\u5df2\u53d6\u6d88\u5bfc\u5165'
    }

    const elements = parsePlainTextScript(result.content)
    const fresh = createDefaultProject({ ...preferences, defaultFormatId: 'hollywood' })
    const importedProject: ScriptProject = {
      ...fresh,
      title: result.filePath ? getFileTitle(result.filePath) : fresh.title,
      formatId: 'hollywood',
      pageSize: 'letter',
      elements: elements.length > 0 ? elements : fresh.elements,
    }

    resetHistory(importedProject)
    setProject(importedProject)
    setFilePath(undefined)
    setSelectedId(importedProject.elements[0]?.id ?? '')
    setSelectedElementIds(new Set())
    setAutoSaveNotice(undefined)
    setStatusKey('wordTxtImported')
    return `已识别为好莱坞格式：${countByType(importedProject.elements, 'scene')} 场，${countUniqueCharacters(importedProject.elements)} 个角色，${importedProject.elements.length} 个剧本段落。`
  }

  function applyCorrectionPairs(source: string) {
    const pairs = parseCorrectionPairs(source)
    if (pairs.length === 0) {
      return '未找到有效替换规则。请每行填写一组，例如：旧词=新词。'
    }

    const result = replaceElements(project.elements, pairs)
    if (result.count === 0) {
      return '未找到匹配文字。'
    }

    updateProject({ elements: result.elements })
    setStatusKey('assistiveDone')
    return `已完成 ${result.count} 处统一修正。`
  }

  function replaceAllText(findText: string, replacement: string) {
    if (!findText) {
      return '请先填写要查找的文字。'
    }

    const result = replaceElements(project.elements, [{ from: findText, to: replacement }])
    if (result.count === 0) {
      return '未找到匹配文字。'
    }

    updateProject({ elements: result.elements })
    setStatusKey('assistiveDone')
    return `已替换 ${result.count} 处：${findText} -> ${replacement}`
  }

  function summarizeCharacters() {
    const list = extractCharacters(project.elements)
    if (list.length === 0) {
      return '未识别到角色段落。'
    }

    return [`角色总数：${list.length}`, ...list.map((item, index) => `${index + 1}. ${item.name}：出场提示 ${item.count} 次`)].join('\n')
  }

  function renumberScenes() {
    let sceneNumber = 0
    const elements = project.elements.map((element) => {
      if (element.type !== 'scene') {
        return element
      }

      sceneNumber += 1
      return { ...element, text: `${sceneNumber}. ${stripSceneNumber(element.text)}` }
    })

    if (sceneNumber === 0) {
      return '未识别到场景标题。'
    }

    updateProject({ elements })
    setStatusKey('assistiveDone')
    return `已为 ${sceneNumber} 场添加场序。`
  }

  function clearSceneNumbers() {
    let sceneNumber = 0
    const elements = project.elements.map((element) => {
      if (element.type !== 'scene') {
        return element
      }

      sceneNumber += 1
      return { ...element, text: stripSceneNumber(element.text) }
    })

    if (sceneNumber === 0) {
      return '未识别到场景标题。'
    }

    updateProject({ elements })
    setStatusKey('assistiveDone')
    return `已清除 ${sceneNumber} 场的场序。`
  }

  function runScriptDoctor() {
    return buildScriptDoctorReport(project)
  }

  function convertProjectTerms(style: TermStyle) {
    const language = style as AppLocale
    const elements = project.elements.map((element) => {
      if (element.type === 'scene') {
        return { ...element, text: convertSceneHeadingText(element.text, style) }
      }

      if (element.type === 'transition') {
        return { ...element, text: convertTransitionText(element.text, language) }
      }

      return element
    })

    updateProject({ elements, language })
    updatePreferences({ termStyle: style, scriptLanguage: language })
    setStatusKey('assistiveDone')
    return `已将场景和转场术语转换为${termStyleOptions.find((item) => item.id === style)?.label ?? style}。`
  }

  function buildCurrentProductionReport() {
    return buildProductionReport(project)
  }

  function lockProduction() {
    const sceneNumbers = Object.fromEntries(scenes.map((scene, index) => [scene.id, String(index + 1)]))
    const lock = {
      enabled: true,
      pages: exportLayout.pages.length,
      scenes: scenes.length,
      lockedAt: new Date().toISOString(),
      pageLabels: exportLayout.pages.map((page) => page.label),
      sceneNumbers,
    }
    updateProject({ productionLock: lock })
    setPageLockReference(lock.pages)
    setSceneLockReference(lock.scenes)
    setRevisionMode(true)
    return `\u5df2\u9501\u5b9a\u5236\u7247\u57fa\u51c6\uff1a${lock.pages} \u9875\uff0c${lock.scenes} \u573a\u3002\u65b0\u589e\u573a\u6b21\u5c06\u4f7f\u7528 A/B \u573a\u5e8f\u3002`
  }

  function unlockProduction() {
    updateProject({ productionLock: undefined })
    return '\u5df2\u89e3\u9664\u5236\u7247\u9501\u5b9a\u3002'
  }

  function saveRevisionSnapshot() {
    return saveRevisionBaseline()
  }

  function compareRevisionSnapshot() {
    return compareRevisionSnapshotWithProject(project)
  }

  function jumpToElement(id: string) {
    setSelectedId(id)
    setAssistOpen(false)
  }

  function moveSceneBlock(sceneId: string, direction: -1 | 1) {
    setProject((current) => {
      const blocks = getSceneBlocks(current.elements)
      const blockIndex = blocks.findIndex((block) => block.scene.id === sceneId)
      const targetIndex = blockIndex + direction
      if (blockIndex < 0 || targetIndex < 0 || targetIndex >= blocks.length) {
        return current
      }

      const nextBlocks = [...blocks]
      const [block] = nextBlocks.splice(blockIndex, 1)
      nextBlocks.splice(targetIndex, 0, block)
      const prefix = current.elements.slice(0, blocks[0]?.start ?? 0)
      const elements = [...prefix, ...nextBlocks.flatMap((blockItem) => blockItem.elements)]
      return { ...current, elements }
    })
  }

  function moveSceneBlockTo(sceneId: string, targetSceneId: string) {
    if (sceneId === targetSceneId) {
      return
    }

    setProject((current) => {
      const blocks = getSceneBlocks(current.elements)
      const from = blocks.findIndex((block) => block.scene.id === sceneId)
      const to = blocks.findIndex((block) => block.scene.id === targetSceneId)
      if (from < 0 || to < 0) {
        return current
      }

      const nextBlocks = [...blocks]
      const [block] = nextBlocks.splice(from, 1)
      nextBlocks.splice(to, 0, block)
      const prefix = current.elements.slice(0, blocks[0]?.start ?? 0)
      return { ...current, elements: [...prefix, ...nextBlocks.flatMap((item) => item.elements)] }
    })
  }

  async function exportFdx() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.saveTextFile({
      content: buildFdx(project),
      suggestedName: `${safeFileName(project.title)}.fdx`,
      filters: [{ name: 'Final Draft XML', extensions: ['fdx'] }],
    })

    if (!result.canceled) {
      setStatusKey('exported')
    }
  }

  async function exportTextFile(content: string, suggestedName: string, filterName: string, extension: string) {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.saveTextFile({
      content,
      suggestedName,
      filters: [{ name: filterName, extensions: [extension] }],
    })

    if (!result.canceled) {
      setStatusKey('exported')
    }
  }

  async function exportProductionFile(content: string, suggestedName: string, kind: 'csv' | 'ale' | 'edl' | 'markdown') {
    const extension = kind === 'markdown' ? 'md' : kind
    const filterName = kind === 'csv' ? 'CSV' : kind === 'ale' ? 'Avid Log Exchange' : kind === 'edl' ? 'Edit Decision List' : 'Markdown'
    await exportTextFile(content, safeFileName(suggestedName), filterName, extension)
  }

  async function exportSceneOutline() {
    await exportTextFile(buildSceneOutlineMarkdown(project, sceneBoardCards), `${safeFileName(project.title)}_scene_outline.md`, 'Markdown', 'md')
  }

  async function exportBreakdownCsv() {
    await exportTextFile(buildBreakdownCsv(breakdownRows), `${safeFileName(project.title)}_shooting_breakdown.csv`, 'CSV', 'csv')
  }

  async function exportFountain() {
    await exportTextFile(buildFountain(project), `${safeFileName(project.title)}.fountain`, 'Fountain', 'fountain')
  }

  async function exportMarkdown() {
    await exportTextFile(buildMarkdown(project), `${safeFileName(project.title)}.md`, 'Markdown', 'md')
  }

  async function exportSeriesBible() {
    await exportTextFile(buildSeriesBible(project, projectLibrary), `${safeFileName(project.series?.title ?? project.title)}_series_bible.md`, 'Markdown', 'md')
  }

  function addCurrentEpisode() {
    const episode = createEpisodeRecord(project, pages.length, scenes.length, characters.map((character) => character.name))
    const currentSeries = project.series ?? { title: project.title, episodes: [] }
    const episodes = [...currentSeries.episodes.filter((item) => item.title !== episode.title), episode]
    updateProject({ series: { title: currentSeries.title, episodes } })
    setStatusKey('assistiveDone')
  }

  function renameEntityEverywhere(from: string, to: string) {
    if (!from.trim() || !to.trim()) {
      return
    }

    const result = replaceElements(project.elements, [{ from, to }])
    updateProject({ elements: result.elements })
    setStatusKey('assistiveDone')
  }

  function addReviewNote(elementId: string, text: string, category: ReviewNoteCategory) {
    const cleanText = text.trim()
    if (!cleanText) {
      return
    }

    const note: ReviewNote = {
      id: createLocalId(),
      elementId,
      author: '本机审稿',
      category,
      text: cleanText,
      resolved: false,
      createdAt: new Date().toISOString(),
    }
    updateProject({ reviewNotes: [note, ...(project.reviewNotes ?? [])] })
    setStatusKey('assistiveDone')
  }

  function toggleReviewNote(noteId: string) {
    updateProject({ reviewNotes: reviewNotes.map((note) => (note.id === noteId ? { ...note, resolved: !note.resolved } : note)) })
  }

  function deleteReviewNote(noteId: string) {
    updateProject({ reviewNotes: reviewNotes.filter((note) => note.id !== noteId) })
  }

  async function exportReviewPdf(watermark = '审稿版') {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.exportPdf({
      html: await buildPrintHtml(project, format, { watermark: watermark.trim() || '审稿版' }),
      suggestedName: `${safeFileName(project.title)}_review.pdf`,
    })

    if (!result.canceled) {
      setStatusKey('exported')
    }
  }

  async function exportCharacterSides(characterName: string) {
    const cleanName = characterName.trim()
    if (!cleanName) {
      return
    }

    await exportTextFile(buildCharacterSides(project, cleanName), `${safeFileName(project.title)}_${safeFileName(cleanName)}_sides.md`, 'Markdown', 'md')
  }

  async function exportDepartmentPackage(department: DepartmentId) {
    const definition = departmentPackages.find((item) => item.id === department)
    const name = definition?.label['zh-CN'] ?? department
    await exportTextFile(buildDepartmentPackage(project, department, breakdownRows, projectLibrary), `${safeFileName(project.title)}_${safeFileName(name)}.md`, 'Markdown', 'md')
  }

  function saveTimelineSnapshot(note: string) {
    const snapshot = createVersionSnapshot(project, note)
    updateProject({ versionHistory: [snapshot, ...(project.versionHistory ?? [])].slice(0, 40) })
    setStatusKey('assistiveDone')
  }

  function restoreTimelineSnapshot(snapshotId: string) {
    const snapshot = [...(project.versionHistory ?? []), ...recoverySnapshots].find((item) => item.id === snapshotId)
    if (!snapshot || !window.confirm('恢复此版本会替换当前正文，确定继续？')) {
      return
    }

    updateProject({ elements: snapshot.elements.map((element) => ({ ...element })) })
    setSelectedId(snapshot.elements[0]?.id ?? '')
    setStatusKey('assistiveDone')
  }

  function deleteTimelineSnapshot(snapshotId: string) {
    if (recoverySnapshots.some((snapshot) => snapshot.id === snapshotId)) {
      setRecoverySnapshots((current) => {
        const next = current.filter((snapshot) => snapshot.id !== snapshotId)
        writeRecoverySnapshots(next)
        return next
      })
      return
    }
    updateProject({ versionHistory: project.versionHistory?.filter((snapshot) => snapshot.id !== snapshotId) ?? [] })
  }

  function restoreSceneFromTimeline(snapshotId: string) {
    const snapshot = [...(project.versionHistory ?? []), ...recoverySnapshots].find((item) => item.id === snapshotId)
    const selectedIndexInCurrent = project.elements.findIndex((element) => element.id === selectedId)
    const currentBlocks = getSceneBlocks(project.elements)
    const currentBlockIndex = currentBlocks.findIndex((block) => selectedIndexInCurrent >= block.start && selectedIndexInCurrent < block.end)
    const currentBlock = currentBlocks[currentBlockIndex]
    const snapshotBlocks = snapshot ? getSceneBlocks(snapshot.elements) : []
    const snapshotBlock = snapshotBlocks.find((block) => block.scene.id === currentBlock?.scene.id) ?? snapshotBlocks[currentBlockIndex]

    if (!snapshot || !currentBlock || !snapshotBlock || !window.confirm('\u6062\u590d\u5f53\u524d\u573a\u4f1a\u66ff\u6362\u8fd9\u4e00\u573a\u7684\u6b63\u6587\uff0c\u786e\u5b9a\u7ee7\u7eed\uff1f')) {
      return
    }

    const restoredElements = snapshotBlock.elements.map((element) => ({ ...element }))
    setProject((current) => ({
      ...current,
      elements: [...current.elements.slice(0, currentBlock.start), ...restoredElements, ...current.elements.slice(currentBlock.end)],
    }))
    setSelectedId(restoredElements[0]?.id ?? selectedId)
    setSelectedElementIds(new Set())
    setStatusKey('assistiveDone')
  }

  async function exportPdf() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.exportPdf({
      html: await buildPrintHtml(project, format),
      suggestedName: `${safeFileName(project.title)}.pdf`,
    })

    if (!result.canceled) {
      setStatusKey('exported')
    }
  }

  async function exportPng() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const pngPages = await renderPngPages(project, format)
    const result = await api.exportPngPages({
      pages: pngPages,
      suggestedFolderName: `${safeFileName(project.title)}_png`,
    })

    if (!result.canceled) {
      setStatusKey('pngDone')
    }
  }

  function insertBeatSheet(sheetId: string) {
    const sheet = beatSheets.find((item) => item.id === sheetId)
    if (!sheet) {
      return
    }

    const elements = createBeatElements(sheet, project.language)
    setProject((current) => ({ ...current, elements: [...current.elements, ...elements] }))
    setSelectedId(elements[0]?.id ?? selectedId)
  }

  function handleMenuCommand(command: MenuCommand) {
    switch (command) {
      case 'undoProject':
        undoProject()
        break
      case 'redoProject':
        redoProject()
        break
      case 'newProject':
        newProject()
        break
      case 'openProject':
        void openProject()
        break
      case 'saveProject':
        void saveProject(false)
        break
      case 'saveProjectAs':
        void saveProject(true)
        break
      case 'openPreferences':
        setPreferencesOpen(true)
        break
      case 'openAssistiveTools':
        setAssistOpen(true)
        break
      case 'openCommandPalette':
        setCommandOpen(true)
        break
      case 'openWritingWorkspace':
        setProductionStage(undefined)
        break
      case 'openPreproduction':
        openProductionWorkspace('preproduction')
        break
      case 'openOnset':
        openProductionWorkspace('onset')
        break
      case 'openPost':
        openProductionWorkspace('post')
        break
      case 'importFdx':
        void importFdx()
        break
      case 'importWordTxt':
        void importWordTxt()
        break
      case 'exportFdx':
        void exportFdx()
        break
      case 'exportPdf':
        openFormatPreview()
        break
      case 'exportPng':
        void exportPng()
        break
      default:
        break
    }
  }

  const commandItems: CommandItem[] = [
    { id: 'production-workspace', label: '\u5236\u7247\u5de5\u4f5c\u533a', detail: '\u62c6\u89e3\u3001\u6392\u671f\u3001\u52d8\u666f\u3001\u6444\u5f71\u3001\u5206\u955c\u4e0e\u540e\u671f\u4ea4\u63a5', keywords: ['\u5236\u7247', '\u62cd\u6444', '\u6392\u671f'], action: () => openProductionWorkspace() },
    { id: 'new', label: t(locale, 'newScript'), detail: t(locale, 'newProject'), shortcut: 'newProject', action: newProject },
    { id: 'open', label: t(locale, 'open'), detail: t(locale, 'projectFile'), shortcut: 'openProject', action: () => void openProject() },
    { id: 'save', label: t(locale, 'save'), detail: t(locale, 'projectFile'), shortcut: 'saveProject', action: () => void saveProject(false) },
    { id: 'tutorial', label: ux(locale, 'tutorialCenter'), detail: ux(locale, 'tutorialExamples'), keywords: ['教学', '入门', '格式', '示例', '教程'], action: () => {
      setToolbarExpanded(false)
      setTutorialOpen(true)
    } },
    { id: 'save-as', label: t(locale, 'saveAs'), detail: t(locale, 'projectFile'), shortcut: 'saveProjectAs', action: () => void saveProject(true) },
    { id: 'import-doc', label: t(locale, 'importDocument'), detail: t(locale, 'importAsHollywood'), keywords: ['word', 'txt', 'docx', '导入', '好莱坞'], action: () => void importWordTxt() },
    { id: 'export-pdf', label: t(locale, 'exportPdf'), detail: ux(locale, 'formatPreflight'), shortcut: 'exportPdf', keywords: ['pdf', '导出', '检查', '格式'], action: openFormatPreview },
    { id: 'export-pdf-now', label: ux(locale, 'exportAfterCheck'), detail: t(locale, 'exportPdf'), action: () => void exportPdf() },
    { id: 'export-png', label: t(locale, 'exportPng'), detail: t(locale, 'preview'), action: () => void exportPng() },
    { id: 'add-next', label: t(locale, 'addNextParagraph'), detail: t(locale, 'addElement'), shortcut: 'addNextParagraph', action: () => addElement(selectedElement ? getNextElementType(selectedElement) : 'action', selectedId) },
    { id: 'add-scene', label: t(locale, 'addNextScene'), detail: t(locale, 'addScene'), shortcut: 'addNextScene', action: () => addElement('scene', selectedId) },
    { id: 'delete-paragraph', label: t(locale, 'deleteParagraph'), detail: t(locale, 'delete'), shortcut: 'deleteParagraph', action: () => deleteElement(selectedId) },
    { id: 'delete-scene-block', label: t(locale, 'deleteSceneBlock'), detail: t(locale, 'scenes'), shortcut: 'deleteSceneBlock', action: deleteCurrentSceneBlock },
    { id: 'move-up', label: t(locale, 'moveUp'), detail: t(locale, 'selected'), shortcut: 'moveParagraphUp', action: () => moveElement(selectedId, -1) },
    { id: 'move-down', label: t(locale, 'moveDown'), detail: t(locale, 'selected'), shortcut: 'moveParagraphDown', action: () => moveElement(selectedId, 1) },
    { id: 'assist', label: t(locale, 'assistiveTools'), detail: t(locale, 'typoCorrection'), shortcut: 'openAssistiveTools', keywords: ['辅助', '错别字', '替换', '工具'], action: () => setAssistOpen(true) },
    { id: 'quick-jump', label: ux(locale, 'quickJump'), detail: t(locale, 'scenes'), shortcut: 'openQuickJump', keywords: ['跳转', '场景', '角色', '地点'], action: () => setQuickJumpOpen(true) },
    { id: 'scene-map', label: ux(locale, 'sceneMap'), detail: t(locale, 'scenes'), shortcut: 'openSceneMap', keywords: ['地图', '结构', '场景'], action: () => setSceneMapOpen(true) },
    { id: 'scene-board', label: ux(locale, 'sceneBoard'), detail: t(locale, 'structurePanel'), keywords: ['卡片', '场景墙', '拖拽'], action: () => setSceneBoardOpen(true) },
    { id: 'character-arcs', label: ux(locale, 'characterArcs'), detail: t(locale, 'characters'), keywords: ['角色', '弧线', '人物'], action: () => setCharacterArcsOpen(true) },
    { id: 'continuity', label: ux(locale, 'continuityCheck'), detail: t(locale, 'scriptDoctor'), keywords: ['连续性', '检查', '穿帮'], action: () => setContinuityOpen(true) },
    { id: 'revision-compare', label: ux(locale, 'visualRevisionCompare'), detail: ux(locale, 'revisionMode'), action: () => setRevisionCompareOpen(true) },
    { id: 'production-lock', label: ux(locale, 'productionLock'), detail: project.productionLock?.enabled ? ux(locale, 'unlockProduction') : ux(locale, 'lockProductionNow'), keywords: ['锁页', '锁场序', '场号'], action: () => void (project.productionLock?.enabled ? unlockProduction() : lockProduction()) },
    { id: 'scene-outline', label: ux(locale, 'sceneOutline'), detail: 'Markdown', keywords: ['大纲', '分场'], action: () => void exportSceneOutline() },
    { id: 'shooting-breakdown', label: ux(locale, 'shootingBreakdown'), detail: ux(locale, 'exportCsv'), keywords: ['分解表', '制片', 'csv'], action: () => setBreakdownOpen(true) },
    { id: 'series-mode', label: ux(locale, 'seriesMode'), detail: project.series?.title ?? project.title, action: () => setSeriesOpen(true) },
    { id: 'project-library', label: ux(locale, 'projectLibrary'), detail: t(locale, 'characters'), action: () => setLibraryOpen(true) },
    { id: 'review-mode', label: ux(locale, 'reviewMode'), detail: `${unresolvedReviewNotes.length} ${ux(locale, 'unresolvedNotes')}`, keywords: ['批注', '审稿', '意见'], action: () => setReviewOpen(true) },
    { id: 'character-sides', label: ux(locale, 'characterSides'), detail: t(locale, 'characters'), keywords: ['分本', 'sides', '演员'], action: () => setSidesOpen(true) },
    { id: 'department-package', label: ux(locale, 'departmentPackage'), detail: ux(locale, 'shootingBreakdown'), keywords: ['部门', '交付', '导演包', '制片包'], action: () => setDepartmentPackageOpen(true) },
    { id: 'version-timeline', label: ux(locale, 'versionTimeline'), detail: `${project.versionHistory?.length ?? 0}`, keywords: ['版本', '时间线', '恢复'], action: () => setTimelineOpen(true) },
    { id: 'review-pdf', label: ux(locale, 'reviewPdf'), detail: ux(locale, 'reviewWatermark'), keywords: ['水印', '审稿', 'pdf'], action: () => void exportReviewPdf() },
    { id: 'shortcuts', label: ux(locale, 'shortcutPreferences'), detail: t(locale, 'shortcuts'), shortcut: 'openShortcutPreferences', keywords: ['快捷键', '键盘', '偏好'], action: () => setShortcutPreferencesOpen(true) },
    { id: 'export-fountain', label: ux(locale, 'fountainExport'), detail: 'Fountain', action: () => void exportFountain() },
    { id: 'export-markdown', label: ux(locale, 'markdownExport'), detail: 'Markdown', action: () => void exportMarkdown() },
    { id: 'health', label: ux(locale, 'projectHealth'), detail: t(locale, 'statistics'), shortcut: 'openProjectHealth', action: () => setHealthOpen(true) },
    { id: 'format-preflight', label: ux(locale, 'formatPreflight'), detail: ux(locale, 'professionalPreview'), shortcut: 'openProfessionalPreview', action: openFormatPreview },
    { id: 'fix-format', label: ux(locale, 'oneClickFix'), detail: t(locale, 'format'), action: () => void applyProfessionalFormat() },
    { id: 'typewriter', label: ux(locale, 'typewriterMode'), detail: t(locale, 'focusWriting'), shortcut: 'toggleTypewriterMode', action: () => setTypewriterMode((value) => !value) },
    { id: 'revision', label: ux(locale, 'revisionMode'), detail: ux(locale, revisionMode ? 'changed' : 'noSnapshot'), shortcut: 'toggleRevisionMode', action: () => setRevisionMode((value) => !value) },
    { id: 'doctor', label: t(locale, 'scriptDoctor'), detail: t(locale, 'runScriptDoctor'), action: () => setAssistOpen(true) },
    { id: 'structure', label: t(locale, 'structureMap'), detail: t(locale, 'scenes'), action: () => setAssistOpen(true) },
    { id: 'scene-number', label: t(locale, 'renumberScenes'), detail: t(locale, 'sceneNumbers'), action: () => void renumberScenes() },
    { id: 'terms-cn', label: t(locale, 'convertToSimplified'), detail: t(locale, 'termConversion'), action: () => void convertProjectTerms('zh-CN') },
    { id: 'terms-en', label: t(locale, 'convertToEnglish'), detail: t(locale, 'termConversion'), action: () => void convertProjectTerms('en-US') },
    { id: 'terms-tw', label: t(locale, 'convertToTraditional'), detail: t(locale, 'termConversion'), action: () => void convertProjectTerms('zh-TW') },
    ...transitionOptions.map((option) => ({
      id: `transition-${option.id}`,
      label: `${t(locale, 'transitionPreset')} / ${option.label}`,
      detail: option.text,
      action: () => applyTransitionPreset(option.text),
    })),
    ...elementOrder.map((type) => ({
      id: `type-${type}`,
      label: getElementLabel(type, locale),
      detail: t(locale, 'elementType'),
      action: () => setSelectedElementType(type),
    })),
  ]

  return (
    <main
      className={[
        'app-shell',
        'focus-mode',
        typewriterMode ? 'typewriter-mode' : '',
        revisionMode ? 'revision-mode' : '',
        toolbarExpanded ? 'toolbar-expanded' : '',
        onboardingActive ? 'onboarding-active' : '',
        productionStage ? 'production-mode' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="topbar">
        <div className="brand">
          <img src="./app-icon.svg" width="34" height="34" alt="" />
          <div>
            <strong>{t(locale, 'appTitle')}</strong>
            <span>{project.title}</span>
          </div>
        </div>

        <div className="toolbar" role="toolbar">
          <CommandButton label={t(locale, 'newProject')} onClick={newProject}>
            <FilePlus size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'open')} onClick={openProject}>
            <FolderOpen size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'save')} onClick={() => saveProject(false)}>
            <Save size={17} aria-hidden="true" />
          </CommandButton>
          <IconButton label={ux(locale, 'undo')} disabled={!canUndo} onClick={undoProject}>
            <Undo2 size={17} aria-hidden="true" />
          </IconButton>
          <IconButton label={ux(locale, 'redo')} disabled={!canRedo} onClick={redoProject}>
            <Redo2 size={17} aria-hidden="true" />
          </IconButton>
          <CommandButton label={t(locale, 'saveAs')} className="secondary-command" onClick={() => saveProject(true)}>
            <Download size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={ux(locale, 'quickJump')} onClick={() => setQuickJumpOpen(true)}>
            <Search size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={'\u5236\u7247\u5de5\u4f5c\u533a'} onClick={() => openProductionWorkspace()}>
            <Clapperboard size={17} aria-hidden="true" />
          </CommandButton>
          <div className="advanced-toolbar">
            <CommandButton label={ux(locale, 'tutorialCenter')} onClick={() => openToolbarDestination(() => setTutorialOpen(true))}>
              <GraduationCap size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={t(locale, 'preferences')} onClick={() => openToolbarDestination(() => setPreferencesOpen(true))}>
              <Settings size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label="标题页" onClick={() => openToolbarDestination(() => setTitlePageOpen(true))}>
              <LayoutTemplate size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={t(locale, 'assistiveTools')} onClick={() => openToolbarDestination(() => setAssistOpen(true))}>
              <Sparkles size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={ux(locale, 'sceneMap')} onClick={() => openToolbarDestination(() => setSceneMapOpen(true))}>
              <ListTree size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={ux(locale, 'projectHealth')} onClick={() => openToolbarDestination(() => setHealthOpen(true))}>
              <BarChart3 size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={ux(locale, 'reviewMode')} onClick={() => openToolbarDestination(() => setReviewOpen(true))}>
              <ClipboardList size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={t(locale, 'commandPalette')} onClick={() => openToolbarDestination(() => setCommandOpen(true))}>
              <Search size={17} aria-hidden="true" />
            </CommandButton>
            <CommandButton label={ux(locale, 'revisionMode')} className={revisionMode ? 'mode-command active' : 'mode-command'} onClick={() => openToolbarDestination(() => setRevisionMode((value) => !value))}>
              <ClipboardList size={17} aria-hidden="true" />
            </CommandButton>
          </div>
          <CommandButton label={ux(locale, 'shortcutPreferences')} className="secondary-command" onClick={() => setShortcutPreferencesOpen(true)}>
            <SlidersHorizontal size={17} aria-hidden="true" />
          </CommandButton>
          <span className="toolbar-divider secondary-command" />
          <CommandButton label={t(locale, 'importFdx')} className="secondary-command" onClick={importFdx}>
            <Upload size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'exportFdx')} className="secondary-command" onClick={exportFdx}>
            <FileJson size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={ux(locale, 'typewriterMode')} className={typewriterMode ? 'mode-command active' : 'mode-command'} onClick={() => setTypewriterMode((value) => !value)}>
            <Type size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'exportPdf')} className="secondary-command" onClick={openFormatPreview}>
            <FileDown size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'exportPng')} className="secondary-command" onClick={exportPng}>
            <Image size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={ux(locale, 'moreTools')} className={toolbarExpanded ? 'more-command active' : 'more-command'} onClick={() => setToolbarExpanded((value) => !value)}>
            <MoreHorizontal size={17} aria-hidden="true" />
          </CommandButton>
        </div>

        <div className="top-search">
          <Search size={15} aria-hidden="true" />
          <span>{t(locale, 'currentSelection')}: {selectedElement?.text || t(locale, 'ready')}</span>
        </div>
      </header>

      <aside className="left-panel">
        <div className="panel-tabs">
          <TabButton active={leftTab === 'outline'} label={t(locale, 'outline')} onClick={() => setLeftTab('outline')}>
            <ListTree size={16} aria-hidden="true" />
          </TabButton>
          <TabButton active={leftTab === 'scenes'} label={t(locale, 'scenes')} onClick={() => setLeftTab('scenes')}>
            <Clapperboard size={16} aria-hidden="true" />
          </TabButton>
          <TabButton active={leftTab === 'characters'} label={t(locale, 'characters')} onClick={() => setLeftTab('characters')}>
            <Users size={16} aria-hidden="true" />
          </TabButton>
        </div>

        {leftTab === 'outline' && (
          <section>
            <PanelTitle icon={<BookOpen size={17} aria-hidden="true" />} title={t(locale, 'outline')} />
            <div className="outline-list">
              {project.elements
                .map((element, index) => ({ element, index }))
                .filter(({ element }) => element.type === 'scene' || element.type === 'section' || element.type === 'transition')
                .map(({ element, index }) => (
                  <button
                    type="button"
                    className={element.id === selectedId ? 'outline-item active' : 'outline-item'}
                    key={element.id}
                    onClick={() => setSelectedId(element.id)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{getElementLabel(element.type, locale)}</strong>
                    <em>{element.text || getElementLabel(element.type, locale)}</em>
                  </button>
                ))}
            </div>
          </section>
        )}

        {leftTab === 'scenes' && (
          <section>
            <PanelTitle icon={<Clapperboard size={17} aria-hidden="true" />} title={t(locale, 'scenes')} />
            <div className="scene-card-list">
              {scenes.map((scene, index) => (
                <button type="button" key={scene.id} className="scene-card" onClick={() => setSelectedId(scene.id)}>
                  <span>{index + 1}</span>
                  <strong>{scene.text || getElementLabel('scene', locale)}</strong>
                  <small>{countSceneDialogues(project.elements, scene.id)} {t(locale, 'dialogueUnits')}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {leftTab === 'characters' && (
          <section>
            <PanelTitle icon={<Users size={17} aria-hidden="true" />} title={t(locale, 'characters')} />
            <div className="character-cloud">
              {characters.map((character) => (
                <button type="button" key={character.name} onClick={() => setSelectedId(character.id)}>
                  <span>{character.count}</span>
                  {character.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      <section className="workspace">
        <div className="format-ribbon">
          <div className="quick-format">
            {elementOrder.map((type) => (
              <button
                type="button"
                key={type}
                className={selectedElement?.type === type ? 'active' : ''}
                onClick={() => setSelectedElementType(type)}
              >
                {getElementLabel(type, locale)}
              </button>
            ))}
          </div>
          <div className="ribbon-actions">
            {selectedElement?.type === 'scene' && (
              <div className="scene-preset">
                <select
                  value={preferences.defaultScenePlace}
                  aria-label={t(locale, 'defaultScenePlace')}
                  onChange={(event) => {
                    const nextPlace = event.target.value as ScenePlaceId
                    updatePreferences({ defaultScenePlace: nextPlace })
                    applySelectedSceneHeading({ place: nextPlace })
                  }}
                >
                  {scenePlaceTerms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} / {getScenePlaceToken(item.id, preferences.termStyle)}
                    </option>
                  ))}
                </select>
                <select
                  value={preferences.defaultSceneTime}
                  aria-label={t(locale, 'defaultSceneTime')}
                  onChange={(event) => {
                    const nextTime = event.target.value as SceneTimeId
                    updatePreferences({ defaultSceneTime: nextTime })
                    applySelectedSceneHeading({ time: nextTime })
                  }}
                >
                  {sceneTimeTerms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} / {getSceneTimeToken(item.id, preferences.termStyle)}
                    </option>
                  ))}
                </select>
                <button type="button" className="text-button" onClick={() => applySelectedSceneHeading({ style: preferences.termStyle })}>
                  {t(locale, 'applyTerms')}
                </button>
              </div>
            )}
            {selectedElement?.type === 'transition' && (
              <select
                className="transition-preset"
                value=""
                aria-label={t(locale, 'transitionPreset')}
                onChange={(event) => applyTransitionPreset(event.target.value)}
              >
                <option value="">{t(locale, 'transitionPreset')}</option>
                {transitionOptions.map((option) => (
                  <option key={option.id} value={option.text}>
                    {option.label} / {option.text}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="text-button" onClick={() => addElement()}>
              <Plus size={16} aria-hidden="true" />
              {t(locale, 'addElement')}
            </button>
          </div>
        </div>

        <div className="editor-surface">
          {autoSaveNotice && (
            <div className="autosave-banner">
              <span>{ux(locale, 'recoverAutoSave')} / {new Date(autoSaveNotice.savedAt).toLocaleString('zh-CN')}</span>
              <div className="inline-actions">
                <button type="button" className="text-button" onClick={() => recoverAutoSave(autoSaveNotice)}>
                  {ux(locale, 'recoverAutoSave')}
                </button>
                <button type="button" className="text-button" onClick={dismissAutoSaveNotice}>
                  {ux(locale, 'dismiss')}
                </button>
              </div>
            </div>
          )}
          <div className="editor-head">
            <div>
              <h1>{project.title}</h1>
              <span>{format.labels[locale]} / {project.fontFamily} / {project.fontSize}pt</span>
            </div>
            <div className="editor-metrics">
              <Metric label={t(locale, 'pages')} value={stats.pages} />
              <Metric label={t(locale, 'scenes')} value={stats.scenes} />
              <Metric label={t(locale, 'characters')} value={stats.characters} />
            </div>
          </div>

          {selectedElementIds.size > 0 && (
            <div className="selection-bar" role="toolbar" aria-label={ux(locale, 'selectedParagraphs')}>
              <strong>{selectedElementIds.size}</strong>
              <span>{ux(locale, 'selectedParagraphs')}</span>
              <IconButton label={t(locale, 'moveUp')} onClick={() => moveSelectedElements(-1)}>
                <ArrowUp size={15} aria-hidden="true" />
              </IconButton>
              <IconButton label={t(locale, 'moveDown')} onClick={() => moveSelectedElements(1)}>
                <ArrowDown size={15} aria-hidden="true" />
              </IconButton>
              <IconButton label="双栏对白" onClick={toggleDualDialogue}>
                <Columns2 size={15} aria-hidden="true" />
              </IconButton>
              <IconButton label={t(locale, 'delete')} onClick={deleteSelectedElements}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
              <IconButton label={ux(locale, 'clearSelection')} onClick={() => setSelectedElementIds(new Set())}>
                <X size={15} aria-hidden="true" />
              </IconButton>
            </div>
          )}

          <div className="editor-list">
            {project.elements.map((element) => {
              const textStyle = getEditorTextStyle(element, project, format, workspaceMode)
              const revisionState = revisionMode ? (revisionStates.get(element.id) ?? 'none') : 'none'
              const characterSuggestions = element.type === 'character' ? getCharacterSuggestions(characters, element.text) : []
              const noteCount = reviewNotes.filter((note) => note.elementId === element.id && !note.resolved).length
              return (
                <article
                  className={[
                    'editor-row',
                    element.id === selectedId ? 'active' : '',
                    selectedElementIds.has(element.id) ? 'selected' : '',
                    draggingElementIds.includes(element.id) ? 'dragging' : '',
                    revisionMode ? `revision-${revisionColor}` : '',
                    revisionState !== 'none' ? `revision-${revisionState}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-element-id={element.id}
                  data-element-type={element.type}
                  key={element.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropElements(event, element.id)}
                  onMouseDown={(event) => {
                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                      event.preventDefault()
                      toggleElementSelection(element.id, event.shiftKey)
                    }
                  }}
                  onContextMenu={(event) => openElementContextMenu(event, element.id)}
                >
                  <div className="element-label">
                    <select
                      aria-label={getElementLabel(element.type, locale)}
                      value={element.type}
                      onChange={(event) => updateElement(element.id, { type: event.target.value as ScriptElementType })}
                      onFocus={() => selectElementForEditing(element.id)}
                    >
                      {elementOrder.map((type) => (
                        <option key={type} value={type}>
                          {getElementLabel(type, locale)}
                        </option>
                      ))}
                    </select>
                    <span>{String(project.elements.indexOf(element) + 1).padStart(2, '0')}</span>
                  </div>
                  <ScriptEditorTextarea
                    elementId={element.id}
                    placeholder={onboardingActive && project.elements[0]?.id === element.id ? buildSceneHeading({ style: preferences.termStyle, place: preferences.defaultScenePlace, location: '\u5730\u70b9', time: preferences.defaultSceneTime }) : undefined}
                    value={element.text}
                    rows={getElementRows(element, workspaceMode)}
                    onChange={(event) => updateElementTextSmart(element, event.target.value, !composingElementIdsRef.current.has(element.id))}
                    onCompositionStart={() => composingElementIdsRef.current.add(element.id)}
                    onCompositionEnd={(value) => {
                      composingElementIdsRef.current.delete(element.id)
                      updateElementTextSmart(element, value, true)
                    }}
                    onBlur={() => handleElementBlur(element)}
                    onFocus={() => selectElementForEditing(element.id)}
                    onKeyDown={(event) => handleEditorKeyDown(event, element)}
                    style={textStyle}
                  />
                  {characterSuggestions.length > 0 && (
                    <div className="character-suggestions" aria-label={ux(locale, 'characterSuggestions')}>
                      {characterSuggestions.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion.name}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => updateElement(element.id, { text: suggestion.name })}
                        >
                          {suggestion.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {noteCount > 0 && (
                    <button
                      type="button"
                      className="review-marker"
                      title={ux(locale, 'reviewMode')}
                      onClick={() => {
                        setSelectedId(element.id)
                        setReviewOpen(true)
                      }}
                    >
                      {noteCount}
                    </button>
                  )}
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title={ux(locale, 'selectParagraph')}
                      aria-label={ux(locale, 'selectParagraph')}
                      onClick={() => toggleElementSelection(element.id)}
                    >
                      {selectedElementIds.has(element.id) ? <CheckSquare size={15} aria-hidden="true" /> : <Square size={15} aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className="icon-button drag-handle"
                      draggable
                      title={ux(locale, 'dragParagraph')}
                      aria-label={ux(locale, 'dragParagraph')}
                      onMouseDown={(event) => event.currentTarget.focus({ preventScroll: true })}
                      onDragStart={(event) => beginElementDrag(event, element.id)}
                      onDragEnd={() => setDraggingElementIds([])}
                    >
                      <GripVertical size={15} aria-hidden="true" />
                    </button>
                    <IconButton label={t(locale, 'moveUp')} onClick={() => moveElement(element.id, -1)}>
                      <ArrowUp size={15} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t(locale, 'moveDown')} onClick={() => moveElement(element.id, 1)}>
                      <ArrowDown size={15} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t(locale, 'delete')} onClick={() => (selectedElementIds.has(element.id) ? deleteSelectedElements() : deleteElement(element.id))}>
                      <Trash2 size={15} aria-hidden="true" />
                    </IconButton>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <aside className="right-panel">
        <div className="panel-tabs">
          <TabButton active={rightTab === 'format'} label={t(locale, 'formatPanel')} onClick={() => setRightTab('format')}>
            <SlidersHorizontal size={16} aria-hidden="true" />
          </TabButton>
          <TabButton active={rightTab === 'structure'} label={t(locale, 'structurePanel')} onClick={() => setRightTab('structure')}>
            <LayoutTemplate size={16} aria-hidden="true" />
          </TabButton>
          <TabButton active={rightTab === 'export'} label={t(locale, 'exportPanel')} onClick={() => setRightTab('export')}>
            <FileDown size={16} aria-hidden="true" />
          </TabButton>
        </div>

        {rightTab === 'format' && (
          <section>
            <PanelTitle icon={<Settings size={17} aria-hidden="true" />} title={t(locale, 'project')} />
            <Field label={t(locale, 'title')}>
              <input value={project.title} onChange={(event) => updateProject({ title: event.target.value })} />
            </Field>
            <Field label={t(locale, 'author')}>
              <input value={project.author} onChange={(event) => updateProject({ author: event.target.value })} />
            </Field>
            <Field label={t(locale, 'interfaceLanguage')} icon={<Languages size={15} aria-hidden="true" />}>
              <select value={uiLocale} onChange={(event) => updateUiLocale(event.target.value as UiLocale)}>
                {localeOptions.map((value) => (
                  <option key={value} value={value}>
                    {localeNames[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t(locale, 'scriptLanguage')} icon={<Languages size={15} aria-hidden="true" />}>
              <select value={project.language} onChange={(event) => updateProject({ language: event.target.value as AppLocale })}>
                {scriptLocaleOptions.map((value) => (
                  <option key={value} value={value}>
                    {scriptLocaleNames[value][locale]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t(locale, 'format')}>
              <select value={project.formatId} onChange={handleFormatChange}>
                {scriptFormats.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.labels[locale]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t(locale, 'font')} icon={<Type size={15} aria-hidden="true" />}>
              <select value={project.fontFamily} onChange={(event) => updateProject({ fontFamily: event.target.value })}>
                {fonts.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t(locale, 'size')}>
              <input
                type="number"
                min={8}
                max={24}
                value={project.fontSize}
                onChange={(event) => updateProject({ fontSize: Number(event.target.value) })}
              />
            </Field>

            <div className="inspector-card">
              <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={t(locale, 'selected')} />
              {selectedElement ? (
                <>
                  <Field label={t(locale, 'elementType')}>
                    <select value={selectedElement.type} onChange={(event) => updateElement(selectedElement.id, { type: event.target.value as ScriptElementType })}>
                      {elementOrder.map((type) => (
                        <option key={type} value={type}>
                          {getElementLabel(type, locale)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <MetricRow label={t(locale, 'position')} value={`${selectedIndex + 1} / ${project.elements.length}`} />
                  <MetricRow label={t(locale, 'textLength')} value={Array.from(selectedElement.text).length} />
                </>
              ) : (
                <p className="muted">{t(locale, 'noSelection')}</p>
              )}
            </div>
          </section>
        )}

        {rightTab === 'structure' && (
          <section>
            <PanelTitle icon={<Sparkles size={17} aria-hidden="true" />} title={t(locale, 'outline')} />
            <div className="beat-list">
              {beatSheets.map((sheet) => (
                <button type="button" key={sheet.id} onClick={() => insertBeatSheet(sheet.id)}>
                  <strong>{sheet.title[locale]}</strong>
                  <span>{sheet.beats[locale].length} {t(locale, 'beats')}</span>
                </button>
              ))}
            </div>

            <div className="stats-grid">
              <Metric label={t(locale, 'pages')} value={stats.pages} />
              <Metric label={t(locale, 'words')} value={stats.words} />
              <Metric label={t(locale, 'chars')} value={stats.chars} />
              <Metric label={t(locale, 'dialogueUnits')} value={stats.dialogues} />
            </div>

            <div className="preview-section">
              <PanelTitle icon={<FileText size={17} aria-hidden="true" />} title={t(locale, 'preview')} />
              <div className="page-stack">
                {pages.map((page, index) => (
                  <ScriptPage key={`page-${index}`} page={page} pageNumber={index + 1} project={project} formatId={format.id} locale={locale} />
                ))}
              </div>
            </div>
          </section>
        )}

        {rightTab === 'export' && (
          <section>
            <PanelTitle icon={<FileDown size={17} aria-hidden="true" />} title={t(locale, 'exportPanel')} />
            <div className="export-grid">
              <ExportTile icon={<Save size={20} aria-hidden="true" />} title={t(locale, 'projectFile')} onClick={() => saveProject(false)} />
              <ExportTile icon={<FileJson size={20} aria-hidden="true" />} title={t(locale, 'exportFdx')} onClick={exportFdx} />
              <ExportTile icon={<FileDown size={20} aria-hidden="true" />} title={t(locale, 'exportPdf')} onClick={openFormatPreview} />
              <ExportTile icon={<Image size={20} aria-hidden="true" />} title={t(locale, 'exportPng')} onClick={exportPng} />
            </div>

            <div className="inspector-card">
              <PanelTitle icon={<BarChart3 size={17} aria-hidden="true" />} title={t(locale, 'statistics')} />
              <MetricRow label={t(locale, 'pages')} value={stats.pages} />
              <MetricRow label={t(locale, 'scenes')} value={stats.scenes} />
              <MetricRow label={t(locale, 'characters')} value={stats.characters} />
              <MetricRow label={t(locale, 'dialogueUnits')} value={stats.dialogues} />
              <MetricRow label={t(locale, 'words')} value={stats.words} />
              <MetricRow label={t(locale, 'chars')} value={stats.chars} />
            </div>
          </section>
        )}
      </aside>

      {productionStage && (
        <ProductionWorkspace
          data={productionData}
          projectTitle={project.title}
          stage={productionStage}
          onChange={(production) => updateProject({ production })}
          onChangeStage={setProductionStage}
          onClose={() => setProductionStage(undefined)}
          onExport={(content, name, kind) => void exportProductionFile(content, name, kind)}
        />
      )}

      {preferencesOpen && (
        <PreferencesDialog
          fonts={fonts}
          locale={locale}
          preferences={preferences}
          onApplyToProject={applyPreferencesToCurrentProject}
          onChange={updatePreferences}
          onClose={() => setPreferencesOpen(false)}
          onReset={resetPreferences}
        />
      )}

      {tutorialOpen && (
        <TutorialCenterDialog
          locale={locale}
          onClose={() => setTutorialOpen(false)}
          onInsertExample={insertTutorialExample}
        />
      )}

      {assistOpen && (
        <AssistiveToolsDialog
          locale={locale}
          onApplyCorrections={applyCorrectionPairs}
          onApplyProfessionalFormat={applyProfessionalFormat}
          onAddCurrentEpisode={addCurrentEpisode}
          onClearSceneNumbers={clearSceneNumbers}
          onClose={() => setAssistOpen(false)}
          onCountCharacters={summarizeCharacters}
          onConvertTerms={convertProjectTerms}
          onExportBreakdown={exportBreakdownCsv}
          onExportFountain={exportFountain}
          onExportMarkdown={exportMarkdown}
          onExportSceneOutline={exportSceneOutline}
          onOpenHealth={() => openAssistDestination(() => setHealthOpen(true))}
          onOpenPreview={() => openAssistDestination(openFormatPreview)}
          onOpenSceneBoard={() => openAssistDestination(() => setSceneBoardOpen(true))}
          onOpenCharacterArcs={() => openAssistDestination(() => setCharacterArcsOpen(true))}
          onOpenContinuity={() => openAssistDestination(() => setContinuityOpen(true))}
          onOpenRevisionCompare={() => openAssistDestination(() => setRevisionCompareOpen(true))}
          onOpenBreakdown={() => openAssistDestination(() => setBreakdownOpen(true))}
          onOpenDepartmentPackage={() => openAssistDestination(() => setDepartmentPackageOpen(true))}
          onOpenLibrary={() => openAssistDestination(() => setLibraryOpen(true))}
          onOpenReview={() => openAssistDestination(() => setReviewOpen(true))}
          onOpenSeries={() => openAssistDestination(() => setSeriesOpen(true))}
          onOpenSides={() => openAssistDestination(() => setSidesOpen(true))}
          onOpenTimeline={() => openAssistDestination(() => setTimelineOpen(true))}
          onExportReviewPdf={() => exportReviewPdf()}
          onImportWordTxt={importWordTxt}
          onJumpToElement={jumpToElement}
          onLockProduction={lockProduction}
          onMoveSceneBlock={moveSceneBlock}
          onProductionReport={buildCurrentProductionReport}
          onRenumberScenes={renumberScenes}
          onRunScriptDoctor={runScriptDoctor}
          onSaveRevisionSnapshot={saveRevisionSnapshot}
          onCompareRevisionSnapshot={compareRevisionSnapshot}
          onReplaceAll={replaceAllText}
          scenes={scenes}
          stats={stats}
        />
      )}

      {commandOpen && <CommandPalette commands={commandItems} locale={locale} shortcuts={activeShortcuts} onClose={() => setCommandOpen(false)} />}

      {quickJumpOpen && (
        <QuickJumpDialog
          characters={characters}
          locale={locale}
          scenes={sceneSummaries}
          transient={quickJumpTransient}
          onClose={() => setQuickJumpOpen(false)}
          onJump={(id) => {
            setSelectedId(id)
            setQuickJumpOpen(false)
          }}
        />
      )}

      {shortcutPreferencesOpen && (
        <ShortcutPreferencesDialog
          locale={locale}
          settings={shortcutSettings}
          shortcuts={activeShortcuts}
          onChange={updateShortcutSettings}
          onClose={() => setShortcutPreferencesOpen(false)}
        />
      )}

      {sceneMapOpen && (
        <SceneMapDialog
          locale={locale}
          scenes={sceneSummaries}
          onClose={() => setSceneMapOpen(false)}
          onJump={(id) => {
            setSelectedId(id)
            setSceneMapOpen(false)
          }}
        />
      )}

      {sceneBoardOpen && (
        <SceneBoardDialog
          cards={sceneBoardCards}
          locale={locale}
          onClose={() => setSceneBoardOpen(false)}
          onJump={(id) => {
            setSelectedId(id)
            setSceneBoardOpen(false)
          }}
          onMoveScene={moveSceneBlockTo}
        />
      )}

      {characterArcsOpen && <CharacterArcsDialog arcs={characterArcs} locale={locale} onClose={() => setCharacterArcsOpen(false)} />}

      {continuityOpen && <ContinuityDialog issues={continuityIssues} locale={locale} onClose={() => setContinuityOpen(false)} />}

      {revisionCompareOpen && <RevisionCompareDialog diffs={revisionDiffs} locale={locale} onClose={() => setRevisionCompareOpen(false)} />}

      {breakdownOpen && (
        <BreakdownDialog
          locale={locale}
          rows={breakdownRows}
          onClose={() => setBreakdownOpen(false)}
          onExport={() => void exportBreakdownCsv()}
        />
      )}

      {seriesOpen && (
        <SeriesDialog
          locale={locale}
          project={project}
          onAddCurrentEpisode={addCurrentEpisode}
          onClose={() => setSeriesOpen(false)}
          onExport={() => void exportSeriesBible()}
        />
      )}

      {libraryOpen && (
        <ProjectLibraryDialog
          library={projectLibrary}
          locale={locale}
          onClose={() => setLibraryOpen(false)}
          onRename={renameEntityEverywhere}
        />
      )}

      {reviewOpen && (
        <ReviewDialog
          elements={project.elements}
          locale={locale}
          notes={reviewNotes}
          selectedId={selectedId}
          onAddNote={addReviewNote}
          onClose={() => setReviewOpen(false)}
          onDeleteNote={deleteReviewNote}
          onExportReviewPdf={(watermark) => void exportReviewPdf(watermark)}
          onJump={(id) => setSelectedId(id)}
          onToggleNote={toggleReviewNote}
        />
      )}

      {sidesOpen && (
        <SidesDialog
          characters={characters.map((character) => character.name)}
          locale={locale}
          project={project}
          onClose={() => setSidesOpen(false)}
          onExport={(characterName) => void exportCharacterSides(characterName)}
        />
      )}

      {departmentPackageOpen && (
        <DepartmentPackageDialog
          locale={locale}
          project={project}
          rows={breakdownRows}
          library={projectLibrary}
          onClose={() => setDepartmentPackageOpen(false)}
          onExport={(department) => void exportDepartmentPackage(department)}
        />
      )}

      {timelineOpen && (
        <VersionTimelineDialog
          locale={locale}
          autoSnapshotIds={recoverySnapshots.map((snapshot) => snapshot.id)}
          snapshots={[...(project.versionHistory ?? []), ...recoverySnapshots].sort((left, right) => right.createdAt.localeCompare(left.createdAt))}
          onClose={() => setTimelineOpen(false)}
          onDelete={deleteTimelineSnapshot}
          onRestore={restoreTimelineSnapshot}
          onRestoreScene={restoreSceneFromTimeline}
          onSave={saveTimelineSnapshot}
        />
      )}

      {healthOpen && <ProjectHealthDialog locale={locale} report={healthReport} stats={stats} onClose={() => setHealthOpen(false)} />}

      {titlePageOpen && (
        <TitlePageDialog
          data={project.titlePage ?? createDefaultTitlePage(project)}
          locale={locale}
          onChange={updateTitlePage}
          onClose={() => setTitlePageOpen(false)}
        />
      )}

      {formatPreviewOpen && (
        <FormatPreviewDialog
          audit={formatAudit}
          format={exportDocument.format}
          layout={exportLayout}
          locale={locale}
          project={exportDocument.project}
          revisionColor={revisionColor}
          revisionMode={revisionMode}
          settings={resolveExportSettings(project)}
          sceneLockReference={sceneLockReference}
          pageLockReference={pageLockReference}
          onApplyProfessionalFormat={applyProfessionalFormat}
          onClose={() => setFormatPreviewOpen(false)}
          onExport={() => {
            setFormatPreviewOpen(false)
            void exportPdf()
          }}
          onJump={(elementId) => {
            setFormatPreviewOpen(false)
            selectElementForEditing(elementId)
          }}
          onSaveRevisionBaseline={() => {
            saveRevisionBaseline()
            setStatusKey('assistiveDone')
          }}
          onSetRevisionColor={setRevisionColor}
          onOpenTitlePage={() => {
            setFormatPreviewOpen(false)
            setTitlePageOpen(true)
          }}
          onSelectProfile={selectExportProfile}
          onUpdateSettings={updateExportSettings}
          onToggleRevision={() => setRevisionMode((value) => !value)}
        />
      )}

      {contextMenu && (
        <ElementContextMenu
          element={project.elements.find((element) => element.id === contextMenu.elementId)}
          locale={locale}
          position={contextMenu}
          onAddAbove={(type) => {
            addElementBefore(type, contextMenu.elementId)
            setContextMenu(undefined)
          }}
          onAddBelow={(type) => {
            addElement(type, contextMenu.elementId)
            setContextMenu(undefined)
          }}
          onAddReview={() => {
            setSelectedId(contextMenu.elementId)
            setReviewOpen(true)
            setContextMenu(undefined)
          }}
          onChangeType={(type) => {
            updateElement(contextMenu.elementId, { type })
            setContextMenu(undefined)
          }}
          onClose={() => setContextMenu(undefined)}
          onDelete={() => {
            deleteElement(contextMenu.elementId)
            setContextMenu(undefined)
          }}
          onDeleteScene={() => {
            setSelectedId(contextMenu.elementId)
            deleteCurrentSceneBlock()
            setContextMenu(undefined)
          }}
          onMergePrevious={() => {
            mergeElementWithPrevious(contextMenu.elementId)
            setContextMenu(undefined)
          }}
          onSplit={() => {
            splitElementAtCursor(contextMenu.elementId)
            setContextMenu(undefined)
          }}
        />
      )}

      <footer className="statusbar">
        <span>{status}</span>
        <span>{filePath || t(locale, 'unsavedProject')}</span>
        <span>{lastAutoSavedAt ? `${ux(locale, 'autoSaved')} ${new Date(lastAutoSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ux(locale, 'autoSaved')}</span>
        <span>{stats.pages} {t(locale, 'pages')} / {stats.scenes} {t(locale, 'scenes')} / {stats.words} {t(locale, 'words')}</span>
      </footer>
    </main>
  )
}

function Field(props: { label: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <label className="field">
      <span>
        {props.icon}
        {props.label}
      </span>
      {props.children}
    </label>
  )
}

function IconButton(props: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="icon-button" title={props.label} aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  )
}

function CommandButton(props: { label: string; children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`command-button ${props.className ?? ''}`} title={props.label} onClick={props.onClick}>
      {props.children}
      <span>{props.label}</span>
    </button>
  )
}

function TabButton(props: { active: boolean; label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={props.active ? 'active' : ''} onClick={props.onClick}>
      {props.children}
      <span>{props.label}</span>
    </button>
  )
}

function PanelTitle(props: { icon: ReactNode; title: string }) {
  return (
    <h2>
      {props.icon}
      {props.title}
    </h2>
  )
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  )
}

function MetricRow(props: { label: string; value: string | number }) {
  return (
    <div className="metric-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function ExportTile(props: { icon: ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" className="export-tile" onClick={props.onClick}>
      {props.icon}
      <span>{props.title}</span>
    </button>
  )
}

type CommandItem = {
  id: string
  label: string
  detail: string
  keywords?: string[]
  shortcut?: ShortcutId
  action: () => void
}

function CommandPalette({ commands, locale, shortcuts, onClose }: { commands: CommandItem[]; locale: UiLocale; shortcuts: Record<ShortcutId, ShortcutDefinition>; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const filtered = commands.filter((command) => matchesCommandItem(command, query, command.shortcut ? formatShortcut(shortcuts[command.shortcut]) : ''))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function runCommand(command: CommandItem) {
    command.action()
    onClose()
  }

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="command-title">
      <section className="command-palette">
        <header>
          <h2 id="command-title">
            <Search size={17} aria-hidden="true" />
            {t(locale, 'commandPalette')}
          </h2>
          <IconButton label={t(locale, 'close')} onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <input autoFocus value={query} placeholder={t(locale, 'commandPlaceholder')} onChange={(event) => setQuery(event.target.value)} />
        <div className="command-list">
          {filtered.map((command) => (
            <button type="button" key={command.id} onClick={() => runCommand(command)}>
              <strong>
                {command.label}
                {command.shortcut && <kbd>{formatShortcut(shortcuts[command.shortcut])}</kbd>}
              </strong>
              <span>{command.detail}</span>
            </button>
          ))}
          {filtered.length === 0 && <p>{t(locale, 'noCommandMatches')}</p>}
        </div>
      </section>
    </div>
  )
}

function ElementContextMenu(props: {
  element?: ScriptElement
  locale: UiLocale
  position: ContextMenuState
  onAddAbove: (type: ScriptElementType) => void
  onAddBelow: (type: ScriptElementType) => void
  onAddReview: () => void
  onChangeType: (type: ScriptElementType) => void
  onClose: () => void
  onDelete: () => void
  onDeleteScene: () => void
  onMergePrevious: () => void
  onSplit: () => void
}) {
  if (!props.element) {
    return null
  }

  return (
    <div className="element-context-menu" style={{ left: props.position.x, top: props.position.y }} onClick={(event) => event.stopPropagation()}>
      <select value={props.element.type} onChange={(event) => props.onChangeType(event.target.value as ScriptElementType)}>
        {elementOrder.map((type) => (
          <option key={type} value={type}>
            {getElementLabel(type, props.locale)}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => props.onAddAbove(props.element?.type ?? 'action')}>
        {ux(props.locale, 'addAbove')}
      </button>
      <button type="button" onClick={() => props.onAddBelow(props.element?.type ?? 'action')}>
        {ux(props.locale, 'addBelow')}
      </button>
      <button type="button" onClick={props.onSplit}>
        {ux(props.locale, 'splitParagraph')}
      </button>
      <button type="button" onClick={props.onMergePrevious}>
        {ux(props.locale, 'mergePrevious')}
      </button>
      <button type="button" onClick={props.onAddReview}>
        {ux(props.locale, 'addReviewNote')}
      </button>
      <button type="button" className="danger" onClick={props.onDelete}>
        {t(props.locale, 'deleteParagraph')}
      </button>
      <button type="button" className="danger" onClick={props.onDeleteScene}>
        {t(props.locale, 'deleteSceneBlock')}
      </button>
      <button type="button" onClick={props.onClose}>
        {t(props.locale, 'close')}
      </button>
    </div>
  )
}

function QuickJumpDialog(props: {
  characters: Array<{ id: string; name: string; count: number }>
  locale: UiLocale
  scenes: SceneSummary[]
  transient: boolean
  onClose: () => void
  onJump: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const items = [
    ...props.scenes.map((scene) => {
      const parsed = parseSceneHeading(stripSceneNumber(scene.title))
      return {
        id: scene.id,
        kind: t(props.locale, 'scenes'),
        title: `${String(scene.index + 1).padStart(2, '0')} ${scene.title}`,
        detail: `${cleanUnknownValue(parsed.location)} / ${getSceneTimeToken(parsed.time, 'zh-CN')} / ${scene.characters.join('、')}`,
      }
    }),
    ...props.characters.map((character) => ({
      id: character.id,
      kind: t(props.locale, 'characters'),
      title: character.name,
      detail: `${character.count} ${t(props.locale, 'dialogueUnits')}`,
    })),
  ]
  const filtered = items.filter((item) => matchesSearchText(`${item.kind} ${item.title} ${item.detail}`, query)).slice(0, 28)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [props])

  return (
    <div className={props.transient ? 'preferences-backdrop quick-jump-peek' : 'preferences-backdrop'} role="dialog" aria-modal="true" aria-labelledby="quick-jump-title">
      <section className={props.transient ? 'quick-jump-dialog transient' : 'quick-jump-dialog'}>
        <header>
          <h2 id="quick-jump-title">
            <Search size={17} aria-hidden="true" />
            {ux(props.locale, 'quickJump')}
          </h2>
          {!props.transient && (
            <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          )}
        </header>
        {!props.transient && <input autoFocus value={query} placeholder={ux(props.locale, 'quickJumpPlaceholder')} onChange={(event) => setQuery(event.target.value)} />}
        <div className="quick-jump-list">
          {filtered.map((item) => (
            <button type="button" key={`${item.kind}-${item.id}`} onClick={() => props.onJump(item.id)}>
              <span>{item.kind}</span>
              <strong>{item.title}</strong>
              <small>{item.detail || '-'}</small>
            </button>
          ))}
          {filtered.length === 0 && <p>{t(props.locale, 'noCommandMatches')}</p>}
        </div>
      </section>
    </div>
  )
}

function ShortcutPreferencesDialog(props: {
  locale: UiLocale
  settings: ShortcutSettings
  shortcuts: Record<ShortcutId, ShortcutDefinition>
  onChange: (settings: ShortcutSettings) => void
  onClose: () => void
}) {
  const [recordingId, setRecordingId] = useState<ShortcutId>()
  const shortcutIds = Object.keys(keyboardShortcuts) as ShortcutId[]

  useEffect(() => {
    if (!recordingId) {
      return
    }

    const capture = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecordingId(undefined)
        return
      }

      props.onChange({
        profile: props.settings.profile,
        overrides: {
          ...props.settings.overrides,
          [recordingId]: shortcutFromKeyboardEvent(recordingId, event),
        },
      })
      setRecordingId(undefined)
    }

    window.addEventListener('keydown', capture, true)
    return () => window.removeEventListener('keydown', capture, true)
  }, [props, recordingId])

  function applyProfile(profile: ShortcutProfile) {
    props.onChange(createShortcutSettings(profile))
  }

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
      <section className="shortcut-dialog">
        <header>
          <h2 id="shortcut-title">
            <SlidersHorizontal size={17} aria-hidden="true" />
            {ux(props.locale, 'shortcutPreferences')}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="shortcut-profiles">
          {(['finalDraft', 'chinese', 'minimal'] as ShortcutProfile[]).map((profile) => (
            <button type="button" className={props.settings.profile === profile ? 'active' : ''} key={profile} onClick={() => applyProfile(profile)}>
              {getShortcutProfileLabel(profile, props.locale)}
            </button>
          ))}
        </div>
        <div className="shortcut-list">
          {shortcutIds.map((id) => (
            <div className="shortcut-row" key={id}>
              <span>{getShortcutLabel(id, props.locale)}</span>
              <button type="button" onClick={() => setRecordingId(id)}>
                {recordingId === id ? ux(props.locale, 'pressShortcut') : formatShortcut(props.shortcuts[id])}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SceneMapDialog(props: { locale: UiLocale; scenes: SceneSummary[]; onClose: () => void; onJump: (id: string) => void }) {
  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="scene-map-title">
      <section className="scene-map-dialog">
        <header>
          <h2 id="scene-map-title">
            <ListTree size={17} aria-hidden="true" />
            {ux(props.locale, 'sceneMap')}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="scene-map-list">
          {props.scenes.map((scene) => (
            <button type="button" key={scene.id} onClick={() => props.onJump(scene.id)}>
              <span>{String(scene.index + 1).padStart(2, '0')}</span>
              <strong>{scene.title}</strong>
              <small>
                {ux(props.locale, 'page')} {scene.page} / {scene.lineCount} {ux(props.locale, 'lines')} / {scene.characters.slice(0, 4).join(' / ') || '-'}
              </small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function ProjectHealthDialog(props: {
  locale: UiLocale
  report: HealthReport
  stats: { pages: number; scenes: number; characters: number; dialogues: number; words: number; chars: number }
  onClose: () => void
}) {
  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="health-title">
      <section className="health-dialog">
        <header>
          <h2 id="health-title">
            <BarChart3 size={17} aria-hidden="true" />
            {ux(props.locale, 'projectHealth')}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="health-grid">
          <Metric label={t(props.locale, 'pages')} value={props.stats.pages} />
          <Metric label={t(props.locale, 'scenes')} value={props.stats.scenes} />
          <Metric label={t(props.locale, 'characters')} value={props.stats.characters} />
          <Metric label={ux(props.locale, 'dialogueRatio')} value={`${Math.round(props.report.dialogueRatio * 100)}%`} />
          <Metric label={ux(props.locale, 'averageScene')} value={`${Math.round(props.report.averageSceneLines)} ${ux(props.locale, 'lines')}`} />
          <Metric label={t(props.locale, 'words')} value={props.stats.words} />
        </div>
        <section className="health-section">
          <PanelTitle icon={<ListTree size={17} aria-hidden="true" />} title={ux(props.locale, 'longestScenes')} />
          <div className="compact-list">
            {props.report.longestScenes.map((scene) => (
              <div key={scene.id}>
                <strong>{scene.title}</strong>
                <span>{scene.lineCount} {ux(props.locale, 'lines')} / {ux(props.locale, 'page')} {scene.page}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="health-section">
          <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={ux(props.locale, 'warnings')} />
          <div className="compact-list">
            {(props.report.warnings.length ? props.report.warnings : [ux(props.locale, 'checksPassed')]).map((warning) => (
              <div key={warning}>
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}

function SceneBoardDialog(props: {
  cards: SceneBoardCard[]
  locale: UiLocale
  onClose: () => void
  onJump: (id: string) => void
  onMoveScene: (sceneId: string, targetSceneId: string) => void
}) {
  const [dragId, setDragId] = useState<string>()

  return (
    <ToolDialog title={ux(props.locale, 'sceneBoard')} icon={<LayoutTemplate size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="scene-board-grid">
        {props.cards.map((card) => (
          <article
            className="scene-board-card"
            draggable
            key={card.id}
            onDragStart={() => setDragId(card.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (dragId) {
                props.onMoveScene(dragId, card.id)
              }
              setDragId(undefined)
            }}
          >
            <button type="button" onClick={() => props.onJump(card.id)}>
              <span>{String(card.index + 1).padStart(2, '0')}</span>
              <strong>{card.title}</strong>
            </button>
            <small>{card.location} / {card.time} / {ux(props.locale, 'page')} {card.page}</small>
            <p>{card.summary}</p>
            <em>{card.characters.slice(0, 5).join(' / ') || '-'}</em>
          </article>
        ))}
      </div>
    </ToolDialog>
  )
}

function CharacterArcsDialog(props: { arcs: CharacterArc[]; locale: UiLocale; onClose: () => void }) {
  return (
    <ToolDialog title={ux(props.locale, 'characterArcs')} icon={<Users size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="arc-list">
        {props.arcs.map((arc) => (
          <section className="arc-card" key={arc.name}>
            <header>
              <strong>{arc.name}</strong>
              <span>{arc.count} / {ux(props.locale, 'page')} {arc.firstPage}-{arc.lastPage}</span>
            </header>
            <div className="arc-timeline">
              {arc.scenes.map((scene) => (
                <div key={`${arc.name}-${scene.title}-${scene.page}`}>
                  <span>{ux(props.locale, 'page')} {scene.page}</span>
                  <strong>{scene.title}</strong>
                  <p>{scene.beat}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ToolDialog>
  )
}

function ContinuityDialog(props: { issues: ContinuityIssue[]; locale: UiLocale; onClose: () => void }) {
  const issues = props.issues.length ? props.issues : [{ level: 'pass' as AuditLevel, title: ux(props.locale, 'checksPassed'), detail: ux(props.locale, 'checksPassed') }]
  return (
    <ToolDialog title={ux(props.locale, 'continuityCheck')} icon={<ClipboardList size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose}>
      <div className="audit-list tool-list">
        {issues.map((issue, index) => (
          <div className={`audit-item ${issue.level}`} key={`${issue.title}-${index}`}>
            <strong>{issue.title}</strong>
            <span>{issue.detail}</span>
          </div>
        ))}
      </div>
    </ToolDialog>
  )
}

function RevisionCompareDialog(props: { diffs: RevisionDiff[]; locale: UiLocale; onClose: () => void }) {
  return (
    <ToolDialog title={ux(props.locale, 'visualRevisionCompare')} icon={<ClipboardList size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="revision-compare">
        {(props.diffs.length ? props.diffs : [{ id: 'none', type: 'none' as RevisionState, label: ux(props.locale, 'checksPassed'), before: '', after: '' }]).map((diff) => (
          <article className={`revision-diff ${diff.type}`} key={diff.id}>
            <header>
              <strong>{diff.label}</strong>
              <span>{diff.type}</span>
            </header>
            <pre>{diff.before || '-'}</pre>
            <pre>{diff.after || '-'}</pre>
          </article>
        ))}
      </div>
    </ToolDialog>
  )
}

function BreakdownDialog(props: { rows: BreakdownRow[]; locale: UiLocale; onClose: () => void; onExport: () => void }) {
  return (
    <ToolDialog title={ux(props.locale, 'shootingBreakdown')} icon={<BarChart3 size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="dialog-actions compact-actions">
        <button type="button" className="primary-button" onClick={props.onExport}>
          {ux(props.locale, 'exportCsv')}
        </button>
      </div>
      <div className="breakdown-table">
        <div className="breakdown-head">
          <span>{t(props.locale, 'scenes')}</span>
          <span>{t(props.locale, 'characters')}</span>
          <span>{ux(props.locale, 'projectLibrary')}</span>
          <span>{ux(props.locale, 'warnings')}</span>
        </div>
        {props.rows.map((row) => (
          <div className="breakdown-row" key={`${row.scene}-${row.page}`}>
            <strong>{row.scene}<small>{row.location} / {row.time} / {ux(props.locale, 'page')} {row.page}</small></strong>
            <span>{row.characters.join(' / ') || '-'}</span>
            <span>{row.props.join(' / ') || '-'}</span>
            <span>{[...row.vfx, ...row.vehicles, ...row.extras, ...row.costumes].join(' / ') || '-'}</span>
          </div>
        ))}
      </div>
    </ToolDialog>
  )
}

function SeriesDialog(props: { project: ScriptProject; locale: UiLocale; onClose: () => void; onAddCurrentEpisode: () => void; onExport: () => void }) {
  const episodes = props.project.series?.episodes ?? []
  return (
    <ToolDialog title={ux(props.locale, 'seriesMode')} icon={<BookOpen size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose}>
      <div className="inline-actions tool-actions">
        <button type="button" className="text-button" onClick={props.onAddCurrentEpisode}>
          {ux(props.locale, 'addCurrentEpisode')}
        </button>
        <button type="button" className="text-button" onClick={props.onExport}>
          {ux(props.locale, 'exportSeriesBible')}
        </button>
      </div>
      <div className="compact-list">
        {episodes.map((episode, index) => (
          <div key={episode.id}>
            <strong>{index + 1}. {episode.title}</strong>
            <span>{episode.pages} {t(props.locale, 'pages')} / {episode.scenes} {t(props.locale, 'scenes')} / {episode.characters.slice(0, 3).join(' / ')}</span>
          </div>
        ))}
        {episodes.length === 0 && <div><span>{ux(props.locale, 'addCurrentEpisode')}</span></div>}
      </div>
    </ToolDialog>
  )
}

function ProjectLibraryDialog(props: { library: ProjectLibrary; locale: UiLocale; onClose: () => void; onRename: (from: string, to: string) => void }) {
  const renderItems = (title: string, items: Array<{ name: string; count: number }>) => (
    <section className="library-section">
      <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={title} />
      <div className="compact-list">
        {items.map((item) => (
          <div key={`${title}-${item.name}`}>
            <strong>{item.name}</strong>
            <span>{item.count}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const nextName = window.prompt(ux(props.locale, 'renameAll'), item.name)
                if (nextName) {
                  props.onRename(item.name, nextName)
                }
              }}
            >
              {ux(props.locale, 'renameAll')}
            </button>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <ToolDialog title={ux(props.locale, 'projectLibrary')} icon={<Users size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="library-grid">
        {renderItems(t(props.locale, 'characters'), props.library.characters)}
        {renderItems(t(props.locale, 'scenes'), props.library.locations)}
        {renderItems(ux(props.locale, 'projectLibrary'), props.library.props)}
      </div>
    </ToolDialog>
  )
}

function ReviewDialog(props: {
  elements: ScriptElement[]
  locale: UiLocale
  notes: ReviewNote[]
  selectedId: string
  onAddNote: (elementId: string, text: string, category: ReviewNoteCategory) => void
  onClose: () => void
  onDeleteNote: (noteId: string) => void
  onExportReviewPdf: (watermark: string) => void
  onJump: (id: string) => void
  onToggleNote: (noteId: string) => void
}) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<ReviewNoteCategory>('writer')
  const [watermark, setWatermark] = useState('审稿版')
  const selectedElement = props.elements.find((element) => element.id === props.selectedId)
  const sortedNotes = [...props.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  function addNote() {
    props.onAddNote(props.selectedId, text, category)
    setText('')
  }

  return (
    <ToolDialog title={ux(props.locale, 'reviewMode')} icon={<ClipboardList size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="review-layout">
        <section className="review-compose">
          <PanelTitle icon={<FileText size={17} aria-hidden="true" />} title={ux(props.locale, 'addReviewNote')} />
          <p className="muted">{selectedElement?.text || t(props.locale, 'noSelection')}</p>
          <Field label={t(props.locale, 'elementType')}>
            <select value={category} onChange={(event) => setCategory(event.target.value as ReviewNoteCategory)}>
              {reviewCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label[props.locale]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ux(props.locale, 'addReviewNote')}>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <button type="button" className="primary-button" onClick={addNote}>
            {ux(props.locale, 'addReviewNote')}
          </button>
          <div className="review-watermark">
            <Field label={ux(props.locale, 'reviewWatermark')}>
              <input value={watermark} onChange={(event) => setWatermark(event.target.value)} />
            </Field>
            <button type="button" className="text-button" onClick={() => props.onExportReviewPdf(watermark)}>
              {ux(props.locale, 'reviewPdf')}
            </button>
          </div>
        </section>
        <section className="review-list">
          <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={`${sortedNotes.filter((note) => !note.resolved).length} ${ux(props.locale, 'unresolvedNotes')}`} />
          <div className="compact-list review-notes">
            {sortedNotes.map((note) => {
              const element = props.elements.find((item) => item.id === note.elementId)
              const categoryLabel = reviewCategories.find((item) => item.id === note.category)?.label[props.locale] ?? note.category
              return (
                <div className={note.resolved ? 'review-note resolved' : 'review-note'} key={note.id}>
                  <strong>{categoryLabel}</strong>
                  <span>{note.text}</span>
                  <small>{element?.text.slice(0, 72) || '已删除段落'} / {new Date(note.createdAt).toLocaleString('zh-CN')}</small>
                  <div className="inline-actions">
                    {element && (
                      <button type="button" className="text-button" onClick={() => props.onJump(element.id)}>
                        {t(props.locale, 'position')}
                      </button>
                    )}
                    <button type="button" className="text-button" onClick={() => props.onToggleNote(note.id)}>
                      {note.resolved ? '重新打开' : '标记解决'}
                    </button>
                    <button type="button" className="text-button danger" onClick={() => props.onDeleteNote(note.id)}>
                      {t(props.locale, 'delete')}
                    </button>
                  </div>
                </div>
              )
            })}
            {sortedNotes.length === 0 && <div><span>{ux(props.locale, 'reviewMode')}</span></div>}
          </div>
        </section>
      </div>
    </ToolDialog>
  )
}

function SidesDialog(props: { characters: string[]; locale: UiLocale; project: ScriptProject; onClose: () => void; onExport: (characterName: string) => void }) {
  const [selectedCharacter, setSelectedCharacter] = useState(props.characters[0] ?? '')
  const preview = selectedCharacter ? buildCharacterSides(props.project, selectedCharacter) : ''

  return (
    <ToolDialog title={ux(props.locale, 'characterSides')} icon={<Users size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="sides-layout">
        <aside className="sides-list">
          {props.characters.map((character) => (
            <button type="button" className={character === selectedCharacter ? 'active' : ''} key={character} onClick={() => setSelectedCharacter(character)}>
              {character}
            </button>
          ))}
          {props.characters.length === 0 && <p className="muted">{t(props.locale, 'characters')}</p>}
        </aside>
        <section className="sides-preview">
          <div className="dialog-actions compact-actions">
            <button type="button" className="primary-button" disabled={!selectedCharacter} onClick={() => props.onExport(selectedCharacter)}>
              {ux(props.locale, 'exportSides')}
            </button>
          </div>
          <pre>{preview || ux(props.locale, 'characterSides')}</pre>
        </section>
      </div>
    </ToolDialog>
  )
}

function DepartmentPackageDialog(props: {
  locale: UiLocale
  project: ScriptProject
  rows: BreakdownRow[]
  library: ProjectLibrary
  onClose: () => void
  onExport: (department: DepartmentId) => void
}) {
  const [department, setDepartment] = useState<DepartmentId>('director')
  const preview = buildDepartmentPackage(props.project, department, props.rows, props.library)

  return (
    <ToolDialog title={ux(props.locale, 'departmentPackage')} icon={<FileDown size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="department-layout">
        <aside className="department-list">
          {departmentPackages.map((item) => (
            <button type="button" className={item.id === department ? 'active' : ''} key={item.id} onClick={() => setDepartment(item.id)}>
              <strong>{item.label[props.locale]}</strong>
              <span>{item.detail[props.locale]}</span>
            </button>
          ))}
        </aside>
        <section className="department-preview">
          <div className="dialog-actions compact-actions">
            <button type="button" className="primary-button" onClick={() => props.onExport(department)}>
              {t(props.locale, 'exportWork')}
            </button>
          </div>
          <pre>{preview}</pre>
        </section>
      </div>
    </ToolDialog>
  )
}

function VersionTimelineDialog(props: {
  locale: UiLocale
  autoSnapshotIds: string[]
  snapshots: VersionSnapshot[]
  onClose: () => void
  onDelete: (snapshotId: string) => void
  onRestore: (snapshotId: string) => void
  onRestoreScene: (snapshotId: string) => void
  onSave: (note: string) => void
}) {
  const [note, setNote] = useState('')

  function save() {
    props.onSave(note.trim() || '手动版本')
    setNote('')
  }

  return (
    <ToolDialog title={ux(props.locale, 'versionTimeline')} icon={<BookOpen size={17} aria-hidden="true" />} locale={props.locale} onClose={props.onClose} wide>
      <div className="timeline-compose">
        <Field label={ux(props.locale, 'saveTimelineSnapshot')}>
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <button type="button" className="primary-button" onClick={save}>
          {ux(props.locale, 'saveTimelineSnapshot')}
        </button>
      </div>
      <div className="timeline-list">
        {props.snapshots.map((snapshot) => (
          <article className="timeline-item" key={snapshot.id}>
            <header>
              <strong>
                {props.autoSnapshotIds.includes(snapshot.id) ? ux(props.locale, 'autoRecovery') : ux(props.locale, 'manualVersion')} / {snapshot.note || snapshot.title}
              </strong>
              <span>{new Date(snapshot.createdAt).toLocaleString('zh-CN')}</span>
            </header>
            <p>{snapshot.elements.length} {ux(props.locale, 'elements')}</p>
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => props.onRestore(snapshot.id)}>
                {ux(props.locale, 'restoreVersion')}
              </button>
              <button type="button" className="text-button" onClick={() => props.onRestoreScene(snapshot.id)}>
                {ux(props.locale, 'restoreScene')}
              </button>
              <button type="button" className="text-button danger" onClick={() => props.onDelete(snapshot.id)}>
                {ux(props.locale, 'deleteVersion')}
              </button>
            </div>
          </article>
        ))}
        {props.snapshots.length === 0 && <p className="muted">{ux(props.locale, 'saveTimelineSnapshot')}</p>}
      </div>
    </ToolDialog>
  )
}

type TutorialTab = 'intro' | 'format' | 'examples'

function TutorialCenterDialog(props: { locale: UiLocale; onClose: () => void; onInsertExample: (example: HollywoodExample) => void }) {
  const [tab, setTab] = useState<TutorialTab>('intro')
  const [lessonId, setLessonId] = useState(softwareLessons[0].id)
  const [ruleId, setRuleId] = useState(hollywoodFormatRules[0].id)
  const [exampleId, setExampleId] = useState(hollywoodExamples[0].id)
  const lesson = softwareLessons.find((item) => item.id === lessonId) ?? softwareLessons[0]
  const rule = hollywoodFormatRules.find((item) => item.id === ruleId) ?? hollywoodFormatRules[0]
  const example = hollywoodExamples.find((item) => item.id === exampleId) ?? hollywoodExamples[0]

  return (
    <ToolDialog
      title={ux(props.locale, 'tutorialCenter')}
      icon={<GraduationCap size={18} aria-hidden="true" />}
      locale={props.locale}
      onClose={props.onClose}
      className="tutorial-dialog"
      wide
    >
      <div className="tutorial-center">
        <div className="tutorial-tabs" role="tablist" aria-label={ux(props.locale, 'tutorialCenter')}>
          <button type="button" role="tab" aria-selected={tab === 'intro'} className={tab === 'intro' ? 'active' : ''} onClick={() => setTab('intro')}>
            {ux(props.locale, 'tutorialIntro')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'format'} className={tab === 'format' ? 'active' : ''} onClick={() => setTab('format')}>
            {ux(props.locale, 'tutorialFormat')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'examples'} className={tab === 'examples' ? 'active' : ''} onClick={() => setTab('examples')}>
            {ux(props.locale, 'tutorialExamples')}
          </button>
        </div>

        {tab === 'intro' && (
          <div className="tutorial-layout">
            <nav className="tutorial-nav" aria-label={ux(props.locale, 'tutorialIntro')}>
              {softwareLessons.map((item) => (
                <button key={item.id} type="button" aria-current={item.id === lesson.id ? 'page' : undefined} className={item.id === lesson.id ? 'active' : ''} onClick={() => setLessonId(item.id)}>
                  <span>{item.title}</span>
                  <small>{item.summary}</small>
                </button>
              ))}
            </nav>
            <article className="tutorial-article">
              <p className="tutorial-kicker">{ux(props.locale, 'tutorialIntro')}</p>
              <h3>{lesson.title}</h3>
              <p className="tutorial-summary">{lesson.summary}</p>
              <h4>{ux(props.locale, 'lessonSteps')}</h4>
              <ol className="tutorial-steps">
                {lesson.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              {lesson.shortcut && <p className="tutorial-shortcut">{lesson.shortcut}</p>}
            </article>
          </div>
        )}

        {tab === 'format' && (
          <div className="tutorial-layout">
            <nav className="tutorial-nav compact" aria-label={ux(props.locale, 'tutorialFormat')}>
              {hollywoodFormatRules.map((item) => (
                <button key={item.id} type="button" aria-current={item.id === rule.id ? 'page' : undefined} className={item.id === rule.id ? 'active' : ''} onClick={() => setRuleId(item.id)}>
                  <span>{item.title}</span>
                </button>
              ))}
            </nav>
            <article className="tutorial-article">
              <p className="tutorial-kicker">{ux(props.locale, 'tutorialFormat')}</p>
              <h3>{rule.title}</h3>
              <p className="tutorial-summary">{rule.detail}</p>
              <div className="tutorial-rule-grid">
                <section>
                  <h4>{ux(props.locale, 'recommended')}</h4>
                  <p>{rule.recommended}</p>
                </section>
                <section className="avoid">
                  <h4>{ux(props.locale, 'avoid')}</h4>
                  <p>{rule.avoid}</p>
                </section>
              </div>
              <p className="tutorial-source">{ux(props.locale, 'tutorialSources')}</p>
            </article>
          </div>
        )}

        {tab === 'examples' && (
          <div className="tutorial-layout example-layout">
            <nav className="tutorial-nav compact" aria-label={ux(props.locale, 'tutorialExamples')}>
              {hollywoodExamples.map((item) => (
                <button key={item.id} type="button" aria-current={item.id === example.id ? 'page' : undefined} className={item.id === example.id ? 'active' : ''} onClick={() => setExampleId(item.id)}>
                  <span>{item.title}</span>
                  <small>{item.focus}</small>
                </button>
              ))}
            </nav>
            <article className="tutorial-article example-article">
              <div className="tutorial-example-heading">
                <div>
                  <p className="tutorial-kicker">{ux(props.locale, 'exampleFocus')} · {example.focus}</p>
                  <h3>{example.title}</h3>
                  <p className="tutorial-summary">{example.summary}</p>
                </div>
                <button type="button" className="primary-button tutorial-insert" onClick={() => props.onInsertExample(example)}>
                  <Plus size={15} aria-hidden="true" />
                  {ux(props.locale, 'insertExample')}
                </button>
              </div>
              <div className="tutorial-example-body">
                <div className="tutorial-script-preview" aria-label={example.title}>
                  {example.elements.map((element, index) => (
                    <p key={`${element.type}-${index}`} className={`tutorial-script-element ${element.type}`}>
                      {element.text}
                    </p>
                  ))}
                </div>
                <ul className="tutorial-tips">
                  {example.tips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </div>
            </article>
          </div>
        )}
      </div>
    </ToolDialog>
  )
}

function ToolDialog(props: { title: string; icon: ReactNode; locale: UiLocale; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const className = ['tool-dialog', props.wide && 'wide', props.className].filter(Boolean).join(' ')

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-label={props.title}>
      <section className={className}>
        <header>
          <h2>
            {props.icon}
            {props.title}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="tool-dialog-body">{props.children}</div>
      </section>
    </div>
  )
}

function TitlePageDialog(props: {
  data: TitlePageData
  locale: UiLocale
  onChange: (patch: Partial<TitlePageData>) => void
  onClose: () => void
}) {
  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="title-page-dialog-title">
      <section className="preferences-dialog title-page-dialog">
        <header>
          <h2 id="title-page-dialog-title"><LayoutTemplate size={17} aria-hidden="true" />标题页</h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}><X size={16} aria-hidden="true" /></IconButton>
        </header>
        <div className="preferences-grid">
          <Field label="启用标题页"><input type="checkbox" checked={props.data.enabled} onChange={(event) => props.onChange({ enabled: event.target.checked })} /></Field>
          <Field label="剧名"><input autoFocus value={props.data.title} onChange={(event) => props.onChange({ title: event.target.value })} /></Field>
          <Field label="署名说明"><input value={props.data.credit} placeholder="编剧 / Written by" onChange={(event) => props.onChange({ credit: event.target.value })} /></Field>
          <Field label="作者"><input value={props.data.authors} onChange={(event) => props.onChange({ authors: event.target.value })} /></Field>
          <Field label="改编来源"><input value={props.data.basedOn} placeholder="根据……改编" onChange={(event) => props.onChange({ basedOn: event.target.value })} /></Field>
          <Field label="稿次日期"><input value={props.data.draftDate} placeholder="2026-07-13" onChange={(event) => props.onChange({ draftDate: event.target.value })} /></Field>
          <Field label="联系信息"><textarea rows={4} value={props.data.contact} onChange={(event) => props.onChange({ contact: event.target.value })} /></Field>
          <Field label="版权信息"><textarea rows={4} value={props.data.copyright} onChange={(event) => props.onChange({ copyright: event.target.value })} /></Field>
        </div>
        <div className="dialog-actions"><button type="button" className="primary-button" onClick={props.onClose}>{t(props.locale, 'done')}</button></div>
      </section>
    </div>
  )
}

function FormatPreviewDialog(props: {
  audit: FormatAuditItem[]
  format: ScriptFormat
  layout: LayoutResult
  locale: UiLocale
  project: ScriptProject
  revisionColor: RevisionColor
  revisionMode: boolean
  settings: ExportSettings
  sceneLockReference?: number
  pageLockReference?: number
  onApplyProfessionalFormat: () => string
  onClose: () => void
  onExport: () => void
  onJump: (elementId: string) => void
  onOpenTitlePage: () => void
  onSaveRevisionBaseline: () => void
  onSelectProfile: (profileId: ExportProfileId) => void
  onSetRevisionColor: (color: RevisionColor) => void
  onToggleRevision: () => void
  onUpdateSettings: (patch: Partial<ExportSettings>) => void
}) {
  const failing = props.audit.filter((item) => item.level !== 'pass')
  const criticalItems = getCriticalFormatIssues(props.audit)

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="format-preview-title">
      <section className="format-preview-dialog">
        <header>
          <h2 id="format-preview-title">
            <FileDown size={17} aria-hidden="true" />
            {ux(props.locale, 'professionalPreview')}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>
        <div className="format-preview-body">
          <aside className="preflight-panel">
            <section className="export-profile-controls">
              <PanelTitle icon={<LayoutTemplate size={17} aria-hidden="true" />} title="导出方案" />
              <label>
                <span>排版方案</span>
                <select value={props.settings.profileId} onChange={(event) => props.onSelectProfile(event.target.value as ExportProfileId)}>
                  {exportProfiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>{profile.label}</option>
                  ))}
                </select>
              </label>
              <small>{exportProfiles.find((profile) => profile.id === props.settings.profileId)?.detail}</small>
              <div className="export-toggle-grid">
                <label><input type="checkbox" checked={props.settings.includeTitlePage} onChange={(event) => props.onUpdateSettings({ includeTitlePage: event.target.checked })} />标题页</label>
                <label><input type="checkbox" checked={props.settings.moreContinued} onChange={(event) => props.onUpdateSettings({ moreContinued: event.target.checked })} />跨页续写</label>
                <label><input type="checkbox" checked={props.settings.sceneNumbers} onChange={(event) => props.onUpdateSettings({ sceneNumbers: event.target.checked })} />场号</label>
                <label><input type="checkbox" checked={props.settings.lockedPageLabels} onChange={(event) => props.onUpdateSettings({ lockedPageLabels: event.target.checked })} />锁页标签</label>
              </div>
              <label><span>页眉文字</span><input value={props.settings.headerText} onChange={(event) => props.onUpdateSettings({ headerText: event.target.value })} /></label>
              <label><span>页脚文字</span><input value={props.settings.footerText} onChange={(event) => props.onUpdateSettings({ footerText: event.target.value })} /></label>
              <button type="button" className="text-button" onClick={props.onOpenTitlePage}>
                <LayoutTemplate size={15} aria-hidden="true" />编辑标题页
              </button>
              {props.layout.warnings.map((warning) => <small className="layout-warning" key={warning}>{warning}</small>)}
            </section>
            <section className="export-check-strip">
              <PanelTitle icon={<FileDown size={17} aria-hidden="true" />} title={ux(props.locale, 'finalCheck')} />
              {criticalItems.map((item) => (
                <div className={`export-check-item ${item.level}`} key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </section>
            <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={ux(props.locale, failing.length ? 'checksNeedAttention' : 'checksPassed')} />
            <div className="audit-list">
              {props.audit.map((item) => (
                <button
                  type="button"
                  className={`audit-item ${item.level}${item.elementId ? ' locatable' : ''}`}
                  disabled={!item.elementId}
                  key={item.id}
                  onClick={() => item.elementId && props.onJump(item.elementId)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
            <div className="revision-controls">
              <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={ux(props.locale, 'revisionMode')} />
              <button type="button" className={props.revisionMode ? 'text-button active' : 'text-button'} onClick={props.onToggleRevision}>
                {ux(props.locale, 'revisionMode')}
              </button>
              <div className="color-row">
                {revisionColors.map((color) => (
                  <button
                    type="button"
                    className={props.revisionColor === color.id ? `revision-swatch ${color.id} active` : `revision-swatch ${color.id}`}
                    key={color.id}
                    title={color.label[props.locale]}
                    aria-label={color.label[props.locale]}
                    onClick={() => props.onSetRevisionColor(color.id)}
                  />
                ))}
              </div>
              <button type="button" className="text-button" onClick={props.onSaveRevisionBaseline}>
                {t(props.locale, 'saveRevisionSnapshot')}
              </button>
              <small>
                {ux(props.locale, 'lockPages')}: {props.pageLockReference ?? '-'} / {ux(props.locale, 'lockScenes')}: {props.sceneLockReference ?? '-'}
              </small>
            </div>
            <div className="dialog-actions compact-actions">
              <button type="button" className="text-button" onClick={props.onApplyProfessionalFormat}>
                {ux(props.locale, 'oneClickFix')}
              </button>
              <button type="button" className="primary-button" onClick={props.onExport}>
                {ux(props.locale, 'exportAfterCheck')}
              </button>
            </div>
          </aside>
          <section className="preview-pages">
            <PanelTitle icon={<FileText size={17} aria-hidden="true" />} title={ux(props.locale, 'previewPages')} />
            <div className="page-stack preview-stack">
              {props.layout.pages.map((page) => (
                <MeasuredScriptPage
                  key={`preview-${page.index}`}
                  format={props.format}
                  lineHeight={props.layout.lineHeight}
                  locale={props.locale}
                  page={page}
                  project={props.project}
                  sceneNumbers={props.settings.sceneNumbers}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

function AssistiveToolsDialog(props: {
  locale: UiLocale
  onApplyCorrections: (source: string) => string
  onApplyProfessionalFormat: () => string
  onAddCurrentEpisode: () => void
  onClearSceneNumbers: () => string
  onClose: () => void
  onCountCharacters: () => string
  onConvertTerms: (style: TermStyle) => string
  onExportBreakdown: () => Promise<void>
  onExportFountain: () => Promise<void>
  onExportMarkdown: () => Promise<void>
  onExportSceneOutline: () => Promise<void>
  onOpenHealth: () => void
  onOpenPreview: () => void
  onOpenSceneBoard: () => void
  onOpenCharacterArcs: () => void
  onOpenContinuity: () => void
  onOpenRevisionCompare: () => void
  onOpenBreakdown: () => void
  onOpenDepartmentPackage: () => void
  onOpenLibrary: () => void
  onOpenReview: () => void
  onOpenSeries: () => void
  onOpenSides: () => void
  onOpenTimeline: () => void
  onExportReviewPdf: () => Promise<void>
  onImportWordTxt: () => Promise<string>
  onJumpToElement: (id: string) => void
  onLockProduction: () => string
  onMoveSceneBlock: (sceneId: string, direction: -1 | 1) => void
  onProductionReport: () => string
  onRenumberScenes: () => string
  onRunScriptDoctor: () => string
  onSaveRevisionSnapshot: () => string
  onCompareRevisionSnapshot: () => string
  onReplaceAll: (findText: string, replacement: string) => string
  scenes: ScriptElement[]
  stats: { pages: number; scenes: number; characters: number; dialogues: number; words: number; chars: number }
}) {
  const [corrections, setCorrections] = useState(defaultCorrectionPairsText)
  const [findText, setFindText] = useState('')
  const [replacement, setReplacement] = useState('')
  const [result, setResult] = useState('尚无执行结果。')
  const [busy, setBusy] = useState(false)

  async function runImport() {
    setBusy(true)
    try {
      setResult(await props.onImportWordTxt())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="assistive-title">
      <section className="assistive-dialog">
        <header>
          <h2 id="assistive-title">
            <Sparkles size={17} aria-hidden="true" />
            {t(props.locale, 'assistiveTools')}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="assistive-grid">
          <section className="assistive-card">
            <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={t(props.locale, 'scriptDoctor')} />
            <button type="button" className="text-button" onClick={() => setResult(props.onRunScriptDoctor())}>
              {t(props.locale, 'runScriptDoctor')}
            </button>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<FileDown size={17} aria-hidden="true" />} title={ux(props.locale, 'formatPreflight')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={props.onOpenPreview}>
                {ux(props.locale, 'professionalPreview')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onApplyProfessionalFormat())}>
                {ux(props.locale, 'oneClickFix')}
              </button>
            </div>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<BarChart3 size={17} aria-hidden="true" />} title={ux(props.locale, 'projectHealth')} />
            <button type="button" className="text-button" onClick={props.onOpenHealth}>
              {ux(props.locale, 'projectHealth')}
            </button>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<Languages size={17} aria-hidden="true" />} title={t(props.locale, 'termConversion')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => setResult(props.onConvertTerms('zh-CN'))}>
                {t(props.locale, 'convertToSimplified')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onConvertTerms('en-US'))}>
                {t(props.locale, 'convertToEnglish')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onConvertTerms('zh-TW'))}>
                {t(props.locale, 'convertToTraditional')}
              </button>
            </div>
          </section>

          <section className="assistive-card wide">
            <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={t(props.locale, 'typoCorrection')} />
            <Field label={t(props.locale, 'correctionPairs')}>
              <textarea value={corrections} onChange={(event) => setCorrections(event.target.value)} />
            </Field>
            <button type="button" className="text-button" onClick={() => setResult(props.onApplyCorrections(corrections))}>
              {t(props.locale, 'applyCorrections')}
            </button>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<Search size={17} aria-hidden="true" />} title={t(props.locale, 'replaceText')} />
            <Field label={t(props.locale, 'findText')}>
              <input value={findText} onChange={(event) => setFindText(event.target.value)} />
            </Field>
            <Field label={t(props.locale, 'replaceWith')}>
              <input value={replacement} onChange={(event) => setReplacement(event.target.value)} />
            </Field>
            <button type="button" className="text-button" onClick={() => setResult(props.onReplaceAll(findText, replacement))}>
              {t(props.locale, 'replaceAll')}
            </button>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<Users size={17} aria-hidden="true" />} title={t(props.locale, 'characterSummary')} />
            <button type="button" className="text-button" onClick={() => setResult(props.onCountCharacters())}>
              {t(props.locale, 'countCharacters')}
            </button>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<Clapperboard size={17} aria-hidden="true" />} title={t(props.locale, 'sceneNumbers')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => setResult(props.onRenumberScenes())}>
                {t(props.locale, 'renumberScenes')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onClearSceneNumbers())}>
                {t(props.locale, 'clearSceneNumbers')}
              </button>
            </div>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<Upload size={17} aria-hidden="true" />} title={t(props.locale, 'importWordTxt')} />
            <button type="button" className="text-button" disabled={busy} onClick={runImport}>
              {busy ? t(props.locale, 'processing') : t(props.locale, 'importAsHollywood')}
            </button>
          </section>

          <section className="assistive-card structure-card wide">
            <PanelTitle icon={<ListTree size={17} aria-hidden="true" />} title={t(props.locale, 'structureMap')} />
            <div className="structure-map">
              {props.scenes.map((scene, index) => (
                <div className="structure-scene" key={scene.id}>
                  <button type="button" onClick={() => props.onJumpToElement(scene.id)}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{scene.text || '\u672a\u547d\u540d\u573a\u666f'}</strong>
                  </button>
                  <div>
                    <IconButton label={t(props.locale, 'moveUp')} onClick={() => props.onMoveSceneBlock(scene.id, -1)}>
                      <ArrowUp size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t(props.locale, 'moveDown')} onClick={() => props.onMoveSceneBlock(scene.id, 1)}>
                      <ArrowDown size={14} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<BarChart3 size={17} aria-hidden="true" />} title={t(props.locale, 'productionTools')} />
            <div className="tool-metrics">
              <Metric label={t(props.locale, 'scenes')} value={props.stats.scenes} />
              <Metric label={t(props.locale, 'characters')} value={props.stats.characters} />
              <Metric label={t(props.locale, 'pages')} value={props.stats.pages} />
            </div>
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => setResult(props.onProductionReport())}>
                {t(props.locale, 'productionReport')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onLockProduction())}>
                {ux(props.locale, 'productionLock')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onSaveRevisionSnapshot())}>
                {t(props.locale, 'saveRevisionSnapshot')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onCompareRevisionSnapshot())}>
                {t(props.locale, 'compareRevisionSnapshot')}
              </button>
            </div>
          </section>

          <section className="assistive-card wide">
            <PanelTitle icon={<LayoutTemplate size={17} aria-hidden="true" />} title={ux(props.locale, 'sceneBoard')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={props.onOpenSceneBoard}>
                {ux(props.locale, 'sceneBoard')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenCharacterArcs}>
                {ux(props.locale, 'characterArcs')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenContinuity}>
                {ux(props.locale, 'continuityCheck')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenRevisionCompare}>
                {ux(props.locale, 'visualRevisionCompare')}
              </button>
            </div>
          </section>

          <section className="assistive-card wide">
            <PanelTitle icon={<FileDown size={17} aria-hidden="true" />} title={ux(props.locale, 'departmentPackage')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => void props.onExportSceneOutline()}>
                {ux(props.locale, 'sceneOutline')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenBreakdown}>
                {ux(props.locale, 'shootingBreakdown')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenDepartmentPackage}>
                {ux(props.locale, 'departmentPackage')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenSides}>
                {ux(props.locale, 'characterSides')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenLibrary}>
                {ux(props.locale, 'projectLibrary')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenSeries}>
                {ux(props.locale, 'seriesMode')}
              </button>
            </div>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<ClipboardList size={17} aria-hidden="true" />} title={ux(props.locale, 'reviewMode')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={props.onOpenReview}>
                {ux(props.locale, 'reviewMode')}
              </button>
              <button type="button" className="text-button" onClick={() => void props.onExportReviewPdf()}>
                {ux(props.locale, 'reviewPdf')}
              </button>
              <button type="button" className="text-button" onClick={props.onOpenTimeline}>
                {ux(props.locale, 'versionTimeline')}
              </button>
            </div>
          </section>

          <section className="assistive-card">
            <PanelTitle icon={<FileText size={17} aria-hidden="true" />} title={ux(props.locale, 'markdownExport')} />
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => void props.onExportFountain()}>
                {ux(props.locale, 'fountainExport')}
              </button>
              <button type="button" className="text-button" onClick={() => void props.onExportMarkdown()}>
                {ux(props.locale, 'markdownExport')}
              </button>
              <button type="button" className="text-button" onClick={() => void props.onExportBreakdown()}>
                {ux(props.locale, 'exportCsv')}
              </button>
            </div>
          </section>
        </div>

        <section className="assistive-result">
          <PanelTitle icon={<FileText size={17} aria-hidden="true" />} title={t(props.locale, 'result')} />
          <pre>{result}</pre>
        </section>
      </section>
    </div>
  )
}

function PreferencesDialog(props: {
  fonts: string[]
  locale: UiLocale
  preferences: UserPreferences
  onApplyToProject: () => void
  onChange: (patch: Partial<UserPreferences>) => void
  onClose: () => void
  onReset: () => void
}) {
  const transitionOptions = getTransitionPresetOptions(props.preferences.scriptLanguage, props.locale)

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <section className="preferences-dialog">
        <header>
          <h2 id="preferences-title">
            <Settings size={17} aria-hidden="true" />
            {t(props.locale, 'preferences')}
          </h2>
          <IconButton label={t(props.locale, 'close')} onClick={props.onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="preferences-grid">
          <Field label={t(props.locale, 'defaultScriptLanguage')} icon={<Languages size={15} aria-hidden="true" />}>
            <select value={props.preferences.scriptLanguage} onChange={(event) => props.onChange({ scriptLanguage: event.target.value as AppLocale })}>
              {scriptLocaleOptions.map((value) => (
                <option key={value} value={value}>
                  {scriptLocaleNames[value][props.locale]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'termStyle')} icon={<Languages size={15} aria-hidden="true" />}>
            <select value={props.preferences.termStyle} onChange={(event) => props.onChange({ termStyle: event.target.value as TermStyle })}>
              {termStyleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'defaultScenePlace')}>
            <select value={props.preferences.defaultScenePlace} onChange={(event) => props.onChange({ defaultScenePlace: event.target.value as ScenePlaceId })}>
              {scenePlaceTerms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} / {getScenePlaceToken(item.id, props.preferences.termStyle)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'defaultSceneTime')}>
            <select value={props.preferences.defaultSceneTime} onChange={(event) => props.onChange({ defaultSceneTime: event.target.value as SceneTimeId })}>
              {sceneTimeTerms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} / {getSceneTimeToken(item.id, props.preferences.termStyle)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'defaultTransition')}>
            <select value={props.preferences.defaultTransition} onChange={(event) => props.onChange({ defaultTransition: event.target.value as UserPreferences['defaultTransition'] })}>
              {transitionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} / {option.text}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'defaultFormat')}>
            <select value={props.preferences.defaultFormatId} onChange={(event) => props.onChange({ defaultFormatId: event.target.value as ScriptFormatId })}>
              {scriptFormats.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.labels[props.locale]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'defaultFont')} icon={<Type size={15} aria-hidden="true" />}>
            <select value={props.preferences.defaultFontFamily} onChange={(event) => props.onChange({ defaultFontFamily: event.target.value })}>
              {props.fonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t(props.locale, 'defaultFontSize')}>
            <input
              type="number"
              min={8}
              max={24}
              value={props.preferences.defaultFontSize}
              onChange={(event) => props.onChange({ defaultFontSize: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={props.onReset}>
            {t(props.locale, 'resetDefaults')}
          </button>
          <button type="button" className="text-button" onClick={props.onApplyToProject}>
            {t(props.locale, 'applyToProject')}
          </button>
          <button type="button" className="primary-button" onClick={props.onClose}>
            {t(props.locale, 'done')}
          </button>
        </div>
        <p className="developer-credit">{developerCredit}</p>
      </section>
    </div>
  )
}

function ScriptPage(props: {
  page: ScriptElement[]
  pageNumber: number
  project: ScriptProject
  formatId: ScriptFormatId
  locale: UiLocale
}) {
  const format = getFormat(props.formatId)
  const pageStyle = {
    width: `${format.page.width}px`,
    minHeight: `${format.page.height}px`,
    padding: `${format.page.marginTop}px ${format.page.marginRight}px ${format.page.marginBottom}px ${format.page.marginLeft}px`,
    fontFamily: getScreenplayFontStack(props.project.fontFamily, format),
    fontSize: `${props.project.fontSize}pt`,
    lineHeight: `${getScreenplayLineHeight(props.project.fontSize)}px`,
  } satisfies CSSProperties

  return (
    <div className="page-frame">
      <span className="page-label">{t(props.locale, 'page', { n: props.pageNumber })}</span>
      <div className="script-page" style={pageStyle}>
        {props.page.map((element, elementIndex) => {
          const layout = resolveElementLayout(element, format)
          const text = layout.uppercase ? element.text.toUpperCase() : element.text
          const lines = wrapElementText({ text: text || ' ' }, layout, props.project.fontSize)
          const elementStyle = {
            marginLeft: `${layout.marginLeft}px`,
            width: `${layout.width}px`,
            textAlign: layout.align,
            marginTop: `${elementIndex === 0 ? 0 : layout.before}px`,
            marginBottom: `${layout.after}px`,
            fontWeight: layout.bold ? 700 : 400,
            fontStyle: layout.italic ? 'italic' : 'normal',
          } satisfies CSSProperties

          return (
            <p className={`script-element ${element.type}`} key={element.id} style={elementStyle}>
              {lines.map((line, lineIndex) => (
                <span className="script-line" key={`${element.id}-${lineIndex}`}>
                  {line || '\u00a0'}
                </span>
              ))}
            </p>
          )
        })}
      </div>
    </div>
  )
}

function MeasuredScriptPage(props: {
  format: ScriptFormat
  lineHeight: number
  locale: UiLocale
  page: LayoutPage
  project: ScriptProject
  sceneNumbers: boolean
}) {
  const sceneNumberById = new Map<string, string>()
  let sceneIndex = 0
  props.project.elements.forEach((element) => {
    if (element.type === 'scene') {
      sceneIndex += 1
      sceneNumberById.set(element.id, props.project.productionLock?.sceneNumbers?.[element.id] ?? String(sceneIndex))
    }
  })
  const pageStyle = {
    position: 'relative',
    width: `${props.format.page.width}px`,
    minHeight: `${props.format.page.height}px`,
    padding: 0,
    fontFamily: getScreenplayFontStack(props.project.fontFamily, props.format, props.project.language),
    fontSize: `${props.project.fontSize}pt`,
    lineHeight: `${props.lineHeight}px`,
  } satisfies CSSProperties

  return (
    <div className="page-frame">
      <span className="page-label">{t(props.locale, 'page', { n: props.page.label })}</span>
      <div className="script-page measured-page" style={pageStyle}>
        {props.page.blocks.map((block) => {
          const number = block.sourceId ? block.sceneNumber ?? sceneNumberById.get(block.sourceId) : undefined
          return (
            <p className={`script-element measured-element ${block.type}`} key={block.id} style={getMeasuredBlockStyle(block)}>
              {props.sceneNumbers && block.sourceType === 'scene' && number && <span className="preview-scene-number left">{number}</span>}
              {props.sceneNumbers && block.sourceType === 'scene' && number && <span className="preview-scene-number right">{number}</span>}
              {block.lines.map((line, lineIndex) => <span className="script-line" key={`${block.id}-${lineIndex}`}>{line || '\u00a0'}</span>)}
            </p>
          )
        })}
        {props.page.index > 1 && <span className="measured-page-number">{props.page.label}.</span>}
      </div>
    </div>
  )
}

function getMeasuredBlockStyle(block: PositionedBlock) {
  return {
    position: 'absolute',
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    margin: 0,
    textAlign: block.align,
    fontWeight: block.bold ? 700 : 400,
    fontStyle: block.italic ? 'italic' : 'normal',
  } satisfies CSSProperties
}

function extractCharacters(elements: ScriptElement[]) {
  const counts = new Map<string, { id: string; name: string; count: number }>()
  elements.forEach((element) => {
    if (element.type !== 'character') {
      return
    }

    const name = element.text.trim() || 'UNKNOWN'
    const key = name.toUpperCase()
    const current = counts.get(key)
    counts.set(key, {
      id: current?.id ?? element.id,
      name,
      count: (current?.count ?? 0) + 1,
    })
  })

  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function calculateStats(elements: ScriptElement[], pages: number) {
  const text = elements.map((element) => element.text).join('\n')
  const words = text.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]/g)?.length ?? 0
  return {
    pages,
    scenes: elements.filter((element) => element.type === 'scene').length,
    characters: extractCharacters(elements).length,
    dialogues: elements.filter((element) => element.type === 'dialogue').length,
    words,
    chars: Array.from(text.replace(/\s/g, '')).length,
  }
}

function countSceneDialogues(elements: ScriptElement[], sceneId: string) {
  const start = elements.findIndex((element) => element.id === sceneId)
  if (start < 0) {
    return 0
  }

  let count = 0
  for (let index = start + 1; index < elements.length; index += 1) {
    const element = elements[index]
    if (element.type === 'scene') {
      break
    }
    if (element.type === 'dialogue') {
      count += 1
    }
  }

  return count
}

function getDialogueBlockRanges(elements: ScriptElement[]) {
  const ranges: Array<{ ids: string[] }> = []
  elements.forEach((element, index) => {
    if (element.type !== 'character') return
    const ids = [element.id]
    let hasDialogue = false
    for (let cursor = index + 1; cursor < elements.length; cursor += 1) {
      const next = elements[cursor]
      if (next.type !== 'parenthetical' && next.type !== 'dialogue') break
      ids.push(next.id)
      if (next.type === 'dialogue') hasDialogue = true
    }
    if (hasDialogue) ranges.push({ ids })
  })
  return ranges
}

function summarizeScenes(elements: ScriptElement[], pages: ScriptElement[][], format: ReturnType<typeof getFormat>, fontSize: number): SceneSummary[] {
  const pageByElementId = new Map<string, number>()
  pages.forEach((page, pageIndex) => {
    page.forEach((element) => pageByElementId.set(element.id, pageIndex + 1))
  })

  return getSceneBlocks(elements).map((block, index) => {
    const characters = Array.from(
      new Set(
        block.elements
          .filter((element) => element.type === 'character')
          .map((element) => element.text.trim())
          .filter(Boolean),
      ),
    )
    const lineCount = block.elements.reduce((sum, element, elementIndex) => {
      const layout = resolveElementLayout(element, format)
      return sum + Math.ceil((elementIndex > 0 ? layout.before : 0) / getScreenplayLineHeight(fontSize)) + wrapElementText(element, layout, fontSize).length
    }, 0)

    return {
      id: block.scene.id,
      index,
      page: pageByElementId.get(block.scene.id) ?? 1,
      title: block.scene.text || '\u672a\u547d\u540d\u573a\u666f',
      characters,
      elementCount: block.elements.length,
      lineCount,
    }
  })
}

function auditProfessionalFormat(project: ScriptProject, format: ScriptFormat, fonts: string[], layoutResult?: LayoutResult): FormatAuditItem[] {
  const items: FormatAuditItem[] = []
  const hollywood = getFormat('hollywood')
  const settings = resolveExportSettings(project)
  const isUsProfile = settings.profileId === 'us-spec' || settings.profileId === 'us-production'
  const add = (id: string, ok: boolean, title: string, pass: string, fail: string, level: AuditLevel = 'error', elementId?: string) => {
    items.push({ id, level: ok ? 'pass' : level, title, detail: ok ? pass : fail, elementId: ok ? undefined : elementId })
  }

  add('format', project.formatId === 'hollywood', '\u7248\u5f0f', '\u5df2\u4f7f\u7528\u597d\u83b1\u575e\u6807\u51c6\u683c\u5f0f\u3002', '\u5efa\u8bae\u6539\u4e3a\u597d\u83b1\u575e\u6807\u51c6\u683c\u5f0f\u3002')
  add('font-size', project.fontSize === 12, '\u5b57\u53f7', '12pt \u5b57\u53f7\u548c 6 \u884c/\u82f1\u5bf8\u7f51\u683c\u6b63\u5e38\u3002', '\u4e13\u4e1a\u5267\u672c\u901a\u5e38\u4f7f\u7528 12pt\u3002')
  add('font-family', settings.profileId === 'china-a4' ? /Screenplay CJK/i.test(project.fontFamily) : /courier/i.test(project.fontFamily), '\u5b57\u4f53', '\u5df2\u4f7f\u7528\u5bfc\u51fa\u65b9\u6848\u6307\u5b9a\u7684\u5185\u7f6e\u5b57\u4f53\u3002', '\u5b57\u4f53\u4e0e\u5f53\u524d\u5bfc\u51fa\u65b9\u6848\u4e0d\u4e00\u81f4\u3002', 'warning')
  const normalizedFonts = new Set(fonts.map((font) => font.trim().toLocaleLowerCase()))
  const bundledFontName = /Screenplay CJK/i.test(project.fontFamily) ? 'Screenplay CJK' : /Courier/i.test(project.fontFamily) ? 'Courier Prime' : undefined
  add(
    'font-installed',
    Boolean(bundledFontName) || normalizedFonts.has(project.fontFamily.trim().toLocaleLowerCase()),
    '\u5b57\u4f53\u53ef\u7528\u6027',
    bundledFontName ? `\u5df2\u4f7f\u7528\u8f6f\u4ef6\u5185\u7f6e ${bundledFontName}\uff0c\u4e0d\u4f9d\u8d56\u7cfb\u7edf\u5b57\u4f53\u3002` : `\u5b57\u4f53 ${project.fontFamily} \u5df2\u5b89\u88c5\u3002`,
    `\u672a\u5728\u7cfb\u7edf\u4e2d\u627e\u5230 ${project.fontFamily}\uff0c\u5bfc\u51fa\u65f6\u53ef\u80fd\u4f7f\u7528\u540e\u5907\u5b57\u4f53\u3002`,
    'warning',
  )
  add('page', isUsProfile ? format.page.kind === 'letter' : format.page.kind === project.pageSize, '\u7eb8\u5f20', `\u5df2\u4f7f\u7528 ${format.page.kind === 'letter' ? 'Letter' : 'A4'} \u9875\u9762\u3002`, '\u7eb8\u5f20\u4e0e\u5f53\u524d\u5bfc\u51fa\u65b9\u6848\u4e0d\u4e00\u81f4\u3002', 'warning')
  add(
    'margins',
    !isUsProfile || (format.page.marginLeft === hollywood.page.marginLeft &&
      format.page.marginRight === hollywood.page.marginRight &&
      format.page.marginTop === hollywood.page.marginTop &&
      format.page.marginBottom === hollywood.page.marginBottom),
    '\u9875\u8fb9\u8ddd',
    `\u5de6 ${(format.page.marginLeft / 96).toFixed(2)} \u82f1\u5bf8\uff0c\u4e0a ${(format.page.marginTop / 96).toFixed(2)}\u3001\u4e0b ${(format.page.marginBottom / 96).toFixed(2)}\u3001\u53f3 ${(format.page.marginRight / 96).toFixed(2)} \u82f1\u5bf8\u3002`,
    '\u9875\u8fb9\u8ddd\u4e0e\u597d\u83b1\u575e\u6807\u51c6\u4e0d\u4e00\u81f4\u3002',
  )
  add(
    'line-grid',
    getScreenplayLineHeight(project.fontSize) === 16,
    '\u884c\u8ddd',
    '\u884c\u8ddd\u4e3a 6 \u884c/\u82f1\u5bf8\u3002',
    '\u884c\u8ddd\u672a\u843d\u5728 6 \u884c/\u82f1\u5bf8\u7684\u4e13\u4e1a\u7f51\u683c\u3002',
  )
  add(
    'transition',
    format.elements.transition.align === 'right' && format.elements.transition.marginLeft + format.elements.transition.width === hollywood.elements.action.width,
    '\u8f6c\u573a',
    '\u8f6c\u573a\u6bb5\u843d\u9760\u53f3\u3002',
    '\u8f6c\u573a\u6bb5\u843d\u9700\u8981\u9760\u53f3\u3002',
  )

  const emptyScene = project.elements.find((element) => element.type === 'scene' && !element.text.trim())
  add(
    'scene-headings',
    !emptyScene,
    '\u573a\u666f\u6807\u9898',
    '\u6240\u6709\u573a\u666f\u6807\u9898\u5747\u6709\u5185\u5bb9\u3002',
    '\u5b58\u5728\u7a7a\u767d\u573a\u666f\u6807\u9898\uff0c\u53ef\u80fd\u5bfc\u81f4\u573a\u6b21\u8bc6\u522b\u5931\u8d25\u3002',
    'error',
    emptyScene?.id,
  )

  const orphanDialogue = project.elements.find((element, index) => {
    if (element.type !== 'dialogue') {
      return false
    }
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = project.elements[cursor]
      if (previous.type === 'character') {
        return !previous.text.trim()
      }
      if (previous.type !== 'parenthetical' && previous.type !== 'dialogue') {
        return true
      }
    }
    return true
  })
  add(
    'dialogue-cues',
    !orphanDialogue,
    '\u5bf9\u767d\u5f52\u5c5e',
    '\u5bf9\u767d\u524d\u5747\u6709\u6709\u6548\u7684\u89d2\u8272\u540d\u3002',
    '\u5b58\u5728\u6ca1\u6709\u89d2\u8272\u540d\u5f15\u5bfc\u7684\u5bf9\u767d\u3002',
    'error',
    orphanDialogue?.id,
  )

  const hasLayoutWarning = Boolean(layoutResult?.warnings.length)
  add(
    'oversized-paragraphs',
    !hasLayoutWarning,
    '\u8d85\u957f\u6bb5\u843d',
    '\u8d85\u957f\u6bb5\u843d\u5df2\u6309\u5b9e\u6d4b\u884c\u9ad8\u81ea\u52a8\u8de8\u9875\u3002',
    layoutResult?.warnings.join(' ') || '\u5b58\u5728\u65e0\u6cd5\u81ea\u52a8\u6392\u5165\u5355\u9875\u7684\u5185\u5bb9\u3002',
    'error',
  )

  const orphanAtPageEnd = layoutResult?.pages
    .slice(0, -1)
    .map((page) => page.blocks.at(-1))
    .find((block) => block?.sourceType === 'scene' || block?.sourceType === 'character' || block?.sourceType === 'parenthetical')
  add(
    'page-orphans',
    !orphanAtPageEnd,
    '\u6362\u9875\u5b64\u884c',
    '\u573a\u666f\u6807\u9898\u548c\u89d2\u8272\u63d0\u793a\u672a\u5355\u72ec\u7559\u5728\u9875\u5c3e\u3002',
    '\u9875\u5c3e\u5b58\u5728\u5b64\u7acb\u7684\u573a\u666f\u6807\u9898\u3001\u89d2\u8272\u540d\u6216\u62ec\u6ce8\uff0c\u5efa\u8bae\u8c03\u6574\u6362\u9875\u3002',
    'warning',
    orphanAtPageEnd?.sourceId,
  )

  const blankPage = layoutResult?.pages.find((page) => page.blocks.every((block) => !block.text.trim()))
  add(
    'blank-pages',
    !blankPage,
    '\u7a7a\u767d\u9875',
    '\u672a\u68c0\u6d4b\u5230\u7a7a\u767d\u9875\u3002',
    '\u5b58\u5728\u7531\u7a7a\u6bb5\u843d\u7ec4\u6210\u7684\u7a7a\u767d\u9875\u3002',
    'warning',
    blankPage?.blocks[0]?.sourceId,
  )

  return items
}

function buildHealthReport(scenes: SceneSummary[], elements: ScriptElement[]): HealthReport {
  const dialogueLines = elements.filter((element) => element.type === 'dialogue').length
  const actionLines = elements.filter((element) => element.type === 'action').length
  const denominator = Math.max(1, dialogueLines + actionLines)
  const averageSceneLines = scenes.length ? scenes.reduce((sum, scene) => sum + scene.lineCount, 0) / scenes.length : 0
  const warnings: string[] = []

  scenes
    .filter((scene) => scene.lineCount > Math.max(45, averageSceneLines * 1.8))
    .slice(0, 4)
    .forEach((scene) => warnings.push(`\u573a\u6b21\u8fc7\u957f\uff1a${scene.title} (${scene.lineCount} \u884c)`))

  scenes
    .filter((scene) => scene.characters.length === 0)
    .slice(0, 4)
    .forEach((scene) => warnings.push(`\u573a\u6b21\u7f3a\u5c11\u89d2\u8272\u51fa\u573a\uff1a${scene.title}`))

  if (scenes.length === 0) {
    warnings.push('\u5c1a\u672a\u8bc6\u522b\u5230\u573a\u666f\u6807\u9898\u3002')
  }

  return {
    dialogueRatio: dialogueLines / denominator,
    averageSceneLines,
    longestScenes: [...scenes].sort((a, b) => b.lineCount - a.lineCount).slice(0, 5),
    warnings,
  }
}

function buildSceneBoardCards(scenes: SceneSummary[], elements: ScriptElement[]): SceneBoardCard[] {
  const blocks = getSceneBlocks(elements)
  const blockBySceneId = new Map(blocks.map((block) => [block.scene.id, block]))

  return scenes.map((scene) => {
    const block = blockBySceneId.get(scene.id)
    const parsed = parseSceneHeading(stripSceneNumber(scene.title))
    return {
      ...scene,
      location: cleanUnknownValue(parsed.location),
      time: getSceneTimeToken(parsed.time, 'zh-CN'),
      summary: summarizeSceneBeat(block?.elements ?? []),
    }
  })
}

function buildBreakdownRows(scenes: SceneSummary[], elements: ScriptElement[]): BreakdownRow[] {
  const blocks = getSceneBlocks(elements)
  const summaryById = new Map(scenes.map((scene) => [scene.id, scene]))

  return blocks.map((block) => {
    const scene = summaryById.get(block.scene.id)
    const parsed = parseSceneHeading(stripSceneNumber(block.scene.text))
    return {
      scene: block.scene.text || scene?.title || '未命名场景',
      page: scene?.page ?? 1,
      location: cleanUnknownValue(parsed.location),
      time: getSceneTimeToken(parsed.time, 'zh-CN'),
      characters: scene?.characters ?? [],
      props: extractTaggedItems(block.elements, ['道具', 'Prop', 'Props']),
      costumes: extractTaggedItems(block.elements, ['服装', '服化', 'Costume', 'Costumes', 'Wardrobe']),
      vfx: extractTaggedItems(block.elements, ['特效', '视效', 'VFX', 'SFX']),
      vehicles: extractTaggedItems(block.elements, ['车辆', '载具', 'Vehicle', 'Vehicles', 'Car', 'Cars']),
      extras: extractTaggedItems(block.elements, ['群演', '群众', 'Extra', 'Extras', 'Background']),
      summary: summarizeSceneBeat(block.elements),
    }
  })
}

function buildCharacterArcs(elements: ScriptElement[], scenes: SceneSummary[]): CharacterArc[] {
  const blocks = getSceneBlocks(elements)
  const summaryById = new Map(scenes.map((scene) => [scene.id, scene]))
  const arcs = new Map<string, CharacterArc>()

  blocks.forEach((block) => {
    const summary = summaryById.get(block.scene.id)
    const sceneCharacters = uniqueStrings(block.elements.filter((element) => element.type === 'character').map((element) => element.text.trim()).filter(Boolean))
    sceneCharacters.forEach((name) => {
      const current = arcs.get(name) ?? { name, count: 0, firstPage: summary?.page ?? 1, lastPage: summary?.page ?? 1, scenes: [] }
      current.count += 1
      current.firstPage = Math.min(current.firstPage, summary?.page ?? current.firstPage)
      current.lastPage = Math.max(current.lastPage, summary?.page ?? current.lastPage)
      current.scenes.push({
        title: summary?.title ?? block.scene.text,
        page: summary?.page ?? 1,
        beat: summarizeCharacterBeat(block.elements, name),
      })
      arcs.set(name, current)
    })
  })

  return Array.from(arcs.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function buildContinuityIssues(elements: ScriptElement[], scenes: SceneSummary[]): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []
  const sceneBlocks = getSceneBlocks(elements)

  scenes
    .filter((scene) => scene.characters.length === 0)
    .slice(0, 8)
    .forEach((scene) => {
      issues.push({ level: 'warning', title: `场景缺少角色：${scene.title}`, detail: `第 ${scene.index + 1} 场没有识别到角色名。` })
    })

  sceneBlocks.forEach((block, index) => {
    const clean = stripSceneNumber(block.scene.text)
    const parsed = parseSceneHeading(clean)
    if (!looksLikeSceneHeading(clean)) {
      issues.push({ level: 'error', title: `场景标题格式异常：第 ${index + 1} 场`, detail: block.scene.text })
    }
    if (['地点', 'LOCATION', '地點'].includes(parsed.location.trim())) {
      issues.push({ level: 'warning', title: `场景缺少具体地点：第 ${index + 1} 场`, detail: block.scene.text })
    }
  })

  const nameGroups = new Map<string, Set<string>>()
  elements
    .filter((element) => element.type === 'character')
    .map((element) => element.text.trim())
    .filter(Boolean)
    .forEach((name) => {
      const key = normalizeEntityKey(name)
      const group = nameGroups.get(key) ?? new Set<string>()
      group.add(name)
      nameGroups.set(key, group)
    })
  Array.from(nameGroups.values())
    .filter((group) => group.size > 1)
    .forEach((group) => {
      issues.push({ level: 'warning', title: '角色名可能不一致', detail: Array.from(group).join(' / ') })
    })

  const transitionProblems = elements.filter((element) => element.type === 'transition' && !/[:：.。]$/.test(element.text.trim()))
  transitionProblems.slice(0, 5).forEach((element) => {
    issues.push({ level: 'warning', title: '转场结尾建议补冒号或句点', detail: element.text })
  })

  return issues.slice(0, 24)
}

function buildProjectLibrary(elements: ScriptElement[]): ProjectLibrary {
  const scenes = elements.filter((element) => element.type === 'scene')
  const locations = countValues(scenes.map((scene) => cleanUnknownValue(parseSceneHeading(stripSceneNumber(scene.text)).location)))
  const props = countValues(extractTaggedItems(elements, ['道具', 'Prop', 'Props', '服装', '服化', 'Costume', 'Costumes', 'Vehicle', 'Vehicles', 'VFX']))

  return {
    characters: extractCharacters(elements).map((character) => ({ name: character.name, count: character.count })),
    locations,
    props,
  }
}

function buildRevisionDiffs(project: ScriptProject): RevisionDiff[] {
  const snapshot = readRevisionSnapshot()
  if (!snapshot) {
    return []
  }

  const beforeById = new Map(snapshot.elements.map((element) => [element.id, element]))
  const afterById = new Map(project.elements.map((element) => [element.id, element]))
  const diffs: RevisionDiff[] = []

  project.elements.forEach((element, index) => {
    const before = beforeById.get(element.id)
    if (!before) {
      diffs.push({ id: element.id, type: 'added', label: `${index + 1}. ${getElementLabel(element.type, 'zh-CN')}`, after: element.text })
      return
    }
    if (before.type !== element.type || before.text !== element.text) {
      diffs.push({ id: element.id, type: 'changed', label: `${index + 1}. ${getElementLabel(element.type, 'zh-CN')}`, before: before.text, after: element.text })
    }
  })

  snapshot.elements.forEach((element, index) => {
    if (!afterById.has(element.id)) {
      diffs.push({ id: element.id, type: 'removed', label: `${index + 1}. ${getElementLabel(element.type, 'zh-CN')}`, before: element.text })
    }
  })

  return diffs.slice(0, 80)
}

function buildLockedSceneHeading(elements: ScriptElement[], afterId: string, preferences: UserPreferences) {
  const insertAt = Math.max(0, elements.findIndex((element) => element.id === afterId) + 1)
  const previousScenes = elements.slice(0, insertAt).filter((element) => element.type === 'scene')
  const baseNumber = Math.max(1, previousScenes.length)
  const usedSuffixes = elements
    .filter((element) => element.type === 'scene')
    .map((element) => parseSceneNumberPrefix(element.text))
    .filter((number) => number?.base === baseNumber)
    .map((number) => number?.suffix ?? '')
  const suffix = nextSceneSuffix(usedSuffixes)
  return `${baseNumber}${suffix}. ${stripSceneNumber(getDefaultElementText('scene', preferences))}`
}

function buildSceneOutlineMarkdown(project: ScriptProject, cards: SceneBoardCard[]) {
  return [
    `# 分场大纲：${project.title}`,
    '',
    ...cards.flatMap((card) => [
      `## ${String(card.index + 1).padStart(2, '0')} ${card.title}`,
      `页码：${card.page}`,
      `地点/时间：${card.location} / ${card.time}`,
      `角色：${card.characters.join('、') || '无'}`,
      `节拍：${card.summary}`,
      '',
    ]),
  ].join('\n')
}

function buildBreakdownCsv(rows: BreakdownRow[]) {
  const header = ['scene', 'page', 'location', 'time', 'characters', 'props', 'costumes', 'vfx', 'vehicles', 'extras', 'summary']
  const body = rows.map((row) => [
    row.scene,
    row.page,
    row.location,
    row.time,
    row.characters.join(' / '),
    row.props.join(' / '),
    row.costumes.join(' / '),
    row.vfx.join(' / '),
    row.vehicles.join(' / '),
    row.extras.join(' / '),
    row.summary,
  ])
  return [header, ...body].map((row) => row.map(csvEscape).join(',')).join('\n')
}

function buildFountain(project: ScriptProject) {
  const lines = [`Title: ${project.title}`, `Author: ${project.author}`, '']
  project.elements.forEach((element) => {
    if (element.type === 'section') {
      lines.push(`# ${element.text}`)
    } else if (element.type === 'note') {
      lines.push(`[[${element.text}]]`)
    } else if (element.type === 'transition') {
      lines.push(`> ${element.text}`)
    } else if (element.type === 'character' || element.type === 'scene' || element.type === 'shot') {
      lines.push(element.text.toUpperCase())
    } else if (element.type === 'parenthetical') {
      const text = element.text.trim()
      lines.push(text.startsWith('(') ? text : `(${text})`)
    } else {
      lines.push(element.text)
    }
    lines.push('')
  })
  return lines.join('\n').trimEnd()
}

function buildMarkdown(project: ScriptProject) {
  return [
    `# ${project.title}`,
    project.author ? `作者：${project.author}` : '',
    '',
    ...project.elements.flatMap((element) => {
      if (element.type === 'scene') {
        return [`## ${element.text}`, '']
      }
      return [`**${getElementLabel(element.type, 'zh-CN')}**`, element.text, '']
    }),
  ]
    .filter((line, index, source) => line || source[index - 1] !== '')
    .join('\n')
}

function buildSeriesBible(project: ScriptProject, library: ProjectLibrary) {
  const episodes = project.series?.episodes ?? []
  return [
    `# 剧集圣经：${project.series?.title ?? project.title}`,
    '',
    '## 角色',
    ...library.characters.map((character) => `- ${character.name}：${character.count} 次`),
    '',
    '## 地点',
    ...library.locations.map((location) => `- ${location.name}：${location.count} 场`),
    '',
    '## 分集',
    ...(episodes.length ? episodes.map((episode, index) => `- 第 ${index + 1} 集 ${episode.title}：${episode.pages} 页 / ${episode.scenes} 场 / ${episode.characters.join('、')}`) : ['- 尚未加入分集']),
  ].join('\n')
}

function buildCharacterSides(project: ScriptProject, characterName: string) {
  const wanted = normalizeEntityKey(characterName)
  const blocks = getSceneBlocks(project.elements).filter((block) =>
    block.elements.some((element) => element.type === 'character' && normalizeEntityKey(element.text) === wanted),
  )

  return [
    `# 角色分本：${characterName}`,
    `项目：${project.title}`,
    '',
    ...(blocks.length
      ? blocks.flatMap((block, index) => [
          `## 场 ${index + 1}：${block.scene.text}`,
          '',
          ...block.elements.map(formatElementForPlainText),
          '',
        ])
      : ['暂无该角色出场场景。']),
  ].join('\n')
}

function buildDepartmentPackage(project: ScriptProject, department: DepartmentId, rows: BreakdownRow[], library: ProjectLibrary) {
  const definition = departmentPackages.find((item) => item.id === department)
  const title = definition?.label['zh-CN'] ?? department
  const common = [
    `# ${title}：${project.title}`,
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    `格式：${project.formatId}`,
    '',
  ]

  if (department === 'director') {
    const openNotes = (project.reviewNotes ?? []).filter((note) => !note.resolved).map((note) => `- ${note.text}`)
    return [
      ...common,
      '## 分场节拍',
      ...rows.map((row, index) => `${index + 1}. ${row.scene} / ${row.summary} / ${row.characters.join('、') || '无角色'}`),
      '',
      '## 未解决批注',
      ...(openNotes.length ? openNotes : ['- 无']),
    ].join('\n')
  }

  if (department === 'producer') {
    return [
      ...common,
      `场景数：${rows.length}`,
      `角色数：${library.characters.length}`,
      `锁定状态：${project.productionLock?.enabled ? `${project.productionLock.pages} 页 / ${project.productionLock.scenes} 场` : '未锁定'}`,
      '',
      '## 拍摄分解',
      ...rows.map((row, index) => `${index + 1}. ${row.scene} / ${row.location} / ${row.characters.join('、')} / 道具：${row.props.join('、') || '无'}`),
    ].join('\n')
  }

  if (department === 'camera') {
    return [
      ...common,
      '## 摄影提示',
      ...rows.map((row, index) => `${index + 1}. ${row.scene} / ${row.location} / ${row.time}`),
      '',
      '## 镜头段落',
      ...project.elements.filter((element) => element.type === 'shot').map((element) => `- ${element.text}`),
    ].join('\n')
  }

  if (department === 'art') {
    return [
      ...common,
      '## 地点',
      ...library.locations.map((location) => `- ${location.name}：${location.count} 场`),
      '',
      '## 道具/服化/视效线索',
      ...rows.map((row, index) => `${index + 1}. ${row.scene} / 道具：${row.props.join('、') || '无'} / 服化：${row.costumes.join('、') || '无'} / 视效：${row.vfx.join('、') || '无'}`),
    ].join('\n')
  }

  return [
    ...common,
    '## 角色出场',
    ...library.characters.map((character) => `- ${character.name}：${character.count} 次`),
    '',
    '## 分本索引',
    ...library.characters.map((character) => `- ${character.name}_sides.md`),
  ].join('\n')
}

function createEpisodeRecord(project: ScriptProject, pages: number, scenes: number, characters: string[]): SeriesEpisode {
  return {
    id: createLocalId(),
    title: project.title,
    logline: summarizeSceneBeat(project.elements),
    pages,
    scenes,
    characters,
    updatedAt: new Date().toISOString(),
  }
}

function createVersionSnapshot(project: ScriptProject, note: string): VersionSnapshot {
  return {
    id: createLocalId(),
    title: project.title,
    note,
    createdAt: new Date().toISOString(),
    elements: project.elements.map((element) => ({ ...element })),
  }
}

function getRevisionStates(project: ScriptProject) {
  const states = new Map<string, RevisionState>()
  const snapshot = readRevisionSnapshot()
  if (!snapshot) {
    return states
  }

  const beforeById = new Map(snapshot.elements.map((element) => [element.id, element]))
  project.elements.forEach((element) => {
    const before = beforeById.get(element.id)
    if (!before) {
      states.set(element.id, 'added')
      return
    }
    if (before.type !== element.type || before.text !== element.text) {
      states.set(element.id, 'changed')
    }
  })

  return states
}

function readRevisionSnapshot() {
  try {
    const raw = localStorage.getItem(revisionSnapshotStorageKey)
    if (!raw) {
      return undefined
    }
    return JSON.parse(raw) as { savedAt?: string; elements: ScriptElement[] }
  } catch {
    return undefined
  }
}

function getCharacterSuggestions(characters: ReturnType<typeof extractCharacters>, value: string) {
  const query = value.trim().replace(/\s+/g, '').toUpperCase()
  if (!query) {
    return characters.slice(0, 6)
  }

  return characters.filter((character) => character.name.replace(/\s+/g, '').toUpperCase().includes(query) && character.name !== value.trim()).slice(0, 6)
}

function getCriticalFormatIssues(audit: FormatAuditItem[]) {
  const wanted = ['margins', 'font-size', 'line-grid', 'transition']
  const issues = wanted.map((id) => audit.find((item) => item.id === id)).filter((item): item is FormatAuditItem => Boolean(item))
  const failing = issues.filter((item) => item.level !== 'pass')
  return (failing.length ? failing : issues.filter((item) => item.level === 'pass')).slice(0, 3)
}

function matchesCommandItem(command: CommandItem, query: string, shortcut: string) {
  return matchesSearchText(`${command.label} ${command.detail} ${shortcut} ${(command.keywords ?? []).join(' ')}`, query)
}

function matchesSearchText(source: string, query: string) {
  const cleanQuery = normalizeSearchText(query)
  if (!cleanQuery) {
    return true
  }

  const cleanSource = normalizeSearchText(source)
  return cleanSource.includes(cleanQuery) || isSubsequence(cleanQuery, cleanSource)
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function isSubsequence(query: string, source: string) {
  let cursor = 0
  for (const char of source) {
    if (char === query[cursor]) {
      cursor += 1
    }
    if (cursor >= query.length) {
      return true
    }
  }
  return false
}

function joinParagraphText(first: string, second: string) {
  const cleanFirst = first.trimEnd()
  const cleanSecond = second.trimStart()
  if (!cleanFirst) {
    return cleanSecond
  }
  if (!cleanSecond) {
    return cleanFirst
  }
  return `${cleanFirst}\n${cleanSecond}`
}

function normalizeCharacterCue(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ')
  if (/^[A-Za-z0-9 .'\-()]+$/.test(clean)) {
    return clean.toUpperCase()
  }
  return clean
}

function detectTypingElementChange(previous: ScriptProject, next: ScriptProject) {
  if (
    previous.title !== next.title ||
    previous.author !== next.author ||
    previous.language !== next.language ||
    previous.formatId !== next.formatId ||
    previous.fontFamily !== next.fontFamily ||
    previous.fontSize !== next.fontSize ||
    previous.pageSize !== next.pageSize ||
    previous.productionLock !== next.productionLock ||
    previous.series !== next.series ||
    previous.reviewNotes !== next.reviewNotes ||
    previous.versionHistory !== next.versionHistory ||
    previous.elements.length !== next.elements.length
  ) {
    return undefined
  }

  let changedElementId: string | undefined
  for (let index = 0; index < previous.elements.length; index += 1) {
    const before = previous.elements[index]
    const after = next.elements[index]
    if (before.id !== after.id || before.type !== after.type) {
      return undefined
    }
    if (before.text !== after.text) {
      if (changedElementId) {
        return undefined
      }
      changedElementId = after.id
    }
  }
  return changedElementId
}

function readRecoverySnapshots(): VersionSnapshot[] {
  try {
    const raw = localStorage.getItem(recoveryTimelineStorageKey)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as VersionSnapshot[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((snapshot) => snapshot?.id && snapshot.createdAt && Array.isArray(snapshot.elements))
      .slice(0, 30)
  } catch {
    return []
  }
}

function writeRecoverySnapshots(snapshots: VersionSnapshot[]) {
  try {
    localStorage.setItem(recoveryTimelineStorageKey, JSON.stringify(snapshots.slice(0, 30)))
  } catch {
    // Recovery history is best-effort and must never interrupt writing.
  }
}

function readOnboardingState() {
  try {
    return localStorage.getItem(onboardingStorageKey) !== 'done'
  } catch {
    return false
  }
}

function writeOnboardingState() {
  try {
    localStorage.setItem(onboardingStorageKey, 'done')
  } catch {
    // The cue can safely appear again when storage is unavailable.
  }
}

function readAutoSaveSnapshot(): AutoSaveSnapshot | undefined {
  try {
    const raw = localStorage.getItem(autoSaveStorageKey)
    if (!raw) {
      return undefined
    }
    const snapshot = JSON.parse(raw) as AutoSaveSnapshot
    if (!snapshot.project?.elements?.length || !snapshot.savedAt) {
      return undefined
    }
    return snapshot
  } catch {
    return undefined
  }
}

function writeAutoSaveSnapshot(snapshot: AutoSaveSnapshot) {
  try {
    localStorage.setItem(autoSaveStorageKey, JSON.stringify(snapshot))
  } catch {
    // Auto-save is best-effort; manual save remains the source of truth.
  }
}

function readShortcutSettings(): ShortcutSettings {
  try {
    const raw = localStorage.getItem(shortcutSettingsStorageKey)
    if (!raw) {
      return createShortcutSettings('finalDraft')
    }
    const parsed = JSON.parse(raw) as ShortcutSettings
    if (!parsed.profile || !parsed.overrides) {
      return createShortcutSettings('finalDraft')
    }
    return parsed
  } catch {
    return createShortcutSettings('finalDraft')
  }
}

function writeShortcutSettings(settings: ShortcutSettings) {
  try {
    localStorage.setItem(shortcutSettingsStorageKey, JSON.stringify(settings))
  } catch {
    // Keep shortcuts usable even if localStorage is unavailable.
  }
}

function createShortcutSettings(profile: ShortcutProfile): ShortcutSettings {
  return {
    profile,
    overrides: getShortcutProfileOverrides(profile),
  }
}

function mergeShortcutSettings(settings: ShortcutSettings): Record<ShortcutId, ShortcutDefinition> {
  const merged = { ...keyboardShortcuts }
  ;(Object.entries(settings.overrides) as Array<[ShortcutId, ShortcutDefinition]>).forEach(([id, shortcut]) => {
    if (keyboardShortcuts[id]) {
      merged[id] = { ...shortcut, id }
    }
  })
  return merged
}

function getShortcutProfileOverrides(profile: ShortcutProfile): Partial<Record<ShortcutId, ShortcutDefinition>> {
  if (profile === 'chinese') {
    return {
      openQuickJump: { id: 'openQuickJump', key: 'g', ctrlOrMeta: true },
      openAssistiveTools: { id: 'openAssistiveTools', key: 'u', ctrlOrMeta: true },
      openShortcutPreferences: { id: 'openShortcutPreferences', key: '/', ctrlOrMeta: true, shift: true },
    }
  }

  if (profile === 'minimal') {
    return {
      openCommandPalette: { id: 'openCommandPalette', key: 'k', ctrlOrMeta: true },
      openQuickJump: { id: 'openQuickJump', key: 'j', ctrlOrMeta: true },
      openAssistiveTools: { id: 'openAssistiveTools', key: 'u', ctrlOrMeta: true },
      exportPdf: { id: 'exportPdf', key: 'e', ctrlOrMeta: true },
    }
  }

  return {
    openQuickJump: { id: 'openQuickJump', key: 'j', ctrlOrMeta: true },
    openProfessionalPreview: { id: 'openProfessionalPreview', key: 'e', ctrlOrMeta: true, shift: true },
    addNextParagraph: { id: 'addNextParagraph', key: 'Enter', ctrlOrMeta: true },
    addNextScene: { id: 'addNextScene', key: 'Enter', ctrlOrMeta: true, shift: true },
  }
}

function shortcutFromKeyboardEvent(id: ShortcutId, event: KeyboardEvent): ShortcutDefinition {
  return {
    id,
    key: event.key,
    ctrlOrMeta: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  }
}

function getShortcutProfileLabel(profile: ShortcutProfile, locale: UiLocale) {
  if (profile === 'chinese') {
    return ux(locale, 'shortcutProfileChinese')
  }
  if (profile === 'minimal') {
    return ux(locale, 'shortcutProfileMinimal')
  }
  return ux(locale, 'shortcutProfileFinalDraft')
}

function getShortcutLabel(id: ShortcutId, locale: UiLocale) {
  const labels: Record<ShortcutId, Record<UiLocale, string>> = {
    newProject: { 'zh-CN': '新建项目', 'en-US': 'New Project', 'zh-TW': '新增專案' },
    openProject: { 'zh-CN': '打开项目', 'en-US': 'Open Project', 'zh-TW': '打開專案' },
    saveProject: { 'zh-CN': '保存项目', 'en-US': 'Save Project', 'zh-TW': '儲存專案' },
    saveProjectAs: { 'zh-CN': '另存为', 'en-US': 'Save As', 'zh-TW': '另存為' },
    openPreferences: { 'zh-CN': '打开偏好', 'en-US': 'Open Preferences', 'zh-TW': '打開偏好' },
    openShortcutPreferences: { 'zh-CN': '快捷键偏好', 'en-US': 'Shortcut Preferences', 'zh-TW': '快捷鍵偏好' },
    openAssistiveTools: { 'zh-CN': '辅助功能', 'en-US': 'Assistive Tools', 'zh-TW': '輔助功能' },
    openCommandPalette: { 'zh-CN': '命令面板', 'en-US': 'Command Palette', 'zh-TW': '命令面板' },
    openQuickJump: { 'zh-CN': '快速跳转', 'en-US': 'Quick Jump', 'zh-TW': '快速跳轉' },
    openSceneMap: { 'zh-CN': '剧本地图', 'en-US': 'Script Map', 'zh-TW': '劇本地圖' },
    openProjectHealth: { 'zh-CN': '项目健康', 'en-US': 'Project Health', 'zh-TW': '專案健康' },
    openProfessionalPreview: { 'zh-CN': '专业预览', 'en-US': 'Professional Preview', 'zh-TW': '專業預覽' },
    toggleTypewriterMode: { 'zh-CN': '打字机模式', 'en-US': 'Typewriter Mode', 'zh-TW': '打字機模式' },
    toggleRevisionMode: { 'zh-CN': '修订模式', 'en-US': 'Revision Mode', 'zh-TW': '修訂模式' },
    exportPdf: { 'zh-CN': '导出 PDF', 'en-US': 'Export PDF', 'zh-TW': '匯出 PDF' },
    addNextParagraph: { 'zh-CN': '新增下一段', 'en-US': 'Add Next Paragraph', 'zh-TW': '新增下一段' },
    addNextScene: { 'zh-CN': '新增下一场', 'en-US': 'Add Next Scene', 'zh-TW': '新增下一場' },
    deleteParagraph: { 'zh-CN': '删除当前段落', 'en-US': 'Delete Paragraph', 'zh-TW': '刪除目前段落' },
    deleteSceneBlock: { 'zh-CN': '删除当前场景块', 'en-US': 'Delete Scene Block', 'zh-TW': '刪除目前場景塊' },
    moveParagraphUp: { 'zh-CN': '段落上移', 'en-US': 'Move Paragraph Up', 'zh-TW': '段落上移' },
    moveParagraphDown: { 'zh-CN': '段落下移', 'en-US': 'Move Paragraph Down', 'zh-TW': '段落下移' },
    focusPreviousParagraph: { 'zh-CN': '聚焦上一段', 'en-US': 'Focus Previous', 'zh-TW': '聚焦上一段' },
    focusNextParagraph: { 'zh-CN': '聚焦下一段', 'en-US': 'Focus Next', 'zh-TW': '聚焦下一段' },
    cycleElementType: { 'zh-CN': '切换元素类型', 'en-US': 'Cycle Element Type', 'zh-TW': '切換元素類型' },
    cycleElementTypeBack: { 'zh-CN': '反向切换类型', 'en-US': 'Cycle Type Back', 'zh-TW': '反向切換類型' },
  }
  return labels[id][locale] ?? labels[id]['zh-CN']
}

function normalizeProfessionalTerms(elements: ScriptElement[], style: TermStyle, language: AppLocale) {
  return elements.map((element) => {
    if (element.type === 'scene') {
      return { ...element, text: convertSceneHeadingText(element.text, style) }
    }
    if (element.type === 'transition') {
      return { ...element, text: convertTransitionText(element.text, language) }
    }
    return element
  })
}

function getElementRows(element: ScriptElement, workspaceMode: WorkspaceMode) {
  if (workspaceMode === 'focus') {
    return Math.min(8, Math.max(1, element.text.split(/\r?\n/).length))
  }

  return element.type === 'dialogue' || element.type === 'action' ? 3 : 2
}

type ScriptEditorTextareaProps = {
  elementId: string
  placeholder?: string
  value: string
  rows: number
  style: CSSProperties
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: (value: string) => void
  onBlur: () => void
  onFocus: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
}

function ScriptEditorTextarea(props: ScriptEditorTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    resizeEditorTextarea(textareaRef.current)
  }, [props.rows, props.style.fontFamily, props.style.fontSize, props.style.fontWeight, props.style.marginLeft, props.style.maxWidth, props.style.width, props.value])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || typeof ResizeObserver === 'undefined') {
      return
    }

    let previousWidth = textarea.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const width = textarea.getBoundingClientRect().width
      if (Math.abs(width - previousWidth) >= 0.5) {
        previousWidth = width
        resizeEditorTextarea(textarea)
      }
    })
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [])

  return (
    <textarea
      ref={textareaRef}
      data-element-id={props.elementId}
      placeholder={props.placeholder}
      value={props.value}
      rows={props.rows}
      onChange={(event) => {
        resizeEditorTextarea(event.currentTarget)
        props.onChange(event)
      }}
      onBlur={props.onBlur}
      onCompositionStart={props.onCompositionStart}
      onCompositionEnd={(event) => props.onCompositionEnd(event.currentTarget.value)}
      onFocus={props.onFocus}
      onKeyDown={props.onKeyDown}
      style={props.style}
    />
  )
}

function resizeEditorTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return
  }

  const scrollContainer = textarea.closest<HTMLElement>('.editor-surface')
  const topBefore = textarea.getBoundingClientRect().top
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.max(textarea.scrollHeight, 34)}px`
  if (scrollContainer && document.activeElement === textarea) {
    const topAfter = textarea.getBoundingClientRect().top
    scrollContainer.scrollTop += topAfter - topBefore
  }
}

function getEditorTextStyle(element: ScriptElement, project: ScriptProject, format: ReturnType<typeof getFormat>, workspaceMode: WorkspaceMode) {
  const layout = resolveElementLayout(element, format)
  const style: CSSProperties = {
    fontFamily: project.fontFamily,
    textAlign: layout.align,
    textTransform: layout.uppercase ? 'uppercase' : 'none',
    fontWeight: layout.bold ? 700 : 400,
    fontStyle: layout.italic ? 'italic' : 'normal',
  }

  if (workspaceMode === 'focus') {
    style.marginLeft = `${layout.marginLeft}px`
    style.width = `${layout.width}px`
    style.maxWidth = `calc(100% - ${layout.marginLeft}px)`
  }

  return style
}

function safeFileName(value: string) {
  return Array.from(value || 'screenplay')
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char))
    .join('')
    .slice(0, 64)
}

function detectSmartElementType(text: string, currentType: ScriptElementType) {
  const trimmed = text.trim()
  if (!trimmed) {
    return currentType
  }

  const detected = detectElementTypeForLine(trimmed)
  if (currentType === 'action' && detected !== 'action') {
    return detected
  }

  if ((currentType === 'note' || currentType === 'section') && (detected === 'scene' || detected === 'transition')) {
    return detected
  }

  return currentType
}

function getNextElementType(element: ScriptElement): ScriptElementType {
  if (!element.text.trim()) {
    if (element.type === 'character' || element.type === 'dialogue' || element.type === 'parenthetical') {
      return 'action'
    }
    return element.type
  }

  if (element.type === 'scene' || element.type === 'shot' || element.type === 'section' || element.type === 'note') {
    return 'action'
  }

  if (element.type === 'character' || element.type === 'parenthetical') {
    return 'dialogue'
  }

  if (element.type === 'transition') {
    return 'scene'
  }

  if (element.type === 'dialogue') {
    return 'character'
  }

  return 'action'
}

function cycleElementType(type: ScriptElementType, direction: -1 | 1) {
  const index = elementOrder.indexOf(type)
  const nextIndex = (index + direction + elementOrder.length) % elementOrder.length
  return elementOrder[nextIndex]
}

function convertTransitionText(value: string, language: AppLocale) {
  const normalized = normalizeTransition(value)
  const preset = transitionPresets.find((item) => Object.values(item.text).some((text) => normalizeTransition(text) === normalized))
  return preset?.text[language] ?? preset?.text['en-US'] ?? value
}

function convertSceneHeadingText(value: string, style: TermStyle) {
  const prefix = value.match(/^\s*(?:#\s*)?(?:\u7b2c\s*)?\d+\s*(?:\u573a|\u5834|[.\u3001)]|\))?\s*/)?.[0] ?? ''
  return `${prefix}${convertSceneHeading(stripSceneNumber(value), style)}`
}

function normalizeTransition(value: string) {
  return value
    .replace(/\s+/g, '')
    .replace(/[\uff1a:]/g, ':')
    .replace(/[\u3002.]/g, '.')
    .replace(/[:.]$/g, '')
    .toUpperCase()
}

function buildScriptDoctorReport(project: ScriptProject) {
  const issues: string[] = []
  const scenes = project.elements.filter((element) => element.type === 'scene')
  const characters = extractCharacters(project.elements)

  if (scenes.length === 0) {
    issues.push('\u672a\u627e\u5230\u573a\u666f\u6807\u9898\uff0c\u5efa\u8bae\u7528 INT./EXT. \u6216 \u5185\u666f/\u5916\u666f \u5f00\u59cb\u6bcf\u573a\u620f\u3002')
  }

  if (characters.length === 0) {
    issues.push('\u672a\u8bc6\u522b\u5230\u89d2\u8272\u540d\uff0c\u5efa\u8bae\u5728\u5bf9\u767d\u524d\u4f7f\u7528\u72ec\u7acb\u7684\u89d2\u8272\u884c\u3002')
  }

  scenes.forEach((scene, index) => {
    const clean = stripSceneNumber(scene.text)
    const parsed = parseSceneHeading(clean)
    if (!looksLikeSceneHeading(clean)) {
      issues.push(`\u7b2c ${index + 1} \u573a\u7684\u573a\u666f\u6807\u9898\u5efa\u8bae\u4ee5 INT./EXT. \u6216 \u5185\u666f/\u5916\u666f \u5f00\u5934\uff1a${scene.text}`)
    }
    if (!parsed.location || parsed.location === '\u5730\u70b9' || parsed.location === 'LOCATION' || parsed.location === '\u5730\u9ede') {
      issues.push(`\u7b2c ${index + 1} \u573a\u7f3a\u5c11\u660e\u786e\u5730\u70b9\uff1a${scene.text}`)
    }
  })

  project.elements.forEach((element, index) => {
    if (element.type === 'dialogue') {
      const previous = project.elements[index - 1]
      const parentheticalOwner = previous?.type === 'parenthetical' ? project.elements[index - 2] : undefined
      if (previous?.type !== 'character' && parentheticalOwner?.type !== 'character') {
        issues.push(`\u7b2c ${index + 1} \u6bb5\u5bf9\u767d\u524d\u7f3a\u5c11\u89d2\u8272\u540d\u3002`)
      }
    }

    if (element.type === 'transition' && !/[:\uff1a.\u3002]$/.test(element.text.trim())) {
      issues.push(`\u8f6c\u573a\u5efa\u8bae\u4ee5\u5192\u53f7\u6216\u53e5\u53f7\u7ed3\u5c3e\uff1a${element.text}`)
    }
  })

  const characterGroups = new Map<string, string[]>()
  characters.forEach((character) => {
    const key = character.name.replace(/\s+/g, '').toUpperCase()
    const group = characterGroups.get(key) ?? []
    group.push(character.name)
    characterGroups.set(key, group)
  })
  Array.from(characterGroups.values())
    .filter((group) => new Set(group).size > 1)
    .forEach((group) => issues.push(`\u89d2\u8272\u540d\u53ef\u80fd\u4e0d\u4e00\u81f4\uff1a${Array.from(new Set(group)).join(' / ')}`))

  const mixedSceneTerms = scenes.some((scene) => /^(?:INT|EXT)/i.test(stripSceneNumber(scene.text))) && scenes.some((scene) => /^(?:\u5185\u666f|\u5167\u666f|\u5916\u666f)/.test(stripSceneNumber(scene.text)))
  if (mixedSceneTerms) {
    issues.push('\u573a\u666f\u6807\u9898\u540c\u65f6\u4f7f\u7528\u82f1\u6587\u548c\u4e2d\u6587\u672f\u8bed\uff0c\u5efa\u8bae\u5728\u7528\u6237\u504f\u597d\u4e2d\u7edf\u4e00\u672f\u8bed\u98ce\u683c\u3002')
  }

  const summary = `\u5df2\u68c0\u67e5 ${scenes.length} \u573a\u620f\u3001${characters.length} \u4e2a\u89d2\u8272\uff0c\u53d1\u73b0 ${issues.length} \u9879\u53ef\u4f18\u5316\u95ee\u9898\u3002`
  return issues.length === 0 ? `${summary}\n\u6ca1\u6709\u53d1\u73b0\u660e\u663e\u683c\u5f0f\u95ee\u9898\u3002` : `${summary}\n${issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}`
}

function looksLikeSceneHeading(value: string) {
  return /^(?:INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|INT\.?|EXT\.?|\u5185\s*\/\s*\u5916\u666f|\u5916\s*\/\s*\u5185\u666f|\u5167\s*\/\s*\u5916\u666f|\u5916\s*\/\s*\u5167\u666f|\u5185\u5916\u666f|\u5916\u5185\u666f|\u5167\u5916\u666f|\u5916\u5167\u666f|\u5185\u666f|\u5167\u666f|\u5916\u666f)(?=\s|$|[-\u2013\u2014])/i.test(value.trim())
}

function buildProductionReport(project: ScriptProject) {
  const scenes = project.elements.filter((element) => element.type === 'scene')
  const characters = extractCharacters(project.elements)
  const locations = countValues(scenes.map((scene) => parseSceneHeading(stripSceneNumber(scene.text)).location))
  const transitions = countValues(project.elements.filter((element) => element.type === 'transition').map((element) => element.text.trim()))

  return [
    `\u5236\u4f5c\u62a5\u544a\uff1a${project.title}`,
    `\u573a\u666f\u6570\uff1a${scenes.length}`,
    `\u89d2\u8272\u6570\uff1a${characters.length}`,
    '',
    '\u573a\u666f\u6e05\u5355',
    ...scenes.map((scene, index) => `${index + 1}. ${scene.text}`),
    '',
    '\u89d2\u8272\u51fa\u573a',
    ...characters.map((character) => `${character.name}\uff1a${character.count} \u6b21`),
    '',
    '\u5730\u70b9\u7edf\u8ba1',
    ...locations.map((item) => `${item.name}\uff1a${item.count} \u573a`),
    '',
    '\u8f6c\u573a\u7edf\u8ba1',
    ...(transitions.length ? transitions.map((item) => `${item.name}\uff1a${item.count} \u6b21`) : ['\u65e0']),
  ].join('\n')
}

function countValues(values: string[]) {
  const counts = new Map<string, number>()
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function cleanUnknownValue(value: string) {
  const clean = value.trim()
  if (!clean || ['地点', '地點', 'LOCATION'].includes(clean)) {
    return '未指定'
  }
  return clean
}

function summarizeSceneBeat(elements: ScriptElement[]) {
  const candidate = elements.find((element) => element.type === 'action' && element.text.trim()) ?? elements.find((element) => element.type === 'dialogue' && element.text.trim())
  const text = candidate?.text.replace(/\s+/g, ' ').trim() ?? ''
  return text ? truncateText(text, 96) : '暂无节拍摘要'
}

function summarizeCharacterBeat(elements: ScriptElement[], characterName: string) {
  const key = normalizeEntityKey(characterName)
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]
    if (element.type !== 'character' || normalizeEntityKey(element.text) !== key) {
      continue
    }

    const dialogue = elements.slice(index + 1).find((item) => item.type === 'dialogue' && item.text.trim())
    if (dialogue) {
      return truncateText(dialogue.text.replace(/\s+/g, ' ').trim(), 80)
    }
  }

  return summarizeSceneBeat(elements)
}

function extractTaggedItems(elements: ScriptElement[], labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join('|')
  const pattern = new RegExp(`(?:${labelPattern})\\s*[:：]\\s*([^\\n;；]+)`, 'gi')
  const items: string[] = []
  elements.forEach((element) => {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(element.text))) {
      items.push(...(match[1] ?? '').split(/[、,，/]/).map((item) => item.trim()))
    }
  })
  return uniqueStrings(items)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeEntityKey(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

function parseSceneNumberPrefix(value: string) {
  const match = value.trim().match(/^(?:#\s*)?(\d+)([A-Z])?[.\u3001)]?\s*/)
  if (!match) {
    return undefined
  }
  return { base: Number(match[1]), suffix: match[2] ?? '' }
}

function nextSceneSuffix(usedSuffixes: string[]) {
  const used = new Set(usedSuffixes.filter(Boolean))
  for (let index = 0; index < 26; index += 1) {
    const suffix = String.fromCharCode('A'.charCodeAt(0) + index)
    if (!used.has(suffix)) {
      return suffix
    }
  }
  return `A${used.size - 25}`
}

function csvEscape(value: string | number) {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function formatElementForPlainText(element: ScriptElement) {
  if (element.type === 'scene') {
    return element.text.toUpperCase()
  }
  if (element.type === 'character' || element.type === 'shot' || element.type === 'transition') {
    return element.text.toUpperCase()
  }
  if (element.type === 'parenthetical') {
    const text = element.text.trim()
    return text.startsWith('(') ? text : `(${text})`
  }
  if (element.type === 'note') {
    return `[${element.text}]`
  }
  return element.text
}

function truncateText(value: string, length: number) {
  return Array.from(value).length > length ? `${Array.from(value).slice(0, length).join('')}...` : value
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function writeRevisionSnapshot(project: ScriptProject) {
  try {
    localStorage.setItem(
      revisionSnapshotStorageKey,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        title: project.title,
        elements: project.elements,
      }),
    )
  } catch {
    // Ignore restricted storage and keep the writing surface responsive.
  }
}

function compareRevisionSnapshotWithProject(project: ScriptProject) {
  try {
    const raw = localStorage.getItem(revisionSnapshotStorageKey)
    if (!raw) {
      return '\u8fd8\u6ca1\u6709\u53ef\u6bd4\u8f83\u7684\u4fee\u8ba2\u5feb\u7167\u3002\u8bf7\u5148\u5728\u8f85\u52a9\u529f\u80fd\u91cc\u4fdd\u5b58\u5feb\u7167\u3002'
    }

    const snapshot = JSON.parse(raw) as { savedAt?: string; elements?: ScriptElement[] }
    const before = snapshot.elements ?? []
    const beforeById = new Map(before.map((element) => [element.id, element]))
    const afterById = new Map(project.elements.map((element) => [element.id, element]))
    const added = project.elements.filter((element) => !beforeById.has(element.id))
    const removed = before.filter((element) => !afterById.has(element.id))
    const changed = project.elements.filter((element) => beforeById.has(element.id) && beforeById.get(element.id)?.text !== element.text)

    return [
      `\u4fee\u8ba2\u5feb\u7167\uff1a${snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString('zh-CN') : '\u672a\u77e5\u65f6\u95f4'}`,
      `\u65b0\u589e\u6bb5\u843d\uff1a${added.length}`,
      `\u5220\u9664\u6bb5\u843d\uff1a${removed.length}`,
      `\u4fee\u6539\u6bb5\u843d\uff1a${changed.length}`,
      '',
      ...changed.slice(0, 12).map((element, index) => `${index + 1}. ${getElementLabel(element.type, 'zh-CN')}\uff1a${element.text.slice(0, 48)}`),
      changed.length > 12 ? `\u8fd8\u6709 ${changed.length - 12} \u6bb5\u4fee\u6539\u672a\u663e\u793a\u3002` : '',
    ]
      .filter(Boolean)
      .join('\n')
  } catch {
    return '\u65e0\u6cd5\u8bfb\u53d6\u4fee\u8ba2\u5feb\u7167\uff0c\u53ef\u80fd\u662f\u65e7\u7248\u672c\u6570\u636e\u6216\u672c\u5730\u5b58\u50a8\u53d7\u9650\u3002'
  }
}

function getSceneBlocks(elements: ScriptElement[]) {
  const blocks: Array<{ scene: ScriptElement; start: number; end: number; elements: ScriptElement[] }> = []
  elements.forEach((element, index) => {
    if (element.type !== 'scene') {
      return
    }

    const previous = blocks[blocks.length - 1]
    if (previous) {
      previous.end = index
      previous.elements = elements.slice(previous.start, index)
    }

    blocks.push({ scene: element, start: index, end: elements.length, elements: elements.slice(index) })
  })

  const last = blocks[blocks.length - 1]
  if (last) {
    last.end = elements.length
    last.elements = elements.slice(last.start)
  }

  return blocks
}

type ReplacementPair = {
  from: string
  to: string
}

function parseCorrectionPairs(source: string): ReplacementPair[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s*(?:=>|->|=|,|\uff0c)\s*/)
      return { from: parts[0]?.trim() ?? '', to: parts.slice(1).join('=').trim() }
    })
    .filter((pair) => pair.from.length > 0)
}

function replaceElements(elements: ScriptElement[], pairs: ReplacementPair[]) {
  let count = 0
  const nextElements = elements.map((element) => {
    let text = element.text
    pairs.forEach((pair) => {
      const result = replaceLiteral(text, pair.from, pair.to)
      text = result.text
      count += result.count
    })
    return text === element.text ? element : { ...element, text }
  })

  return { elements: nextElements, count }
}

function replaceLiteral(value: string, from: string, to: string) {
  if (!from) {
    return { text: value, count: 0 }
  }

  const parts = value.split(from)
  return { text: parts.join(to), count: parts.length - 1 }
}

function countByType(elements: ScriptElement[], type: ScriptElementType) {
  return elements.filter((element) => element.type === type).length
}

function countUniqueCharacters(elements: ScriptElement[]) {
  return extractCharacters(elements).length
}

function getFileTitle(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() ?? '\u672a\u547d\u540d\u5267\u672c'
  return name.replace(/\.[^.]+$/, '') || '\u672a\u547d\u540d\u5267\u672c'
}
function getDefaultElementText(type: ScriptElementType, preferences: UserPreferences) {
  if (type === 'scene') {
    return buildSceneHeading({
      style: preferences.termStyle,
      place: preferences.defaultScenePlace,
      location: '',
      time: preferences.defaultSceneTime,
    })
  }

  if (type === 'transition') {
    return getTransitionPresetText(preferences.defaultTransition, preferences.scriptLanguage)
  }

  return ''
}

function readStoredPreferences() {
  try {
    const raw = localStorage.getItem(preferencesStorageKey)
    return normalizePreferences(raw ? JSON.parse(raw) : defaultPreferences)
  } catch {
    return defaultPreferences
  }
}

function writeStoredPreferences(preferences: UserPreferences) {
  try {
    localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
  } catch {
    // Local storage can be unavailable in restricted desktop contexts.
  }
}

function readStoredUiLocale() {
  try {
    localStorage.setItem(uiLocaleStorageKey, 'zh-CN')
    return normalizeUiLocale('zh-CN')
  } catch {
    return 'zh-CN'
  }
}

function normalizeProjectLanguage(project: ScriptProject): ScriptProject {
  return {
    ...project,
    appVersion: '0.5.0',
    language: normalizeAppLocale(project.language),
    fontFamily: project.formatId === 'hollywood' && /^Courier New$/i.test(project.fontFamily) ? 'Courier Prime' : project.fontFamily,
    titlePage: project.titlePage ?? createDefaultTitlePage(project),
    exportSettings: resolveExportSettings(project),
    production: synchronizeProductionData(project.elements, project.production),
  }
}

export default App
