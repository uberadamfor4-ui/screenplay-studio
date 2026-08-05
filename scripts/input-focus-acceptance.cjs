const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { installInputGuards } = require('../electron/inputGuards.cjs')

const root = path.resolve(__dirname, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(root, 'acceptance-results', `input-focus-${stamp}`)
const userData = path.join(root, 'tmp', 'input-focus-acceptance')

function wait(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function evaluate(window, source) {
  return window.webContents.executeJavaScript(source)
}

async function activeState(window) {
  return evaluate(window, `(() => {
    const active = document.activeElement
    const selectedEditor = document.querySelector('.editor-row.active textarea')
    const modal = document.querySelector('[role="dialog"][aria-modal="true"]')
    const modalFocusable = modal ? [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null) : []
    return {
      tag: active?.tagName ?? '',
      className: active?.className ?? '',
      elementId: active?.dataset?.elementId ?? '',
      dialog: document.querySelector('[role="dialog"][aria-modal="true"] h2')?.textContent?.trim() ?? '',
      value: active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active.value : '',
      selectedEditorId: selectedEditor?.dataset?.elementId ?? '',
      selectedEditorVisible: Boolean(selectedEditor && selectedEditor.offsetParent !== null),
      modalContainsActive: Boolean(modal?.contains(active)),
      modalFocusableCount: modalFocusable.length,
      modalFirstFocusable: modalFocusable[0]?.getAttribute('aria-label') || modalFocusable[0]?.textContent?.trim().slice(0, 40) || '',
    }
  })()`)
}

async function sendCharacter(window, key) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
  window.webContents.sendInputEvent({ type: 'char', keyCode: key })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
  await wait(100)
}

async function sendKey(window, key, modifiers = []) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers })
  await wait(100)
}

