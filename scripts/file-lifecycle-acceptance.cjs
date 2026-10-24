const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), out = path.resolve(process.env.SCREENPLAY_GATE_OUTPUT || path.join(root, 'acceptance-results'), 'file-lifecycle-' + Date.now())
const { assertBackupDestination } = require('../electron/backupDestination.cjs')
const { renderPdf } = require('../electron/renderPdf.cjs')
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
const editorText = window => evaluate(window, `(() => { const e=document.querySelector('.editor-row textarea, .rich-script-editor'); return e.tagName==='TEXTAREA' ? e.value : e.textContent })()`)
async function savedText(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')).elements[0].text }
  catch (error) { if (error instanceof SyntaxError || error.code === 'ENOENT') return undefined; throw error }
}
async function styledFixture(window, state) {
  const project = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/document-import/last-bus-final.ssproj'), 'utf8'))
  project.title = 'Synthetic save transaction'
  project.fontFamily = 'SimSun'
  project.elements = [{ id: 'save-race-rich', type: 'action', text: '角色甲等待\u2026\u2026ABC', textRuns: [{ start: 0, end: 3, bold: true }, { start: 7, end: 10, italic: true, underline: true, fontFamily: 'SimHei' }] }]
  await fs.writeFile(state.file, JSON.stringify(project), 'utf8')
  window.webContents.send('menu:command', 'openProject')
  await until(() => evaluate(window, `Boolean(document.querySelector('.rich-script-editor[data-element-id="save-race-rich"]'))`), 'styled fixture opened')
  return project
}
async function typeAtEnd(window, text) {
  await evaluate(window, `(() => { const e=document.querySelector('.editor-row textarea, .rich-script-editor'); e.focus(); if(e.tagName==='TEXTAREA') e.setSelectionRange(e.value.length,e.value.length); else {const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);} })()`)
  await window.webContents.insertText(text)
  await until(async () => (await editorText(window)).endsWith(text), 'inserted text')
  await wait(100)
}
async function scenario(name, run) {
  const window = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), partition: name + Date.now(), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  const state = { saves: [], file: path.join(out, name + '.ssproj'), pngPages: [], pngFinishes: [], pngTokens: new Set(), pngStarts: 0 }
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
  for (const [name, result] of Object.entries({ 'system:listFonts': { fonts: [] }, 'revision:read': undefined, 'revision:write': true, 'recovery:read': undefined })) ipcMain.handle(name, () => result)
  ipcMain.handle('recovery:write', event => !states.get(event.sender.id).failRecovery)
  ipcMain.handle('project:getPendingOpen', event => { const state = states.get(event.sender.id); if (state.pendingExternal) return state.pendingExternal; if (!state.invalidExternal) return { canceled: true }; state.externalReads++; return { canceled: false, requestId: 99, filePath: state.file, content: '{invalid-project' } })
  ipcMain.handle('project:acknowledgeOpen', event => { const state = states.get(event.sender.id); state.invalidExternal = false; state.pendingExternal = undefined; return true })
  ipcMain.handle('system:setUiLocale', (_event, locale) => ({ locale }))
  ipcMain.handle('file:saveText', async (event, payload) => {
    const state = states.get(event.sender.id); state.saves.push(payload)
    if (state.deferNextSave) {
      state.deferNextSave = false
      await new Promise(resolve => { state.resumeSave = resolve })
      state.resumeSave = undefined
    }
    if (state.fail) throw new Error('Injected save failure')
    if (state.cancel) return { canceled: true }
    const filePath = payload.filePath || state.file
    assert.ok(path.resolve(filePath).startsWith(out + path.sep))
    if (payload.protectFilePath) await assertBackupDestination(filePath, payload.protectFilePath)
    await fs.writeFile(filePath, payload.content)
    return { canceled: false, filePath }
  })
  ipcMain.handle('export:pdf', async (event, payload) => {
    const state = states.get(event.sender.id); state.pdfExports = (state.pdfExports || 0) + 1
    if (state.pdfDestination) {
      if (payload.protectFilePath) await assertBackupDestination(state.pdfDestination, payload.protectFilePath)
      const pdf = await renderPdf(payload.html, { app, BrowserWindow })
      await fs.writeFile(state.pdfDestination, pdf)
      state.pdfCompleted = (state.pdfCompleted || 0) + 1
      return { canceled: false, filePath: state.pdfDestination }
    }
    if (payload.protectFilePath) await assertBackupDestination(state.file, payload.protectFilePath)
    await fs.writeFile(state.file, '%PDF-synthetic-output')
    return { canceled: false, filePath: state.file }
  })
  ipcMain.handle('export:choosePngFolder', event => {
    const state = states.get(event.sender.id)
    state.pngStarts++
    if (state.pngMode === 'cancel') return { canceled: true }
    const exportToken = `synthetic-${event.sender.id}-${state.pngStarts}`
    state.pngTokens.add(exportToken)
    return { canceled: false, exportToken }
  })
  ipcMain.handle('export:pngPage', async (event, payload) => {
    const state = states.get(event.sender.id)
    assert.ok(state.pngTokens.has(payload.exportToken))
    state.pngPages.push({ token: payload.exportToken, name: payload.page.name })
    if (state.deferPngPage) {
      state.deferPngPage = false
      await new Promise(resolve => { state.resumePngPage = resolve })
      state.resumePngPage = undefined
    }
    if (state.pngMode === 'write-failure') throw Error('Injected PNG disk failure')
    return { canceled: false }
  })
  ipcMain.handle('export:finishPng', (event, payload) => {
    const state = states.get(event.sender.id)
    assert.ok(state.pngTokens.delete(payload.exportToken))
    state.pngFinishes.push(payload)
    if (state.pngMode === 'finish-failure') throw Error('Injected PNG finalization failure')
    return { canceled: false }
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
  await scenario('rich-delayed-save-undo-redo-and-reopen', async (window, state) => {
    const project = await styledFixture(window, state)
    await typeAtEnd(window, ' first')
    state.deferNextSave = true
    window.webContents.send('menu:command', 'saveProject')
    await until(() => state.resumeSave, 'save pending')
    await typeAtEnd(window, ' later')
    const latest = await editorText(window)
    state.resumeSave()
    await until(async () => (await fs.readFile(state.file, 'utf8')).includes(' first'), 'old projection saved')
    await wait(150)
    assert.equal(await editorText(window), latest, 'Late save replaced newer rich input')
    assert.ok(!JSON.parse(await fs.readFile(state.file, 'utf8')).elements[0].text.includes(' later'))
    window.webContents.send('menu:command', 'undoProject'); await wait(100)
    window.webContents.send('menu:command', 'redoProject'); await wait(100)
    assert.equal(await editorText(window), latest)
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => await savedText(state.file) === latest, 'latest input saved')
    assert.equal(state.saves.at(-1).filePath, state.file)
    const saved = JSON.parse(await fs.readFile(state.file, 'utf8'))
    assert.ok(saved.elements[0].textRuns.some(run => run.start === 0 && run.end === 3 && run.bold))
    assert.ok(saved.elements[0].textRuns.some(run => run.italic && run.underline && run.fontFamily === 'SimHei'))
    assert.equal(saved.fontFamily, project.fontFamily)
    window.webContents.send('menu:command', 'openProject'); await wait(200)
    assert.equal(await editorText(window), latest)
  })
  await scenario('rich-save-failure-edit-history-and-retry', async (window, state) => {
    await styledFixture(window, state)
    const original = await fs.readFile(state.file, 'utf8')
    await typeAtEnd(window, ' before failure')
    state.fail = true
    window.webContents.send('menu:command', 'saveProject')
    await until(() => evaluate(window, `document.querySelector('.statusbar').textContent.includes('保存失败')`), 'failure visible')
    assert.equal(await fs.readFile(state.file, 'utf8'), original)
    await typeAtEnd(window, ' after failure')
    const latest = await editorText(window)
    window.webContents.send('menu:command', 'undoProject'); await wait(100)
    window.webContents.send('menu:command', 'redoProject'); await wait(100)
    assert.equal(await editorText(window), latest)
    state.fail = false
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => await savedText(state.file) === latest, 'retry saved')
    assert.ok(JSON.parse(await fs.readFile(state.file, 'utf8')).elements[0].textRuns.some(run => run.bold))
    assert.equal(state.saves.at(-1).filePath, state.file)
    window.webContents.send('menu:command', 'openProject'); await wait(200)
    assert.equal(await editorText(window), latest)
  })
  await scenario('rich-cancel-save-as-retains-original-path', async (window, state) => {
    await styledFixture(window, state)
    const original = await fs.readFile(state.file, 'utf8')
    await typeAtEnd(window, ' canceled copy')
    const latest = await editorText(window)
    state.cancel = true
    window.webContents.send('menu:command', 'saveProjectAs')
    await until(() => state.saves.length === 1, 'save-as requested')
    await wait(150)
    assert.equal(state.saves[0].filePath, undefined)
    assert.equal(await fs.readFile(state.file, 'utf8'), original)
    assert.equal(await editorText(window), latest)
    state.cancel = false
    window.webContents.send('menu:command', 'saveProject')
    await until(() => state.saves.length === 2, 'normal save requested')
    await until(async () => await savedText(state.file) === latest, 'original overwritten')
    assert.equal(state.saves[1].filePath, state.file)
  })
  await scenario('failed-rich-recovery-blocks-open-with-specific-warning', async (window, state) => {
    await styledFixture(window, state)
    state.failRecovery = true
    await evaluate(window, `(() => { const original=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value) { if(key==='screenplay-studio.autosave.v1') throw new DOMException('Injected full storage','QuotaExceededError'); return original.call(this,key,value) } })()`)
    await typeAtEnd(window, ' must not discard')
    const before = await editorText(window)
    state.openFilePath = path.join(out, 'different-project.ssproj')
    await fs.copyFile(path.join(root, 'tests/fixtures/document-import/last-bus-final.ssproj'), state.openFilePath)
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.statusbar').textContent.includes('自动保存失败') || document.querySelector('.statusbar').textContent.includes('正在写入恢复副本')`), 'specific persistence warning')
    assert.equal(await editorText(window), before, 'Unprotected rich draft was replaced')
    await typeAtEnd(window, ' still editable')
    state.failRecovery = false
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await savedText(state.file))?.endsWith(' still editable'), 'original recovered by explicit save')
  })
  for (const kind of ['fdx', 'pdf']) await scenario(kind + '-export-cannot-replace-original-project', async (window, state) => {
    await styledFixture(window, state)
    const original = await fs.readFile(state.file, 'utf8')
    window.webContents.send('menu:command', kind === 'fdx' ? 'exportFdx' : 'exportPdf')
    if (kind === 'pdf') {
      await until(() => evaluate(window, `Boolean(document.querySelector('.format-preview-dialog .pdf-primary-button'))`), 'PDF preview ready')
      await evaluate(window, `document.querySelector('.format-preview-dialog .pdf-primary-button').click()`)
    }
    await until(() => kind === 'fdx' ? state.saves.length === 1 : state.pdfExports === 1, 'export requested')
    await wait(150)
    assert.equal(await fs.readFile(state.file, 'utf8'), original, 'Export replaced source project')
    assert.ok(await evaluate(window, `document.querySelector('.statusbar').textContent.includes('导出失败')`))
    await typeAtEnd(window, ' retained after export rejection')
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await savedText(state.file))?.endsWith(' retained after export rejection'), 'normal original save still works')
    assert.equal(state.saves.at(-1).filePath, state.file)
  })
  for (const mode of ['cancel', 'write-failure', 'finish-failure']) await scenario('png-' + mode + '-retains-input-and-allows-retry', async (window, state) => {
    await styledFixture(window, state)
    state.pngMode = mode
    window.webContents.send('menu:command', 'exportPng')
    await until(() => mode === 'cancel' ? state.pngStarts === 1 : state.pngFinishes.length === 1, 'PNG attempt settled')
    await wait(100)
    assert.equal(state.pngTokens.size, 0)
    if (mode === 'cancel') {
      assert.equal(state.pngPages.length, 0); assert.equal(state.pngFinishes.length, 0)
    } else {
      assert.equal(state.pngFinishes[0].completed, mode === 'finish-failure')
      assert.ok(await evaluate(window, `document.querySelector('.statusbar').textContent.includes('导出失败')`))
    }
    await typeAtEnd(window, ' input after ' + mode)
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await savedText(state.file))?.endsWith(' input after ' + mode), 'input saved after PNG attempt')
    state.pngMode = undefined
    window.webContents.send('menu:command', 'exportPng')
    await until(() => state.pngFinishes.some(item => item.completed && item.exportToken.endsWith('-2')), 'second PNG completed')
    await until(() => evaluate(window, `document.querySelector('.statusbar').textContent.includes('PNG 已生成')`), 'PNG success visible')
    assert.equal(state.pngTokens.size, 0)
  })
  await scenario('typing-during-png-does-not-replace-current-draft', async (window, state) => {
    await styledFixture(window, state)
    state.deferPngPage = true
    window.webContents.send('menu:command', 'exportPng')
    await until(() => state.resumePngPage, 'PNG write deferred')
    await typeAtEnd(window, ' typed during export')
    const latest = await editorText(window)
    window.webContents.send('menu:command', 'newProject'); await wait(100)
    assert.equal(await evaluate(window, `Boolean(document.querySelector('.project-name-dialog'))`), false)
    state.resumePngPage()
    await until(() => state.pngFinishes.some(item => item.completed), 'PNG finished')
    await wait(100)
    assert.equal(await editorText(window), latest)
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => await savedText(state.file) === latest, 'newer draft saved')
    assert.equal(state.saves.at(-1).filePath, state.file)
    assert.equal(state.pngTokens.size, 0)
  })
  for (const overflowField of ['title', 'contact']) await scenario(`png-cover-${overflowField}-overflow-closes-session-and-preserves-editing`, async (window, state) => {
    const fixture = await styledFixture(window, state)
    fixture.title = 'PNG cover overflow'
    fixture.titlePage = { ...fixture.titlePage, enabled: true, title: 'A fitting title', [overflowField]: 'OVERFLOW\n'.repeat(100) }
    fixture.exportSettings = { ...fixture.exportSettings, profileId: 'us-spec', includeTitlePage: true }
    await fs.writeFile(state.file, JSON.stringify(fixture), 'utf8')
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.project-title-button').textContent === 'PNG cover overflow'`), 'overflow fixture reopened')
    window.webContents.send('menu:command', 'exportPng')
    await until(() => state.pngFinishes.length === 1, 'rendering failure settled')
    assert.equal(state.pngFinishes[0].completed, false)
    assert.equal(state.pngPages.length, 0)
    assert.equal(state.pngTokens.size, 0)
    assert.ok(await evaluate(window, `document.querySelector('.statusbar').textContent.includes('封面文字放不下一页')`))
    await typeAtEnd(window, ' retained after cover overflow')
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await savedText(state.file))?.endsWith(' retained after cover overflow'), 'input saved after rendering failure')
    const repaired = JSON.parse(await fs.readFile(state.file, 'utf8'))
    repaired.title = 'PNG repaired'; repaired.titlePage[overflowField] = 'A fitting field'
    await fs.writeFile(state.file, JSON.stringify(repaired), 'utf8')
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.project-title-button').textContent === 'PNG repaired'`), 'corrected cover reopened')
    window.webContents.send('menu:command', 'exportPng')
    await until(() => state.pngFinishes.some(item => item.completed), 'retry completed')
    assert.equal(state.pngTokens.size, 0)
    assert.equal(await editorText(window), repaired.elements[0].text)
  })
  await scenario('pdf-cover-overflow-preserves-output-and-shows-specific-retry-message', async (window, state) => {
    const fixture = await styledFixture(window, state)
    fixture.title = 'PDF cover overflow'
    fixture.titlePage = { ...fixture.titlePage, enabled: true, title: 'TITLE\n'.repeat(100) }
    fixture.exportSettings = { ...fixture.exportSettings, profileId: 'us-spec', includeTitlePage: true }
    await fs.writeFile(state.file, JSON.stringify(fixture), 'utf8')
    state.pdfDestination = path.join(out, 'existing-cover-output.pdf')
    await fs.writeFile(state.pdfDestination, 'Previous PDF output')
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.project-title-button').textContent === 'PDF cover overflow'`), 'PDF overflow fixture reopened')
    const attempt = async () => {
      window.webContents.send('menu:command', 'exportPdf')
      await until(() => evaluate(window, `Boolean(document.querySelector('.format-preview-dialog .pdf-primary-button'))`), 'PDF preview opened')
      await evaluate(window, `document.querySelector('.format-preview-dialog .pdf-primary-button').click()`)
    }
    await attempt()
    await until(() => evaluate(window, `document.querySelector('.statusbar').textContent.includes('封面文字放不下一页')`), 'specific PDF overflow warning')
    assert.equal(await fs.readFile(state.pdfDestination, 'utf8'), 'Previous PDF output')
    assert.equal(state.pdfCompleted || 0, 0)
    assert.equal(await evaluate(window, `Boolean(document.querySelector('.format-preview-dialog'))`), false)
    assert.equal(await evaluate(window, `document.activeElement.dataset.elementId`), 'save-race-rich', 'PDF rejection did not return focus to the editor')
    await typeAtEnd(window, ' retained after PDF rejection')
    window.webContents.send('menu:command', 'saveProject')
    await until(async () => (await savedText(state.file))?.endsWith(' retained after PDF rejection'), 'input saved after PDF rejection')
    const repaired = JSON.parse(await fs.readFile(state.file, 'utf8'))
    repaired.title = 'PDF repaired'; repaired.titlePage.title = 'A fitting title'
    await fs.writeFile(state.file, JSON.stringify(repaired), 'utf8')
    window.webContents.send('menu:command', 'openProject')
    await until(() => evaluate(window, `document.querySelector('.project-title-button').textContent === 'PDF repaired'`), 'corrected PDF cover reopened')
    await attempt()
    await until(() => state.pdfCompleted === 1, 'actual PDF retry completed')
    assert.equal((await fs.readFile(state.pdfDestination)).subarray(0, 5).toString(), '%PDF-')
  })
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: true, platform: process.platform, checks }, null, 2))
  console.log(JSON.stringify({ passed: true, output: out, checks: checks.length })); app.exit(0)
}
main().catch(async error => { await fs.mkdir(out, { recursive: true }); await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: false, checks, error: error.stack }, null, 2)); console.error(error); app.exit(1) })
