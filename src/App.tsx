import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Clapperboard,
  ClipboardList,
  Download,
  FileDown,
  FileJson,
  FilePlus,
  FileText,
  FolderOpen,
  Image,
  Languages,
  LayoutTemplate,
  ListTree,
  Plus,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import { buildFdx, parseFdx } from './fdx'
import { buildPrintHtml } from './printHtml'
import { renderPngPages } from './pngExport'
import { detectElementTypeForLine, parsePlainTextScript, stripSceneNumber } from './plainTextImport'
import { createDefaultProject } from './sample'
import { beatSheets, createBeatElements } from './structures'
import type { AppLocale, MenuCommand, ScriptElement, ScriptElementType, ScriptFormatId, ScriptProject } from './types'
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
  wrapElementText,
} from './formats'
import { getTransitionPresetOptions, getTransitionPresetText, transitionPresets } from './transitions'
import { localeNames, localeOptions, normalizeAppLocale, normalizeUiLocale, scriptLocaleNames, scriptLocaleOptions, t } from './i18n'
import type { MessageKey, UiLocale } from './i18n'
import { defaultPreferences, normalizePreferences, type UserPreferences } from './preferences'
import { formatShortcut, keyboardShortcuts, matchesShortcut, type ShortcutId } from './shortcuts'
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

const termStyleOptions: Array<{ id: TermStyle; label: string }> = [
  { id: 'zh-CN', label: '\u7b80\u4f53\u4e2d\u6587\u672f\u8bed' },
  { id: 'en-US', label: '\u82f1\u6587\u672f\u8bed' },
  { id: 'zh-TW', label: '\u7e41\u9ad4\u4e2d\u6587\u8853\u8a9e' },
]

const defaultCorrectionPairsText = ['\u767b\u9646=\u767b\u5f55', '\u5e10\u53f7=\u8d26\u53f7', '\u5e10\u6237=\u8d26\u6237', '\u5f71\u8c61=\u5f71\u50cf', '\u5176\u5b83=\u5176\u4ed6'].join('\n')

