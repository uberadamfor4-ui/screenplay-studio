export type ShortcutId =
  | 'newProject'
  | 'openProject'
  | 'saveProject'
  | 'saveProjectAs'
  | 'openPreferences'
  | 'openAssistiveTools'
  | 'openCommandPalette'
  | 'openQuickJump'
  | 'openSceneMap'
  | 'openProjectHealth'
  | 'openProfessionalPreview'
  | 'openShortcutPreferences'
  | 'toggleTypewriterMode'
  | 'toggleRevisionMode'
  | 'exportPdf'
  | 'addNextParagraph'
  | 'addNextScene'
  | 'deleteParagraph'
  | 'deleteSceneBlock'
  | 'moveParagraphUp'
  | 'moveParagraphDown'
  | 'focusPreviousParagraph'
  | 'focusNextParagraph'
  | 'cycleElementType'
  | 'cycleElementTypeBack'

export type ShortcutDefinition = {
  id: ShortcutId
  key: string
  ctrlOrMeta?: boolean
  shift?: boolean
  alt?: boolean
}

export const keyboardShortcuts: Record<ShortcutId, ShortcutDefinition> = {
  newProject: { id: 'newProject', key: 'n', ctrlOrMeta: true },
  openProject: { id: 'openProject', key: 'o', ctrlOrMeta: true },
  saveProject: { id: 'saveProject', key: 's', ctrlOrMeta: true },
  saveProjectAs: { id: 'saveProjectAs', key: 's', ctrlOrMeta: true, shift: true },
  openPreferences: { id: 'openPreferences', key: ',', ctrlOrMeta: true },
  openAssistiveTools: { id: 'openAssistiveTools', key: 'u', ctrlOrMeta: true, shift: true },
  openCommandPalette: { id: 'openCommandPalette', key: 'k', ctrlOrMeta: true },
  openQuickJump: { id: 'openQuickJump', key: 'j', ctrlOrMeta: true },
  openSceneMap: { id: 'openSceneMap', key: 'm', ctrlOrMeta: true, shift: true },
  openProjectHealth: { id: 'openProjectHealth', key: 'h', ctrlOrMeta: true, shift: true },
  openProfessionalPreview: { id: 'openProfessionalPreview', key: 'e', ctrlOrMeta: true, shift: true },
  openShortcutPreferences: { id: 'openShortcutPreferences', key: '/', ctrlOrMeta: true },
  toggleTypewriterMode: { id: 'toggleTypewriterMode', key: 't', ctrlOrMeta: true, shift: true },
  toggleRevisionMode: { id: 'toggleRevisionMode', key: 'r', ctrlOrMeta: true, shift: true },
  exportPdf: { id: 'exportPdf', key: 'p', ctrlOrMeta: true, shift: true },
  addNextParagraph: { id: 'addNextParagraph', key: 'Enter', ctrlOrMeta: true },
  addNextScene: { id: 'addNextScene', key: 'Enter', ctrlOrMeta: true, shift: true },
  deleteParagraph: { id: 'deleteParagraph', key: 'Backspace', ctrlOrMeta: true },
  deleteSceneBlock: { id: 'deleteSceneBlock', key: 'Backspace', ctrlOrMeta: true, shift: true },
  moveParagraphUp: { id: 'moveParagraphUp', key: 'ArrowUp', alt: true },
  moveParagraphDown: { id: 'moveParagraphDown', key: 'ArrowDown', alt: true },
  focusPreviousParagraph: { id: 'focusPreviousParagraph', key: 'ArrowUp', ctrlOrMeta: true, alt: true },
  focusNextParagraph: { id: 'focusNextParagraph', key: 'ArrowDown', ctrlOrMeta: true, alt: true },
  cycleElementType: { id: 'cycleElementType', key: 'Tab' },
  cycleElementTypeBack: { id: 'cycleElementTypeBack', key: 'Tab', shift: true },
}

export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, shortcut: ShortcutDefinition) {
  const eventKey = normalizeKey(event.key)
  const shortcutKey = normalizeKey(shortcut.key)
  const ctrlOrMetaMatches = shortcut.ctrlOrMeta ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey
  return eventKey === shortcutKey && ctrlOrMetaMatches && Boolean(event.shiftKey) === Boolean(shortcut.shift) && Boolean(event.altKey) === Boolean(shortcut.alt)
}

export function formatShortcut(shortcut: ShortcutDefinition, platform = typeof navigator === 'undefined' ? '' : navigator.platform) {
  const isMac = /Mac|iPhone|iPad|iPod/i.test(platform)
  const parts: string[] = []
  if (shortcut.ctrlOrMeta) {
    parts.push(isMac ? 'Cmd' : 'Ctrl')
  }
  if (shortcut.alt) {
    parts.push(isMac ? 'Option' : 'Alt')
  }
  if (shortcut.shift) {
    parts.push('Shift')
  }
  parts.push(formatKey(shortcut.key))
  return parts.join('+')
}

function normalizeKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}

function formatKey(key: string) {
  switch (key) {
    case 'Backspace':
      return 'Backspace'
    case 'Enter':
      return 'Enter'
    case 'ArrowUp':
      return 'Up'
    case 'ArrowDown':
      return 'Down'
    case 'Tab':
      return 'Tab'
    default:
      return key.toUpperCase()
  }
}
