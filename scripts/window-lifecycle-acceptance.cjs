const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')
const out = path.resolve(process.env.SCREENPLAY_WINDOW_QA_OUTPUT || path.join(root, 'acceptance-results', 'window-lifecycle'))
const profile = path.join(out, `synthetic-profile-${Date.now()}`)
const checks = []
const registrations = new Map()
const originalHandle = ipcMain.handle.bind(ipcMain)
let finishing = false
let stage = 'starting'

if (process.platform !== 'darwin') throw new Error('Run this native menu lifecycle acceptance on macOS; VM tests cover Windows logic separately.')
fs.mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
ipcMain.handle = (channel, handler) => {
  registrations.set(channel, (registrations.get(channel) || 0) + 1)
  return originalHandle(channel, handler)
}
require('../electron/main.cjs')

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const entry = pathToFileURL(path.join(root, 'dist/index.html')).href
const primaryWindows = () => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed() && window.webContents.getURL() === entry)
const menuItem = () => Menu.getApplicationMenu()?.getMenuItemById('show-main-window')
const evaluate = (window, source) => window.webContents.executeJavaScript(source)
function setStage(label) {
  stage = label
  console.log(`[window-qa] ${label}`)
  fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ stage, checks, isolatedFictionalProfile: true }, null, 2))
}
function recordCheck(label) {
  checks.push(label)
  setStage(`passed: ${label}`)
}
async function until(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await predicate()) return; await wait(50) }
  throw new Error(`Timed out: ${label}`)
}
async function editor() {
  await until(async () => {
    const window = primaryWindows()[0]
    return window && await evaluate(window, "Boolean(document.querySelector('.editor-row textarea'))")
  }, 'primary editor')
  assert.equal(primaryWindows().length, 1)
  return primaryWindows()[0]
}
async function closeAndReopen(window) {
  const id = window.id
  window.close()
  await until(() => window.isDestroyed(), 'normal window close')
  const reopen = menuItem()
  assert.ok(reopen && reopen.enabled && typeof reopen.click === 'function')
  assert.ok(reopen.role === undefined || reopen.role === null, 'A native role must not override the custom reopen handler')
  reopen.click()
  const next = await editor()
  assert.notEqual(next.id, id)
  return next
}
function flatten(menu) {
  return menu.items.flatMap(item => [item, ...(item.submenu ? flatten(item.submenu) : [])])
}

app.once('will-quit', () => {
  if (!finishing) return
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({
    passed: true, platform: process.platform, arch: process.arch,
    scope: 'Native macOS source Electron with isolated fictional profile; not signed MAS or installed-package acceptance',
    checks, normalQuitObserved: true, ipcRegisteredOnce: [...registrations.values()].every(count => count === 1),
    installerRun: false, realManuscriptUsed: false,
  }, null, 2))
  console.log(JSON.stringify({ passed: true, checks: checks.length, normalQuitObserved: true, out }))
})