function App() {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => readStoredPreferences())
  const [project, setProject] = useState<ScriptProject>(() => createDefaultProject(readStoredPreferences()))
  const [uiLocale, setUiLocale] = useState<UiLocale>(() => readStoredUiLocale())
  const workspaceMode: WorkspaceMode = 'focus'
  const [filePath, setFilePath] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>(() => project.elements[0]?.id ?? '')
  const [fonts, setFonts] = useState<string[]>(commonFonts)
  const [statusKey, setStatusKey] = useState<MessageKey>('ready')
  const [leftTab, setLeftTab] = useState<LeftTab>('outline')
  const [rightTab, setRightTab] = useState<RightTab>('format')
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  const locale = uiLocale
  const status = t(locale, statusKey)
  const format = useMemo(() => getFormat(project.formatId), [project.formatId])
  const pages = useMemo(() => paginateElements(project.elements, format, project.fontSize), [format, project.elements, project.fontSize])
  const selectedElement = project.elements.find((element) => element.id === selectedId)
  const selectedIndex = project.elements.findIndex((element) => element.id === selectedId)
  const scenes = useMemo(() => project.elements.filter((element) => element.type === 'scene'), [project.elements])
  const characters = useMemo(() => extractCharacters(project.elements), [project.elements])
  const stats = useMemo(() => calculateStats(project.elements, pages.length), [project.elements, pages.length])
  const transitionOptions = useMemo(() => getTransitionPresetOptions(project.language, locale), [project.language, locale])

  useEffect(() => {
    window.screenplay
      ?.listFonts()
      .then((payload) => {
        const merged = Array.from(new Set([...commonFonts, ...payload.fonts])).sort((a, b) => a.localeCompare(b))
        setFonts(merged)
      })
      .catch(() => setFonts(commonFonts))
  }, [])

  useEffect(() => window.screenplay?.onMenuCommand(handleMenuCommand),)

  useEffect(() => {
    const element = document.querySelector<HTMLTextAreaElement>(`textarea[data-element-id="${selectedId}"]`)
    element?.focus()
  }, [selectedId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const matched = getMatchedGlobalShortcut(event)
      if (matched) {
        event.preventDefault()
        runShortcut(matched)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function updateProject(patch: Partial<ScriptProject>) {
    setProject((current) => ({ ...current, ...patch }))
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

  function updateElement(id: string, patch: Partial<ScriptElement>) {
    setProject((current) => ({
      ...current,
      elements: current.elements.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    }))
  }

  function addElement(type: ScriptElementType = selectedElement?.type ?? 'action', afterId = selectedId) {
    const element = createElement(type, getDefaultElementText(type, preferences))
    setProject((current) => {
      const index = current.elements.findIndex((item) => item.id === afterId)
      const insertAt = index >= 0 ? index + 1 : current.elements.length
      const elements = [...current.elements]
      elements.splice(insertAt, 0, element)
      return { ...current, elements }
    })
    setSelectedId(element.id)
  }

  function getMatchedGlobalShortcut(event: KeyboardEvent): ShortcutId | undefined {
    const globalShortcuts: ShortcutId[] = [
      'newProject',
      'openProject',
      'saveProject',
      'saveProjectAs',
      'openPreferences',
      'openAssistiveTools',
      'openCommandPalette',
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

    return globalShortcuts.find((shortcutId) => matchesShortcut(event, keyboardShortcuts[shortcutId]))
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
      case 'openAssistiveTools':
        setAssistOpen(true)
        break
      case 'openCommandPalette':
        setCommandOpen(true)
        break
      case 'exportPdf':
        void exportPdf()
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

  function updateElementTextSmart(element: ScriptElement, text: string) {
    const detectedType = detectSmartElementType(text, element.type)
    updateElement(element.id, { text, type: detectedType })
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>, element: ScriptElement) {
    if (event.key === 'Tab') {
      event.preventDefault()
      const nextType = cycleElementType(element.type, event.shiftKey ? -1 : 1)
      updateElement(element.id, { type: nextType, text: element.text || getDefaultElementText(nextType, preferences) })
      return
    }

    if (matchesShortcut(event.nativeEvent, keyboardShortcuts.deleteSceneBlock)) {
      event.preventDefault()
      deleteCurrentSceneBlock()
      return
    }

    if (matchesShortcut(event.nativeEvent, keyboardShortcuts.deleteParagraph)) {
      event.preventDefault()
      deleteElement(element.id)
      return
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && element.text.trim().length === 0 && project.elements.length > 1) {
      event.preventDefault()
      deleteElement(element.id, event.key === 'Delete' ? 'next' : 'previous')
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      addElement(getNextElementType(element), element.id)
    }
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
      setSelectedId(elements[nextIndex]?.id ?? elements[0]?.id ?? '')
      return { ...current, elements }
    })
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
        return { ...current, elements }
      }

      const elements = current.elements.filter((_, index) => index < block.start || index >= block.end)
      if (elements.length === 0) {
        const blank = createElement('scene', buildSceneHeading({ style: preferences.termStyle, place: preferences.defaultScenePlace, location: '\u5730\u70b9', time: preferences.defaultSceneTime }))
        setSelectedId(blank.id)
        return { ...current, elements: [blank] }
      }

      setSelectedId(elements[Math.min(block.start, elements.length - 1)]?.id ?? elements[0].id)
      return { ...current, elements }
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
    setProject(fresh)
    setFilePath(undefined)
    setSelectedId(fresh.elements[0]?.id ?? '')
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
    setProject(openedProject)
    setFilePath(isFdx ? undefined : result.filePath)
    setSelectedId(openedProject.elements[0]?.id ?? '')
    setStatusKey('ready')
  }

  async function saveProject(forcePicker = false) {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.saveTextFile({
      content: JSON.stringify(project, null, 2),
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
    setProject(imported)
    setFilePath(undefined)
    setSelectedId(imported.elements[0]?.id ?? '')
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

    setProject(importedProject)
    setFilePath(undefined)
    setSelectedId(importedProject.elements[0]?.id ?? '')
    setStatusKey('wordTxtImported')
    return `Imported as Hollywood format: ${countByType(importedProject.elements, 'scene')} scenes, ${countUniqueCharacters(importedProject.elements)} characters, ${importedProject.elements.length} screenplay elements.`
  }

  function applyCorrectionPairs(source: string) {
    const pairs = parseCorrectionPairs(source)
    if (pairs.length === 0) {
      return 'No replacement rules were found. Use one pair per line, for example: old=new.'
    }

    const result = replaceElements(project.elements, pairs)
    if (result.count === 0) {
      return 'No matching text was found.'
    }

    updateProject({ elements: result.elements })
    setStatusKey('assistiveDone')
    return `Applied ${result.count} replacements.`
  }

  function replaceAllText(findText: string, replacement: string) {
    if (!findText) {
      return 'Enter the text to find first.'
    }

    const result = replaceElements(project.elements, [{ from: findText, to: replacement }])
    if (result.count === 0) {
      return 'No matching text was found.'
    }

    updateProject({ elements: result.elements })
    setStatusKey('assistiveDone')
    return `Replaced ${result.count} matches: ${findText} -> ${replacement}`
  }

  function summarizeCharacters() {
    const list = extractCharacters(project.elements)
    if (list.length === 0) {
      return 'No character elements were found.'
    }

    return [`Total characters: ${list.length}`, ...list.map((item, index) => `${index + 1}. ${item.name}: ${item.count} cue(s)`)].join('\n')
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
      return 'No scene headings were found.'
    }

    updateProject({ elements })
    setStatusKey('assistiveDone')
    return `Numbered ${sceneNumber} scenes.`
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
      return 'No scene headings were found.'
    }

    updateProject({ elements })
    setStatusKey('assistiveDone')
    return `Cleared scene numbers from ${sceneNumber} scenes.`
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
    return `Converted scene and transition terms to ${termStyleOptions.find((item) => item.id === style)?.label ?? style}.`
  }

  function buildCurrentProductionReport() {
    return buildProductionReport(project)
  }

  function saveRevisionSnapshot() {
    writeRevisionSnapshot(project)
    return `Saved revision snapshot with ${project.elements.length} elements.`
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

  async function exportPdf() {
    const api = window.screenplay
    if (!api) {
      setStatusKey('fileUnavailable')
      return
    }

    const result = await api.exportPdf({
      html: buildPrintHtml(project, format),
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
        void exportPdf()
        break
      case 'exportPng':
        void exportPng()
        break
      default:
        break
    }
  }

  const commandItems: CommandItem[] = [
    { id: 'new', label: t(locale, 'newScript'), detail: t(locale, 'newProject'), shortcut: 'newProject', action: newProject },
    { id: 'open', label: t(locale, 'open'), detail: t(locale, 'projectFile'), shortcut: 'openProject', action: () => void openProject() },
    { id: 'save', label: t(locale, 'save'), detail: t(locale, 'projectFile'), shortcut: 'saveProject', action: () => void saveProject(false) },
    { id: 'save-as', label: t(locale, 'saveAs'), detail: t(locale, 'projectFile'), shortcut: 'saveProjectAs', action: () => void saveProject(true) },
    { id: 'import-doc', label: t(locale, 'importDocument'), detail: t(locale, 'importAsHollywood'), action: () => void importWordTxt() },
    { id: 'export-pdf', label: t(locale, 'exportPdf'), detail: t(locale, 'format'), shortcut: 'exportPdf', action: () => void exportPdf() },
    { id: 'export-png', label: t(locale, 'exportPng'), detail: t(locale, 'preview'), action: () => void exportPng() },
    { id: 'add-next', label: t(locale, 'addNextParagraph'), detail: t(locale, 'addElement'), shortcut: 'addNextParagraph', action: () => addElement(selectedElement ? getNextElementType(selectedElement) : 'action', selectedId) },
    { id: 'add-scene', label: t(locale, 'addNextScene'), detail: t(locale, 'addScene'), shortcut: 'addNextScene', action: () => addElement('scene', selectedId) },
    { id: 'delete-paragraph', label: t(locale, 'deleteParagraph'), detail: t(locale, 'delete'), shortcut: 'deleteParagraph', action: () => deleteElement(selectedId) },
    { id: 'delete-scene-block', label: t(locale, 'deleteSceneBlock'), detail: t(locale, 'scenes'), shortcut: 'deleteSceneBlock', action: deleteCurrentSceneBlock },
    { id: 'move-up', label: t(locale, 'moveUp'), detail: t(locale, 'selected'), shortcut: 'moveParagraphUp', action: () => moveElement(selectedId, -1) },
    { id: 'move-down', label: t(locale, 'moveDown'), detail: t(locale, 'selected'), shortcut: 'moveParagraphDown', action: () => moveElement(selectedId, 1) },
    { id: 'assist', label: t(locale, 'assistiveTools'), detail: t(locale, 'typoCorrection'), shortcut: 'openAssistiveTools', action: () => setAssistOpen(true) },
    { id: 'doctor', label: t(locale, 'scriptDoctor'), detail: t(locale, 'runScriptDoctor'), action: () => setAssistOpen(true) },
    { id: 'structure', label: t(locale, 'structureMap'), detail: t(locale, 'scenes'), action: () => setAssistOpen(true) },
    { id: 'scene-number', label: t(locale, 'renumberScenes'), detail: t(locale, 'sceneNumbers'), action: () => void renumberScenes() },
    { id: 'terms-cn', label: t(locale, 'convertToSimplified'), detail: t(locale, 'termConversion'), action: () => void convertProjectTerms('zh-CN') },
    { id: 'terms-en', label: t(locale, 'convertToEnglish'), detail: t(locale, 'termConversion'), action: () => void convertProjectTerms('en-US') },
    { id: 'terms-tw', label: t(locale, 'convertToTraditional'), detail: t(locale, 'termConversion'), action: () => void convertProjectTerms('zh-TW') },
  ]

  return (
    <main className="app-shell focus-mode">
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
          <CommandButton label={t(locale, 'saveAs')} className="secondary-command" onClick={() => saveProject(true)}>
            <Download size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'preferences')} onClick={() => setPreferencesOpen(true)}>
            <Settings size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'assistiveTools')} onClick={() => setAssistOpen(true)}>
            <Sparkles size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'commandPalette')} onClick={() => setCommandOpen(true)}>
            <Search size={17} aria-hidden="true" />
          </CommandButton>
          <span className="toolbar-divider secondary-command" />
          <CommandButton label={t(locale, 'importFdx')} className="secondary-command" onClick={importFdx}>
            <Upload size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'exportFdx')} className="secondary-command" onClick={exportFdx}>
            <FileJson size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'exportPdf')} className="secondary-command" onClick={exportPdf}>
            <FileDown size={17} aria-hidden="true" />
          </CommandButton>
          <CommandButton label={t(locale, 'exportPng')} className="secondary-command" onClick={exportPng}>
            <Image size={17} aria-hidden="true" />
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
                onClick={() => (selectedElement ? updateElement(selectedElement.id, { type, text: selectedElement.text || getDefaultElementText(type, preferences) }) : addElement(type))}
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
          <div className="start-panel">
            <div>
              <strong>{t(locale, 'startHere')}</strong>
              <span>{format.labels[locale]} / {project.fontFamily} / {project.fontSize}pt</span>
            </div>
            <button type="button" onClick={newProject}>
              <FilePlus size={20} aria-hidden="true" />
              <span>{t(locale, 'newScript')}</span>
            </button>
            <button type="button" onClick={() => setRightTab('structure')}>
              <LayoutTemplate size={20} aria-hidden="true" />
              <span>{t(locale, 'pickStructure')}</span>
            </button>
            <button type="button" onClick={() => addElement('scene')}>
              <Clapperboard size={20} aria-hidden="true" />
              <span>{t(locale, 'addScene')}</span>
            </button>
            <button type="button" onClick={() => setRightTab('export')}>
              <FileDown size={20} aria-hidden="true" />
              <span>{t(locale, 'exportWork')}</span>
            </button>
          </div>

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

          <div className="editor-list">
            {project.elements.map((element) => {
              const textStyle = getEditorTextStyle(element, project, format, workspaceMode)
              return (
                <article className={element.id === selectedId ? 'editor-row active' : 'editor-row'} data-element-type={element.type} key={element.id}>
                  <div className="element-label">
                    <select
                      aria-label={getElementLabel(element.type, locale)}
                      value={element.type}
                      onChange={(event) => updateElement(element.id, { type: event.target.value as ScriptElementType })}
                      onFocus={() => setSelectedId(element.id)}
                    >
                      {elementOrder.map((type) => (
                        <option key={type} value={type}>
                          {getElementLabel(type, locale)}
                        </option>
                      ))}
                    </select>
                    <span>{String(project.elements.indexOf(element) + 1).padStart(2, '0')}</span>
                  </div>
                  <textarea
                    data-element-id={element.id}
                    value={element.text}
                    rows={getElementRows(element, workspaceMode)}
                    onChange={(event) => updateElementTextSmart(element, event.target.value)}
                    onFocus={() => setSelectedId(element.id)}
                    onKeyDown={(event) => handleEditorKeyDown(event, element)}
                    style={textStyle}
                  />
                  <div className="row-actions">
                    <IconButton label={t(locale, 'moveUp')} onClick={() => moveElement(element.id, -1)}>
                      <ArrowUp size={15} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t(locale, 'moveDown')} onClick={() => moveElement(element.id, 1)}>
                      <ArrowDown size={15} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={t(locale, 'delete')} onClick={() => deleteElement(element.id)}>
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
              <ExportTile icon={<FileDown size={20} aria-hidden="true" />} title={t(locale, 'exportPdf')} onClick={exportPdf} />
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

      {assistOpen && (
        <AssistiveToolsDialog
          locale={locale}
          onApplyCorrections={applyCorrectionPairs}
          onClearSceneNumbers={clearSceneNumbers}
          onClose={() => setAssistOpen(false)}
          onCountCharacters={summarizeCharacters}
          onConvertTerms={convertProjectTerms}
          onImportWordTxt={importWordTxt}
          onJumpToElement={jumpToElement}
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

      {commandOpen && <CommandPalette commands={commandItems} locale={locale} onClose={() => setCommandOpen(false)} />}

      <footer className="statusbar">
        <span>{status}</span>
        <span>{filePath || t(locale, 'unsavedProject')}</span>
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

function IconButton(props: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" title={props.label} aria-label={props.label} onMouseDown={(event) => event.preventDefault()} onClick={props.onClick}>
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
  shortcut?: ShortcutId
  action: () => void
}

function CommandPalette({ commands, locale, onClose }: { commands: CommandItem[]; locale: UiLocale; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const filtered = commands.filter((command) => {
    const shortcut = command.shortcut ? formatShortcut(keyboardShortcuts[command.shortcut]) : ''
    return `${command.label} ${command.detail} ${shortcut}`.toLowerCase().includes(query.trim().toLowerCase())
  })

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
                {command.shortcut && <kbd>{formatShortcut(keyboardShortcuts[command.shortcut])}</kbd>}
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

function AssistiveToolsDialog(props: {
  locale: UiLocale
  onApplyCorrections: (source: string) => string
  onClearSceneNumbers: () => string
  onClose: () => void
  onCountCharacters: () => string
  onConvertTerms: (style: TermStyle) => string
  onImportWordTxt: () => Promise<string>
  onJumpToElement: (id: string) => void
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
  const [result, setResult] = useState('Choose a tool above to see the result here.')
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
              <button type="button" className="text-button" onClick={() => setResult(props.onSaveRevisionSnapshot())}>
                {t(props.locale, 'saveRevisionSnapshot')}
              </button>
              <button type="button" className="text-button" onClick={() => setResult(props.onCompareRevisionSnapshot())}>
                {t(props.locale, 'compareRevisionSnapshot')}
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

function getElementRows(element: ScriptElement, workspaceMode: WorkspaceMode) {
  if (workspaceMode === 'focus') {
    return Math.min(8, Math.max(1, element.text.split(/\r?\n/).length))
  }

  return element.type === 'dialogue' || element.type === 'action' ? 3 : 2
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
  if (element.type === 'scene' || element.type === 'shot' || element.type === 'section' || element.type === 'note') {
    return 'action'
  }

  if (element.type === 'character' || element.type === 'parenthetical') {
    return 'dialogue'
  }

  if (element.type === 'transition') {
    return 'scene'
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
    language: normalizeAppLocale(project.language),
  }
}

export default App