async function main() {
  app.setPath('userData', userData)
  await fs.rm(userData, { recursive: true, force: true })
  await fs.mkdir(output, { recursive: true })
  await app.whenReady()
  const localeUpdates = []
  ipcMain.handle('system:listFonts', async () => ({ fonts: [] }))
  ipcMain.handle('system:setUiLocale', async (_event, locale) => {
    localeUpdates.push(locale)
    return { locale }
  })
  ipcMain.handle('recovery:read', async () => undefined)
  ipcMain.handle('recovery:write', async () => true)
  ipcMain.handle('revision:read', async () => undefined)
  ipcMain.handle('revision:write', async () => true)
  ipcMain.handle('edit:native', async (event, command) => {
    if (command !== 'undo' && command !== 'redo') throw new Error(`Unexpected native edit command: ${command}`)
    event.sender[command]()
    return true
  })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  installInputGuards(window)
  await window.loadFile(path.join(root, 'dist', 'index.html'))
  await wait(500)

  const results = {}
  results.start = await activeState(window)
  if (results.start.tag !== 'TEXTAREA') throw new Error(`Editor did not receive initial focus: ${JSON.stringify(results.start)}`)

  window.webContents.send('menu:command', 'openPreferences')
  await wait(160)
  const switchUiLocale = async (locale) => {
    const state = await evaluate(window, `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
      const select = [...dialog.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.value === 'en-US'))
      if (!select) return null
      select.value = ${JSON.stringify(locale)}
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
    if (!state) throw new Error('Interface language selector was not available in Preferences')
    await wait(100)
    return evaluate(window, `(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? '',
      selected: [...document.querySelectorAll('[role="dialog"] select')].find((item) => [...item.options].some((option) => option.value === 'en-US'))?.value ?? '',
    }))()`)
  }
  results.uiLanguageSwitch = {
    english: await switchUiLocale('en-US'),
    traditional: await switchUiLocale('zh-TW'),
    simplified: await switchUiLocale('zh-CN'),
    ipcLocales: localeUpdates,
  }
  if (
    results.uiLanguageSwitch.english.lang !== 'en-US'
    || results.uiLanguageSwitch.english.heading !== 'Preferences'
    || results.uiLanguageSwitch.traditional.lang !== 'zh-TW'
    || results.uiLanguageSwitch.traditional.heading !== '偏好'
    || results.uiLanguageSwitch.simplified.lang !== 'zh-CN'
    || !localeUpdates.includes('en-US')
    || !localeUpdates.includes('zh-TW')
  ) {
    throw new Error(`Interface language switching was incomplete: ${JSON.stringify(results.uiLanguageSwitch)}`)
  }
  await evaluate(window, `document.querySelector('[role="dialog"] button[aria-label="关闭"]').click()`)
  await wait(120)

  window.webContents.send('menu:command', 'openCommandPalette')
  await wait(160)
  await window.webContents.insertText('撤销输入测试')
  await wait(100)
  const commandQueryBeforeUndo = await evaluate(window, `document.querySelector('.command-palette input')?.value ?? ''`)
  window.webContents.send('menu:command', 'undoProject')
  await wait(140)
  results.nativeMenuUndo = {
    before: commandQueryBeforeUndo,
    after: await evaluate(window, `document.querySelector('.command-palette input')?.value ?? ''`),
    dialog: await evaluate(window, `document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? ''`),
  }
  if (results.nativeMenuUndo.before !== '撤销输入测试' || results.nativeMenuUndo.after !== '' || !results.nativeMenuUndo.dialog) {
    throw new Error(`Menu undo did not stay inside the active form field: ${JSON.stringify(results.nativeMenuUndo)}`)
  }
  await evaluate(window, `document.querySelector('[role="dialog"] button[aria-label="关闭"]').click()`)
  await wait(120)

  await evaluate(window, `(() => {
    const editor = document.activeElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
    return editor.value.length
  })()`)
  await sendCharacter(window, 'x')
  results.afterTyping = await activeState(window)
  if (results.afterTyping.tag !== 'TEXTAREA' || !results.afterTyping.value.endsWith('x')) {
    throw new Error(`Typing did not remain in the editor: ${JSON.stringify(results.afterTyping)}`)
  }

  await evaluate(window, `(() => {
    const button = document.querySelector('.pdf-command')
    button.focus()
    button.click()
  })()`)
  await wait(300)
  results.previewOpen = await activeState(window)
  if (!results.previewOpen.dialog) throw new Error('PDF preview did not open')
  await evaluate(window, `document.querySelector('[role="dialog"][aria-modal="true"] button[aria-label="关闭"]').click()`)
  await wait(180)
  results.previewClosed = await activeState(window)
  if (results.previewClosed.tag !== 'TEXTAREA') {
    throw new Error(`Editor focus was not restored after PDF preview: ${JSON.stringify(results.previewClosed)}`)
  }
  await sendCharacter(window, 'y')
  results.afterPreviewTyping = await activeState(window)
  if (!results.afterPreviewTyping.value.endsWith('xy')) {
    throw new Error(`Typing failed after PDF preview: ${JSON.stringify(results.afterPreviewTyping)}`)
  }

  await evaluate(window, `(() => {
    localStorage.setItem('screenplay-studio.shortcuts.v1', JSON.stringify({
      profile: 'finalDraft',
      overrides: {
        exportPdf: { id: 'exportPdf', key: 'p' },
        openProject: { id: 'openProject', key: 'n', ctrlOrMeta: true },
      },
    }))
    location.reload()
  })()`)
  await wait(600)
  await evaluate(window, `(() => {
    const editor = document.querySelector('.editor-row textarea')
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
  })()`)
  await sendCharacter(window, 'p')
  results.legacyShortcut = await activeState(window)
  results.sanitizedShortcut = await evaluate(window, `JSON.parse(localStorage.getItem('screenplay-studio.shortcuts.v1'))`)
  if (results.legacyShortcut.dialog || !results.legacyShortcut.value.endsWith('p')) {
    throw new Error(`Legacy shortcut still intercepted typing: ${JSON.stringify(results.legacyShortcut)}`)
  }
  if (results.sanitizedShortcut.overrides.exportPdf?.key === 'p' && !results.sanitizedShortcut.overrides.exportPdf?.ctrlOrMeta) {
    throw new Error('Unsafe legacy shortcut remained persisted')
  }
  if (results.sanitizedShortcut.overrides.openProject?.key?.toLowerCase() === 'n') {
    throw new Error('Conflicting legacy shortcut remained persisted')
  }

  await evaluate(window, `document.querySelector('.pdf-command').focus()`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['control'] })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['control'] })
  await wait(160)
  results.nativePrint = await activeState(window)
  if (results.nativePrint.dialog || results.nativePrint.tag !== 'TEXTAREA') {
    throw new Error(`Native print shortcut was not contained: ${JSON.stringify(results.nativePrint)}`)
  }

  await evaluate(window, `(() => {
    document.querySelector('.more-command').focus()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
  })()`)
  await wait(160)
  results.windowReturn = await activeState(window)
  if (results.windowReturn.tag !== 'TEXTAREA') {
    throw new Error(`Window focus did not return to the editor: ${JSON.stringify(results.windowReturn)}`)
  }

  await evaluate(window, `(() => {
    const field = document.querySelector('.scene-preset select')
    field.focus()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
  })()`)
  await wait(160)
  results.formFieldReturn = await activeState(window)
  if (results.formFieldReturn.tag !== 'SELECT') {
    throw new Error(`Window focus stole a form field from the user: ${JSON.stringify(results.formFieldReturn)}`)
  }

  window.webContents.send('menu:command', 'openPreproduction')
  await wait(240)
  await evaluate(window, `(() => {
    const button = [...document.querySelectorAll('.production-main button')]
      .find((item) => item.textContent.includes('新建任务'))
    button?.click()
  })()`)
  await wait(100)
  await evaluate(window, `(() => {
    const field = document.querySelector('.task-row input')
    field?.focus()
    field?.setSelectionRange(field.value.length, field.value.length)
  })()`)
  const rapidProductionText = '快速录入ABC123'
  for (const character of rapidProductionText) {
    window.webContents.insertText(character)
  }
  await wait(360)
  results.productionRapidTyping = {
    value: await evaluate(window, `document.querySelector('.task-row input')?.value ?? ''`),
    activeTag: await evaluate(window, `document.activeElement?.tagName ?? ''`),
  }
  if (!results.productionRapidTyping.value.endsWith(rapidProductionText) || results.productionRapidTyping.activeTag !== 'INPUT') {
    throw new Error(`Production form typing lost characters or focus: ${JSON.stringify(results.productionRapidTyping)}`)
  }
  await evaluate(window, `document.querySelector('.production-back')?.click()`)
  await wait(160)

  await evaluate(window, `document.querySelector('.editor-row.active textarea').focus()`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
  await wait(100)
  const typeAfterFirstTab = await evaluate(window, `document.querySelector('.editor-row.active')?.dataset?.elementType`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', isAutoRepeat: true })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
  await wait(100)
  results.repeatedTab = {
    afterFirst: typeAfterFirstTab,
    afterRepeat: await evaluate(window, `document.querySelector('.editor-row.active')?.dataset?.elementType`),
  }
  if (results.repeatedTab.afterRepeat !== results.repeatedTab.afterFirst) {
    throw new Error(`Held Tab changed paragraph type repeatedly: ${JSON.stringify(results.repeatedTab)}`)
  }

  await evaluate(window, `document.querySelector('.more-command').focus()`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: ['control', 'shift'] })
  await wait(100)
  const typewriterAfterFirst = await evaluate(window, `document.querySelector('.app-shell').classList.contains('typewriter-mode')`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: ['control', 'shift'], isAutoRepeat: true })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'T', modifiers: ['control', 'shift'] })
  await wait(100)
  results.repeatedGlobalShortcut = {
    afterFirst: typewriterAfterFirst,
    afterRepeat: await evaluate(window, `document.querySelector('.app-shell').classList.contains('typewriter-mode')`),
  }
  if (results.repeatedGlobalShortcut.afterRepeat !== results.repeatedGlobalShortcut.afterFirst) {
    throw new Error(`Held global shortcut executed repeatedly: ${JSON.stringify(results.repeatedGlobalShortcut)}`)
  }
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: ['control', 'shift'] })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'T', modifiers: ['control', 'shift'] })
  await wait(80)
  await evaluate(window, `document.querySelector('.editor-row.active textarea').focus()`)

  const paragraphsBeforeImeReturn = await evaluate(window, `document.querySelectorAll('.editor-row textarea').length`)
  await evaluate(window, `(() => {
    const editor = document.activeElement
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
  })()`)
  await wait(120)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  await wait(160)
  results.imeReturn = {
    ...(await activeState(window)),
    paragraphsBefore: paragraphsBeforeImeReturn,
    paragraphsAfter: await evaluate(window, `document.querySelectorAll('.editor-row textarea').length`),
  }
  if (results.imeReturn.paragraphsAfter !== paragraphsBeforeImeReturn + 1 || results.imeReturn.tag !== 'TEXTAREA') {
    throw new Error(`Interrupted IME state blocked editing: ${JSON.stringify(results.imeReturn)}`)
  }

  const ellipsisText = '前半……后半'
  await window.webContents.insertText(ellipsisText)
  await wait(120)
  const structuralStartCount = await evaluate(window, `document.querySelectorAll('.editor-row textarea').length`)
  await evaluate(window, `(() => {
    const editor = document.activeElement
    editor.setSelectionRange(4, 4)
  })()`)
  await sendKey(window, 'Enter')
  results.ellipsisSplit = await evaluate(window, `(() => {
    const editor = document.activeElement
    const rows = [...document.querySelectorAll('.editor-row')]
    const index = rows.findIndex((row) => row.classList.contains('active'))
    return {
      count: rows.length,
      previous: rows[index - 1]?.querySelector('textarea')?.value ?? '',
      current: editor?.value ?? '',
      currentType: rows[index]?.dataset?.elementType ?? '',
    }
  })()`)
  if (
    results.ellipsisSplit.count !== structuralStartCount + 1
    || results.ellipsisSplit.previous !== '前半……'
    || results.ellipsisSplit.current !== '后半'
  ) {
    throw new Error(`Ellipsis split lost or duplicated text: ${JSON.stringify(results.ellipsisSplit)}`)
  }

  await sendKey(window, 'Tab')
  results.ellipsisTypeChange = await evaluate(window, `(() => ({
    value: document.activeElement?.value ?? '',
    type: document.querySelector('.editor-row.active')?.dataset?.elementType ?? '',
  }))()`)
  if (
    results.ellipsisTypeChange.value !== '后半'
    || results.ellipsisTypeChange.type === results.ellipsisSplit.currentType
  ) {
    throw new Error(`Ellipsis paragraph type change was unstable: ${JSON.stringify(results.ellipsisTypeChange)}`)
  }

  await evaluate(window, `document.activeElement.setSelectionRange(0, 0)`)
  await sendKey(window, 'Backspace')
  results.backspaceMerge = await evaluate(window, `(() => ({
    count: document.querySelectorAll('.editor-row textarea').length,
    value: document.activeElement?.value ?? '',
    selectionStart: document.activeElement?.selectionStart ?? -1,
  }))()`)
  if (
    results.backspaceMerge.count !== structuralStartCount
    || results.backspaceMerge.value.replace(/\s/gu, '') !== ellipsisText
    || results.backspaceMerge.selectionStart <= 0
  ) {
    throw new Error(`Backspace merge was unstable: ${JSON.stringify(results.backspaceMerge)}`)
  }

  await evaluate(window, `(() => {
    const editor = document.activeElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
  })()`)
  await sendKey(window, 'Enter')
  await window.webContents.insertText('尾段')
  await wait(100)
  await evaluate(window, `(() => {
    const activeRow = document.querySelector('.editor-row.active')
    const previous = activeRow?.previousElementSibling?.querySelector('textarea')
    previous?.focus()
    previous?.setSelectionRange(previous.value.length, previous.value.length)
  })()`)
  await sendKey(window, 'Delete')
  results.deleteMerge = await evaluate(window, `(() => ({
    count: document.querySelectorAll('.editor-row textarea').length,
    value: document.activeElement?.value ?? '',
  }))()`)
  if (
    results.deleteMerge.count !== structuralStartCount
    || !results.deleteMerge.value.replace(/\s/gu, '').endsWith(`${ellipsisText}尾段`)
  ) {
    throw new Error(`Forward Delete merge was unstable: ${JSON.stringify(results.deleteMerge)}`)
  }

  await evaluate(window, `(() => {
    const editor = document.activeElement
    editor.setSelectionRange(editor.value.length, editor.value.length)
  })()`)
  await sendKey(window, 'Enter')
  const countWithEmptyParagraph = await evaluate(window, `document.querySelectorAll('.editor-row textarea').length`)
  await sendKey(window, 'Backspace')
  results.emptyParagraphDelete = await evaluate(window, `(() => ({
    count: document.querySelectorAll('.editor-row textarea').length,
    tag: document.activeElement?.tagName ?? '',
    value: document.activeElement?.value ?? '',
  }))()`)
  if (
    countWithEmptyParagraph !== structuralStartCount + 1
    || results.emptyParagraphDelete.count !== structuralStartCount
    || results.emptyParagraphDelete.tag !== 'TEXTAREA'
  ) {
    throw new Error(`Empty paragraph deletion lost focus or removed the wrong row: ${JSON.stringify(results.emptyParagraphDelete)}`)
  }

  const longText = '这是用于检验长段落完整显示和持续输入稳定性的文字。'.repeat(90)
  await window.webContents.insertText(longText)
  await wait(220)
  results.longParagraph = await evaluate(window, `(() => {
    const editor = document.activeElement
    return {
      valueLength: editor.value.length,
      scrollHeight: editor.scrollHeight,
      clientHeight: editor.clientHeight,
    }
  })()`)
  if (results.longParagraph.valueLength < longText.length || results.longParagraph.scrollHeight > results.longParagraph.clientHeight + 2) {
    throw new Error(`Long paragraph was clipped or truncated: ${JSON.stringify(results.longParagraph)}`)
  }

  await wait(1400)
  results.unsavedRecovery = await evaluate(window, `(() => {
    window.dispatchEvent(new Event('beforeunload'))
    const snapshot = JSON.parse(localStorage.getItem('screenplay-studio.autosave.v1') || 'null')
    const acknowledgedAt = localStorage.getItem('screenplay-studio.autosaveAcknowledged.v1')
    return { savedAt: snapshot?.savedAt ?? '', acknowledgedAt: acknowledgedAt ?? '' }
  })()`)
  if (!results.unsavedRecovery.savedAt || (
    results.unsavedRecovery.acknowledgedAt
    && new Date(results.unsavedRecovery.acknowledgedAt).getTime() >= new Date(results.unsavedRecovery.savedAt).getTime()
  )) {
    throw new Error(`Unsaved recovery snapshot was suppressed on close: ${JSON.stringify(results.unsavedRecovery)}`)
  }

  await evaluate(window, `location.reload()`)
  await wait(500)
  const recoveryClicked = await evaluate(window, `(() => {
    const button = [...document.querySelectorAll('.autosave-banner button')]
      .find((item) => item.textContent.includes('恢复自动保存版本'))
    button?.click()
    return Boolean(button)
  })()`)
  if (!recoveryClicked) throw new Error('Recovery banner did not appear after an unsaved reload')
  await wait(100)
  results.recoveredImmediately = await evaluate(window, `(() => {
    const snapshot = JSON.parse(localStorage.getItem('screenplay-studio.autosave.v1') || 'null')
    return {
      savedAt: snapshot?.savedAt ?? '',
      acknowledgedAt: localStorage.getItem('screenplay-studio.autosaveAcknowledged.v1') ?? '',
      editorMaxLength: Math.max(0, ...[...document.querySelectorAll('.editor-row textarea')].map((editor) => editor.value.length)),
    }
  })()`)
  if (
    new Date(results.recoveredImmediately.savedAt).getTime() <= new Date(results.unsavedRecovery.savedAt).getTime()
    || results.recoveredImmediately.acknowledgedAt
    || results.recoveredImmediately.editorMaxLength < longText.length
  ) {
    throw new Error(`Recovered project was not immediately protected: ${JSON.stringify(results.recoveredImmediately)}`)
  }

  const image = await window.webContents.capturePage()
  await fs.writeFile(path.join(output, 'input-focus-final.png'), image.toPNG())
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ output, results }, null, 2))
  window.destroy()
  app.quit()
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
