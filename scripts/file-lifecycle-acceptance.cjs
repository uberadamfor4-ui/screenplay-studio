const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), out = path.resolve(process.env.SCREENPLAY_GATE_OUTPUT || path.join(root, 'acceptance-results'), 'file-lifecycle-' + Date.now())
app.setPath('userData', path.join(out, 'profile'))
const states = new Map(), checks = []
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const evaluate = (window, source) => window.webContents.executeJavaScript(source)
async function until(test, description) { for (let i = 0; i < 100; i++) { if (await test()) return; await wait(50) }; throw new Error('Timed out: ' + description) }
async function openName(window, kind, name, submitTwice = false) {
  window.webContents.send('menu:command', kind === 'new' ? 'newProject' : 'renameProject')
  await until(() => evaluate(window, `Boolean(document.querySelector('.project-name-dialog input'))`), 'name dialog')
  await evaluate(window, `document.querySelector('.project-name-dialog input').select()`)
  await window.webContents.insertText(name)
  await evaluate(window, `document.querySelector('.project-name-dialog form').requestSubmit(); ${submitTwice ? "document.querySelector('.project-name-dialog form').requestSubmit()" : ''}`)
}
async function scenario(name, run) {
  const window = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), partition: name + Date.now(), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  const state = { saves: [], file: path.join(out, name + '.ssproj') }
  states.set(window.webContents.id, state)
  try {
    await window.loadFile(path.join(root, 'dist/index.html'))
    await until(() => evaluate(window, `Boolean(document.querySelector('.editor-row textarea'))`), 'editor')
    await wait(150)
    await run(window, state)
    checks.push({ name, passed: true })
  } finally { window.destroy() }
}
async function main() {
  await fs.mkdir(out, { recursive: true }); await app.whenReady()
  app.on('window-all-closed', () => {})
  for (const [name, result] of Object.entries({ 'system:listFonts': { fonts: [] }, 'revision:read': undefined, 'revision:write': true, 'recovery:read': undefined, 'recovery:write': true })) ipcMain.handle(name, () => result)
  ipcMain.handle('project:getPendingOpen', event => { const state = states.get(event.sender.id); if (state.pendingExternal) return state.pendingExternal; if (!state.invalidExternal) return { canceled: true }; state.externalReads++; return { canceled: false, requestId: 99, filePath: state.file, content: '{invalid-project' } })
  ipcMain.handle('project:acknowledgeOpen', event => { const state = states.get(event.sender.id); state.invalidExternal = false; state.pendingExternal = undefined; return true })
  ipcMain.handle('system:setUiLocale', (_event, locale) => ({ locale }))
  ipcMain.handle('file:saveText', async (event, payload) => {
    const state = states.get(event.sender.id); state.saves.push(payload)
    if (state.fail) throw new Error('Injected save failure')
    if (state.cancel) return { canceled: true }
    const filePath = payload.filePath || state.file
    assert.ok(path.resolve(filePath).startsWith(out + path.sep))
    await fs.writeFile(filePath, payload.content)
    return { canceled: false, filePath }
  })
  ipcMain.handle('file:openText', async event => {
    const state = states.get(event.sender.id)
    return { canceled: false, filePath: state.openFilePath || state.file, content: await fs.readFile(state.openFilePath || state.file, 'utf8') }
  })
  await scenario('named-blank-create-and-overwrite', async (window, state) => {
    await openName(window, 'new', '全新 中文剧本', true)
    await until(() => evaluate(window, `!document.querySelector('.project-name-dialog')`), 'created')
    const saved = JSON.parse(await fs.readFile(state.file, 'utf8'))
    assert.equal(saved.title, '全新 中文剧本'); assert.equal(saved.elements.length, 1); assert.equal(saved.elements[0].text, '')
    assert.equal(state.saves[0].filePath, undefined); assert.ok(state.saves[0].suggestedName.includes('全新 中文剧本'))
    assert.equal(state.saves.length, 1, 'Repeated submit must not create two files')
    await evaluate(window, `document.querySelector('.editor-row textarea').focus()`); await window.webContents.insertText('保存后重新打开的最新正文……')
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await fs.readFile(state.file, 'utf8')).includes('保存后重新打开的最新正文'), 'overwritten')
    assert.equal(state.saves[1].filePath, state.file)
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.editor-row textarea').value.includes('保存后重新打开的最新正文')`), 'reopened latest')
  })
  for (const mode of ['cancel', 'fail']) await scenario(mode + '-creation-keeps-current', async (window, state) => {
    const before = await evaluate(window, `document.querySelector('.editor-row textarea').value`)
    state[mode] = true; await openName(window, 'new', '不能替换原稿')
    await until(() => evaluate(window, `!document.querySelector('.project-name-dialog input').disabled`), 'operation settled')
    assert.equal(await evaluate(window, `document.querySelector('.editor-row textarea').value`), before)
    assert.equal(await fs.stat(state.file).then(() => true, () => false), false)
    if (mode === 'fail') assert.ok(await evaluate(window, `Boolean(document.querySelector('[role="alert"]'))`))
    await evaluate(window, `document.querySelector('.project-name-dialog button[aria-label="关闭"]').click()`)
    assert.equal(await evaluate(window, `Boolean(document.querySelector('.project-name-dialog'))`), false)
  })
  await scenario('rename-preserves-path-and-body', async (window, state) => {
    await openName(window, 'new', '原名称'); await until(() => evaluate(window, `!document.querySelector('.project-name-dialog')`), 'created')
    await evaluate(window, `document.querySelector('.editor-row textarea').focus()`); await window.webContents.insertText('正文必须保留')
    await openName(window, 'rename', '修改后的名称'); await until(() => evaluate(window, `!document.querySelector('.project-name-dialog')`), 'renamed')
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await fs.readFile(state.file, 'utf8')).includes('修改后的名称'), 'renamed save')
    const saved = JSON.parse(await fs.readFile(state.file, 'utf8'))
    assert.equal(saved.titlePage.title, '修改后的名称'); assert.ok(saved.elements[0].text.includes('正文必须保留')); assert.equal(state.saves.at(-1).filePath, state.file)
  })
  await scenario('cancel-current-save-blocks-new', async (window, state) => {
    await evaluate(window, `document.querySelector('.editor-row textarea').focus()`); await window.webContents.insertText('尚未保存的重要原稿')
    state.cancel = true; await openName(window, 'new', '新稿')
    await until(() => evaluate(window, `Boolean(document.querySelector('[role="alert"]'))`), 'unsaved blocker')
    assert.ok(await evaluate(window, `document.querySelector('.editor-row textarea').value.includes('尚未保存的重要原稿')`)); assert.equal(state.saves.length, 1)
    assert.ok(state.saves[0].content.includes('尚未保存的重要原稿'))
  })
  await scenario('corrupt-external-waits-for-explicit-retry', async (window, state) => {
    state.invalidExternal = true; state.externalReads = 0
    window.webContents.send('project:openAvailable')
    await until(() => evaluate(window, `Boolean(document.querySelector('.external-open-banner'))`), 'invalid external warning')
    await wait(600); assert.equal(state.externalReads, 1, 'Corrupt input was retried automatically')
    await evaluate(window, `document.querySelector('.external-open-banner button').click()`)
    await until(() => state.externalReads === 2, 'explicit retry')
    await wait(300); assert.equal(state.externalReads, 2)
    await evaluate(window, `document.querySelector('.external-open-banner button:last-child').click()`)
    await until(() => evaluate(window, `!document.querySelector('.external-open-banner')`), 'cancel invalid external')
  })
  await scenario('cancel-save-keeps-external-request-visible', async (window, state) => {
    await evaluate(window, `document.querySelector('.editor-row textarea').focus()`); await window.webContents.insertText('必须保留的未保存正文')
    await wait(100)
    state.cancel = true
    state.pendingExternal = { canceled: false, requestId: 101, filePath: state.file, content: await fs.readFile(path.join(root, 'tests/fixtures/document-import/last-bus-final.ssproj'), 'utf8') }
    window.webContents.send('project:openAvailable')
    await until(() => evaluate(window, `Boolean(document.querySelector('.external-open-banner'))`), 'queued open visible')
    await evaluate(window, `document.querySelector('.external-open-banner button').click()`)
    await until(() => state.saves.length === 1, 'save canceled')
    await wait(400)
    assert.ok(await evaluate(window, `Boolean(document.querySelector('.external-open-banner'))`), 'Canceled save hid the pending request')
    assert.ok(await evaluate(window, `document.querySelector('.editor-row textarea').value.includes('必须保留的未保存正文')`))
    assert.equal(state.pendingExternal.requestId, 101)
    await evaluate(window, `document.querySelector('.external-open-banner button:last-child').click()`)
    await until(() => evaluate(window, `!document.querySelector('.external-open-banner')`), 'cancel pending request')
  })
  await scenario('fdx-import-saves-ssproj-without-corrupting-source', async (window, state) => {
    state.openFilePath = path.join(out, 'original.fdx')
    const original = '<?xml version="1.0"?><FinalDraft DocumentType="Script" Template="No" Version="1"><Content><Paragraph Type="Action"><Text>FDX原文件保持原样</Text></Paragraph></Content></FinalDraft>'
    await fs.writeFile(state.openFilePath, original)
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.editor-row textarea').value.includes('FDX原文件保持原样')`), 'FDX imported')
    window.webContents.send('menu:command', 'saveProject')
    await until(() => state.saves.length === 1, 'save as SSProj')
    await until(async () => await fs.stat(state.file).then(() => true, () => false), 'SSProj created')
    assert.equal(state.saves[0].filePath, undefined)
    assert.ok(state.saves[0].suggestedName.endsWith('.ssproj'))
    assert.equal(await fs.readFile(state.openFilePath, 'utf8'), original)
    assert.ok(JSON.parse(await fs.readFile(state.file, 'utf8')).elements[0].text.includes('FDX原文件保持原样'))
  })
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: true, platform: process.platform, checks }, null, 2))
  console.log(JSON.stringify({ passed: true, output: out, checks: checks.length })); app.exit(0)
}
main().catch(async error => { await fs.mkdir(out, { recursive: true }); await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: false, checks, error: error.stack }, null, 2)); console.error(error); app.exit(1) })
