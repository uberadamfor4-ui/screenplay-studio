const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(process.platform === 'win32' ? 'D:/ScreenplayStudio-QA' : path.join(root, 'acceptance-results'), `recovery-${stamp}`)
const states = new Map()
const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = (window, source) => window.webContents.executeJavaScript(source)
const results = {}

async function until(predicate, description, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await wait(50)
  }
  throw new Error(`Timed out: ${description}`)
}

async function createWindow(name, state = {}) {
  const window = new BrowserWindow({
    width: 1440, height: 900, show: false, paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(root, 'electron/preload.cjs'),
      partition: `recovery-${stamp}-${name}`,
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
    },
  })
  states.set(window.webContents.id, { writes: [], saves: [], opens: [], ...state })
  await window.loadFile(path.join(root, 'dist/index.html'))
  await until(() => evaluate(window, `Boolean(document.querySelector('.editor-row textarea'))`), 'editor loaded')
  return window
}

const notice = (window) => evaluate(window, `Boolean([...document.querySelectorAll('button')].find(button => button.textContent.trim() === '恢复自动保存版本'))`)
async function typeMarker(window, marker) {
  await evaluate(window, `document.querySelector('.editor-row textarea').focus()`)
  await window.webContents.insertText(marker)
  await wait()
}

async function check(name, run) {
  try {
    results[name] = { passed: true, details: await run() }
  } catch (error) {
    results[name] = { passed: false, error: error.message }
  }
}