async function main() {
  setStage('waiting for application ready')
  await app.whenReady()
  let window = await editor()
  const globalEvents = ['activate', 'open-file', 'second-instance']
  const listeners = globalEvents.map(name => app.listenerCount(name))
  const registrationCount = registrations.size
  for (const [locale, label] of [['zh-CN', '显示主窗口'], ['en-US', 'Show Main Window'], ['zh-TW', '顯示主視窗']]) {
    setStage(`native menu close/reopen: ${locale}`)
    await evaluate(window, `localStorage.setItem('screenplay-studio.uiLocale.v3',${JSON.stringify(locale)});window.screenplay.setUiLocale(${JSON.stringify(locale)})`)
    assert.equal(menuItem().label, label)
    window = await closeAndReopen(window)
    assert.equal(menuItem().label, label)
    recordCheck(`${locale}-native-menu-close-reopen`)
  }
  await evaluate(window, "localStorage.setItem('screenplay-studio.uiLocale.v3','zh-CN');window.screenplay.setUiLocale('zh-CN')")
  window = await closeAndReopen(window)
  const auxiliary = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } })
  await auxiliary.loadURL('data:text/html,<title>Synthetic PDF auxiliary</title>')
  for (let i = 0; i < 20; i++) {
    setStage(`normal close/reopen cycle ${i + 1}/20`)
    window = await closeAndReopen(window)
    assert.equal(auxiliary.isVisible(), false)
    app.emit('activate')
    menuItem().click()
    assert.equal(primaryWindows().length, 1)
  }
  recordCheck('twenty-normal-close-reopen-cycles-ignore-auxiliary-window')
  setStage('restoring minimized and hidden application')
  const stableId = window.id
  window.minimize()
  await until(() => window.isMinimized(), 'minimize')
  app.emit('activate')
  await until(() => !window.isMinimized() && window.isVisible(), 'activate restores minimized editor')
  window.hide()
  app.hide()
  app.emit('activate')
  await until(() => window.isVisible() && !app.isHidden(), 'activate restores hidden application')
  assert.equal(window.id, stableId)
  recordCheck('minimized-and-hidden-recovery-retains-window')

  setStage('unsaved draft and beforeunload veto')
  await evaluate(window, 'document.querySelectorAll(".editor-row textarea")[1].focus()')
  await window.webContents.insertText('UNSAVED-WINDOW-QA-')
  await until(() => evaluate(window, "[...document.querySelectorAll('.editor-row textarea')].some(e=>e.value.includes('UNSAVED-WINDOW-QA-'))"), 'fictional unsaved input')
  await evaluate(window, "window.__windowQaBlock=e=>{e.preventDefault();e.returnValue=false};window.addEventListener('beforeunload',window.__windowQaBlock)")
  const prevented = new Promise(resolve => window.webContents.once('will-prevent-unload', resolve))
  window.close()
  await Promise.race([prevented, wait(5000).then(() => { throw new Error('Close did not respect beforeunload veto') })])
  assert.equal(window.isDestroyed(), false)
  menuItem().click(); app.emit('activate')
  assert.equal(primaryWindows().length, 1)
  assert.equal(window.id, stableId)
  const snapshotFile = path.join(profile, 'recovery', 'autosave.json')
  await until(() => {
    try { return JSON.parse(fs.readFileSync(snapshotFile, 'utf8')).project.elements.some(element => element.text.includes('UNSAVED-WINDOW-QA-')) } catch { return false }
  }, 'existing close checkpoint persists the fictional draft')
  recordCheck('beforeunload-veto-preserves-existing-window-and-recovery')
  await evaluate(window, "window.removeEventListener('beforeunload',window.__windowQaBlock);delete window.__windowQaBlock")
  window = await closeAndReopen(window)
  setStage('waiting for the actual recovery button, not Dismiss')
  const restoreSelector = '.autosave-banner:not(.external-open-banner) .inline-actions button:first-child'
  await until(() => evaluate(window, `(() => {const button=document.querySelector(${JSON.stringify(restoreSelector)});return Boolean(button && !button.disabled && button.textContent.trim()==='恢复自动保存版本')})()`), 'actual restore action enabled after recovery read')
  await evaluate(window, `document.querySelector(${JSON.stringify(restoreSelector)}).click()`)
  setStage('checking restored fictional draft text')
  await until(() => evaluate(window, "[...document.querySelectorAll('.editor-row textarea')].some(e=>e.value.includes('UNSAVED-WINDOW-QA-'))"), 'draft recovered after close and reopen')
  recordCheck('normal-close-reopen-offers-and-restores-unsaved-draft')

  setStage('checking rebuilt menu command and listener counts')
  await evaluate(window, "window.__windowQaCommands=0;window.screenplay.onMenuCommand(c=>{if(c==='openPrivacyPolicy')window.__windowQaCommands++});void 0")
  const privacy = flatten(Menu.getApplicationMenu()).find(item => item.label === '隐私政策')
  assert.ok(privacy)
  privacy.click()
  await until(() => evaluate(window, "document.querySelectorAll('[data-policy-section]').length===9"), 'menu command after rebuilding window')
  assert.equal(await evaluate(window, 'window.__windowQaCommands'), 1)
  await evaluate(window, "document.querySelector('.workflow-dialog header button').click()")
  assert.equal(registrations.size, registrationCount)
  assert.ok([...registrations.values()].every(count => count === 1))
  assert.deepEqual(globalEvents.map(name => app.listenerCount(name)), listeners)
  recordCheck('rebuilt-menu-command-once-and-global-ipc-listeners-unchanged')
  await fs.promises.writeFile(path.join(out, 'native-editor.png'), (await window.webContents.capturePage()).toPNG())
  ipcMain.handle = originalHandle
  finishing = true
  setStage('normal application quit')
  app.quit()
}

main().catch(async error => {
  console.error(error)
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: false, error: error.stack, stage, checks, isolatedFictionalProfile: true }, null, 2))
  const context = { stage, checks, fictionalRecoveryContainsMarker: false }
  try {
    const snapshot = JSON.parse(fs.readFileSync(path.join(profile, 'recovery', 'autosave.json'), 'utf8'))
    context.fictionalRecoveryContainsMarker = snapshot.project.elements.some(element => element.text.includes('UNSAVED-WINDOW-QA-'))
  } catch { /* Snapshot may not exist when startup itself failed. */ }
  const window = primaryWindows()[0]
  if (window) {
    try {
      context.ui = await Promise.race([
        evaluate(window, `({recoveryButtons:[...document.querySelectorAll('.autosave-banner button')].map(button=>({label:button.textContent.trim(),disabled:button.disabled})),status:document.querySelector('.statusbar')?.textContent,dialogs:[...document.querySelectorAll('[role="dialog"]')].map(dialog=>dialog.getAttribute('aria-label')||dialog.querySelector('h2,h3')?.textContent)})`),
        wait(3000).then(() => { throw new Error('Failure DOM capture timed out') }),
      ])
      await Promise.race([
        window.webContents.capturePage().then(bitmap => fs.promises.writeFile(path.join(out, 'failure-editor.png'), bitmap.toPNG())),
        wait(3000).then(() => { throw new Error('Failure screenshot timed out') }),
      ])
    } catch (diagnosticError) { context.diagnosticError = diagnosticError.message }
  }
  fs.writeFileSync(path.join(out, 'failure-context.json'), JSON.stringify(context, null, 2))
  ipcMain.handle = originalHandle
  app.exit(1)
})