async function main() {
  app.setPath('userData', path.join(output, 'profile'))
  await fs.mkdir(output, { recursive: true })
  await app.whenReady()
  app.on('window-all-closed', () => {})
  ipcMain.handle('system:listFonts', () => ({ fonts: [] }))
  ipcMain.handle('system:setUiLocale', (_event, locale) => ({ locale }))
  ipcMain.handle('revision:read', () => undefined)
  ipcMain.handle('revision:write', () => true)
  ipcMain.handle('recovery:read', async (event) => {
    const state = states.get(event.sender.id)
    if (state.readDelay) await wait(state.readDelay)
    return state.snapshot
  })
  ipcMain.handle('recovery:write', async (event, snapshot) => {
    const state = states.get(event.sender.id)
    state.writes.push(snapshot)
    if (state.failWrites) throw new Error('Simulated disk unavailable')
    state.snapshot = snapshot
    return true
  })
  ipcMain.handle('file:saveText', async (event, payload) => {
    const state = states.get(event.sender.id)
    state.saves.push(payload)
    if (state.delaySave) return new Promise((resolve) => { state.finishSave = resolve })
    return { canceled: true }
  })
  ipcMain.handle('file:openText', async (event, filters) => {
    const state = states.get(event.sender.id)
    state.opens.push(filters)
    if (state.delayOpen) return new Promise((resolve) => { state.finishOpen = resolve })
    return { canceled: true }
  })

  const bootstrap = await createWindow('bootstrap')
  await typeMarker(bootstrap, 'RECOVERY-FIXTURE')
  const bootstrapState = states.get(bootstrap.webContents.id)
  await until(() => bootstrapState.snapshot, 'fixture saved')
  const fixture = { ...bootstrapState.snapshot, savedAt: '2026-01-01T00:00:00.000Z' }
  bootstrap.destroy()

  await check('unclaimedRecoverySurvivesRestart', async () => {
    const window = await createWindow('unclaimed', { snapshot: structuredClone(fixture) })
    const state = states.get(window.webContents.id)
    try {
      await until(() => notice(window), 'recovery notice')
      await wait(1800)
      const preserved = state.snapshot.project.elements.some((item) => item.text.includes('RECOVERY-FIXTURE'))
      await window.reload()
      await wait(600)
      const offeredAfterReload = await notice(window)
      assert.ok(preserved && offeredAfterReload, `preserved=${preserved}, offeredAfterReload=${offeredAfterReload}, startupWrites=${state.writes.length}`)
      return { preserved, offeredAfterReload, startupWrites: state.writes.length }
    } finally { window.destroy() }
  })

  await check('slowRecoveryReadCannotBeOverwritten', async () => {
    const window = await createWindow('slow-read', { snapshot: structuredClone(fixture), readDelay: 2400 })
    const state = states.get(window.webContents.id)
    try {
      await typeMarker(window, 'TYPED-WHILE-RECOVERY-IS-LOADING')
      await wait(1500)
      const earlyWrites = state.writes.length
      await until(() => notice(window), 'delayed recovery notice')
      assert.equal(earlyWrites, 0, 'Fresh template overwrote recovery before the read completed')
      assert.equal(state.writes.length, 0, 'Delayed recovery was overwritten by newly typed text')
      return { earlyWrites }
    } finally { window.destroy() }
  })

  await check('recoveryButtonRestoresTheUnclaimedProject', async () => {
    const window = await createWindow('recover-button', { snapshot: structuredClone(fixture) })
    try {
      await until(() => notice(window), 'recovery notice')
      await evaluate(window, `document.querySelector('.autosave-banner button').click()`)
      await until(() => evaluate(window, `[...document.querySelectorAll('.editor-row textarea')].some(editor => editor.value.includes('RECOVERY-FIXTURE'))`), 'recovered content restored')
      return { restored: true }
    } finally { window.destroy() }
  })

  await check('failedAutoSaveRetriesUnchangedText', async () => {
    const window = await createWindow('retry', { failWrites: true })
    const state = states.get(window.webContents.id)
    try {
      await evaluate(window, `(() => {
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function(key, value) {
          if (key === 'screenplay-studio.autosave.v1') throw new DOMException('Simulated quota', 'QuotaExceededError')
          return original.call(this, key, value)
        }
      })()`)
      await typeMarker(window, 'RETRY-UNCHANGED-TEXT')
      await until(() => state.writes.some((snapshot) => snapshot.project.elements.some((item) => item.text.includes('RETRY-UNCHANGED-TEXT'))), 'failed autosave attempted')
      await wait(100)
      const statusBeforeRetry = await evaluate(window, `document.querySelector('.statusbar')?.textContent`)
      assert.ok(statusBeforeRetry.includes('自动保存失败') && !/已自动保存\s+\d/.test(statusBeforeRetry), 'Failed writes were presented as a successful autosave')
      const before = state.writes.length
      state.failWrites = false
      await evaluate(window, `window.dispatchEvent(new Event('beforeunload'))`)
      await wait(300)
      const after = state.writes.length
      assert.ok(after > before && state.snapshot, `attemptsBefore=${before}, attemptsAfter=${after}, persisted=${Boolean(state.snapshot)}`)
      return { before, after }
    } finally { window.destroy() }
  })

  await check('unclaimedRecoveryIsProtectedWhileTyping', async () => {
    const window = await createWindow('pending-edit', { snapshot: structuredClone(fixture) })
    const state = states.get(window.webContents.id)
    try {
      await until(() => notice(window), 'recovery notice')
      window.webContents.send('menu:command', 'openProject')
      await wait(100)
      assert.equal(state.opens.length, 0, 'A file picker opened before the pending recovery was resolved')
      await typeMarker(window, 'NEW-TEXT-WHILE-RECOVERY-PENDING')
      await wait(1500)
      assert.equal(state.writes.length, 0, 'Typing overwrote the unclaimed recovery copy')
      const status = await evaluate(window, `document.querySelector('.statusbar')?.textContent`)
      assert.ok(status.includes('自动保存已暂停'), 'The paused autosave was not explained')
      await evaluate(window, `document.querySelector('.autosave-banner button').click()`)
      await wait(100)
      const retainedBeforeRecovery = await evaluate(window, `[...document.querySelectorAll('.editor-row textarea')].some(editor => editor.value.includes('NEW-TEXT-WHILE-RECOVERY-PENDING'))`)
      assert.ok(retainedBeforeRecovery, 'Recovering the older snapshot discarded newly typed unsaved text')
      await evaluate(window, `document.querySelector('.autosave-banner button:last-child').click()`)
      await until(() => state.writes.length > 0, 'autosave resumes after dismissing notice')
      assert.ok(state.snapshot.project.elements.some((item) => item.text.includes('NEW-TEXT-WHILE-RECOVERY-PENDING')))
      return { protected: true, resumedAfterDismiss: true }
    } finally { window.destroy() }
  })

  await check('lateSaveCannotAttachOldPathToNewProject', async () => {
    const window = await createWindow('late-save', { delaySave: true })
    const state = states.get(window.webContents.id)
    try {
      await typeMarker(window, 'OLD-PROJECT-TEXT')
      window.webContents.send('menu:command', 'saveProject')
      await until(() => state.finishSave, 'save suspended')
      window.webContents.send('menu:command', 'newProject')
      await wait(200)
      state.delaySave = false
      state.finishSave({ canceled: false, filePath: 'D:/virtual/OLD-PROJECT.ssproj' })
      await wait(200)
      window.webContents.send('menu:command', 'saveProject')
      await until(() => state.saves.length === 2, 'new project save')
      assert.equal(state.saves[1].filePath, undefined, 'New project inherited the old save path')
      assert.ok(!state.saves[1].content.includes('OLD-PROJECT-TEXT'), 'New project was replaced by the old save result')
      return { oldPathAttached: Boolean(state.saves[1].filePath) }
    } finally { window.destroy() }
  })

  await check('failedRecoveryCannotDiscardUnsavedWorkOnNewProject', async () => {
    const window = await createWindow('failed-switch', { failWrites: true })
    const state = states.get(window.webContents.id)
    try {
      await evaluate(window, `(() => {
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function(key, value) {
          if (key === 'screenplay-studio.autosave.v1') throw new DOMException('Simulated quota', 'QuotaExceededError')
          return original.call(this, key, value)
        }
      })()`)
      await typeMarker(window, 'UNSAVED-WORK-MUST-SURVIVE')
      await until(() => state.writes.length > 0, 'failed autosave attempted')
      await wait(100)
      window.webContents.send('menu:command', 'newProject')
      await wait(200)
      const retained = await evaluate(window, `[...document.querySelectorAll('.editor-row textarea')].some(editor => editor.value.includes('UNSAVED-WORK-MUST-SURVIVE'))`)
      assert.ok(retained, 'New Project discarded work that had no confirmed full-project recovery copy')
      state.failWrites = false
      await evaluate(window, `window.dispatchEvent(new Event('beforeunload'))`)
      await until(() => state.snapshot, 'disk recovery resumed')
      await wait(100)
      window.webContents.send('menu:command', 'newProject')
      await wait(200)
      const switched = await evaluate(window, `![...document.querySelectorAll('.editor-row textarea')].some(editor => editor.value.includes('UNSAVED-WORK-MUST-SURVIVE'))`)
      assert.ok(switched, 'New Project remained blocked after a durable recovery copy was confirmed')
      return { retainedDuringFailure: retained, switchedAfterPersistence: switched }
    } finally { window.destroy() }
  })

  await check('typingDuringSaveRemainsInTheCurrentProject', async () => {
    const window = await createWindow('save-typing', { delaySave: true })
    const state = states.get(window.webContents.id)
    try {
      await typeMarker(window, 'BEFORE-SAVE')
      window.webContents.send('menu:command', 'saveProject')
      await until(() => state.finishSave, 'save suspended')
      await typeMarker(window, 'TYPED-DURING-SAVE')
      state.delaySave = false
      state.finishSave({ canceled: false, filePath: 'D:/virtual/current.ssproj' })
      await wait(200)
      window.webContents.send('menu:command', 'saveProject')
      await until(() => state.saves.length === 2, 'second save')
      assert.ok(state.saves[1].content.includes('TYPED-DURING-SAVE'))
      assert.equal(state.saves[1].filePath, 'D:/virtual/current.ssproj')
      return { concurrentTypingPreserved: true }
    } finally { window.destroy() }
  })

  await check('lateOpenCannotReplaceANewProject', async () => {
    const window = await createWindow('late-open', { delayOpen: true })
    const state = states.get(window.webContents.id)
    try {
      window.webContents.send('menu:command', 'openProject')
      await until(() => state.finishOpen, 'open suspended')
      window.webContents.send('menu:command', 'newProject')
      await wait(200)
      await typeMarker(window, 'NEW-AFTER-OPEN')
      state.finishOpen({ canceled: false, filePath: 'D:/virtual/old.ssproj', content: JSON.stringify(fixture.project) })
      await wait(200)
      window.webContents.send('menu:command', 'saveProject')
      await until(() => state.saves.length === 1, 'save new document')
      assert.ok(state.saves[0].content.includes('NEW-AFTER-OPEN'))
      assert.ok(!state.saves[0].content.includes('RECOVERY-FIXTURE'))
      assert.equal(state.saves[0].filePath, undefined)
      return { newProjectPreserved: true }
    } finally { window.destroy() }
  })

  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ output, results }, null, 2))
  app.exit(Object.values(results).every((result) => result.passed) ? 0 : 1)
}

main().catch((error) => { console.error(error); app.exit(1) })
