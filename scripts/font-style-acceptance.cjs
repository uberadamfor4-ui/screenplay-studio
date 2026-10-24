const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { decodeTextBuffer } = require('../electron/documentSafety.cjs')
const { renderPdf } = require('../electron/renderPdf.cjs')
const root = path.resolve(__dirname, '..'), out = path.resolve(process.env.SCREENPLAY_GATE_OUTPUT || path.join(root, 'acceptance-results'), 'font-style-' + Date.now())
app.setPath('userData', path.join(out, 'profile'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let window, saved, fixture, pdfHtml, pdfDone = false, completedSaves = 0
let fixtureExtension = 'ssproj'
let exportPrefix = 'synthetic', pngDone = false
let pdfFailure
const checks = []
const evaluate = source => window.webContents.executeJavaScript(source)
async function until(source) { for (let i = 0; i < 100; i++) { if (await evaluate(source)) return; await wait(50) }; throw Error('Timed out: ' + source) }
async function command(name) { window.webContents.send('menu:command', name); await wait(150) }
async function save() { const before = completedSaves; await command('saveProject'); for (let i = 0; completedSaves === before && i < 100; i++) await wait(50); assert.ok(completedSaves > before, 'Save did not complete'); return JSON.parse(saved) }
async function waitForPdf() {
  const deadline = Date.now() + 145_000
  while (!pdfDone && !pdfFailure && Date.now() < deadline) await wait(50)
  if (pdfFailure) throw pdfFailure
  assert.ok(pdfDone, 'Actual Chromium PDF did not complete within its production rendering deadline')
}
async function select(start, end) {
  await evaluate(`(() => { const e=document.querySelector('.editor-row textarea, .rich-script-editor'); e.focus(); if(e.tagName==='TEXTAREA') {e.setSelectionRange(${start},${end});return;} const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT), nodes=[];while(w.nextNode()) nodes.push(w.currentNode);function point(n){for(const t of nodes){if(n<=t.length)return [t,n];n-=t.length;}return [nodes.at(-1),nodes.at(-1).length]}const a=point(${start}),b=point(${end}),r=document.createRange();r.setStart(...a);r.setEnd(...b);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));})()`)
  await wait(100)
}
async function clickStyle(name) { await evaluate(`document.querySelector('button[aria-label="${name}"]').click()`); await wait(100) }
async function main() {
  await fs.mkdir(out, { recursive: true }); await app.whenReady(); app.on('window-all-closed', () => {})
  for (const [name, result] of Object.entries({ 'system:listFonts': { fonts: ['SimSun', 'SimHei', '微软雅黑', 'w_MSCS-ExtB'] }, 'revision:read': undefined, 'revision:write': true, 'recovery:read': undefined, 'recovery:write': true, 'project:getPendingOpen': { canceled: true } })) ipcMain.handle(name, () => result)
  ipcMain.handle('system:setUiLocale', (_e, locale) => ({ locale }))
  ipcMain.handle('file:saveText', async (_e, payload) => { saved = payload.content; await fs.writeFile(path.join(out, 'synthetic.ssproj'), saved, 'utf8'); completedSaves++; return { canceled: false, filePath: path.join(out, 'synthetic.ssproj') } })
  ipcMain.handle('file:openText', () => ({ canceled: false, filePath: path.join(out, 'synthetic.' + fixtureExtension), content: fixture || decodeTextBuffer(Buffer.from(saved), { project: true }) }))
  ipcMain.handle('export:choosePngFolder', () => ({ canceled: false, exportToken: 'font-qa' }))
  ipcMain.handle('export:pngPage', async (_e, payload) => {
    const bytes = Buffer.from(payload.page.dataUrl.split(',')[1], 'base64'), image = nativeImage.createFromBuffer(bytes)
    assert.ok(image.getSize().width > 800 && image.getSize().height > 1000)
    const pixels = image.toBitmap(); let ink = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 180 && pixels[i + 1] < 180 && pixels[i + 2] < 180) ink++
    assert.ok(ink > 100, 'PNG contains no screenplay ink')
    await fs.writeFile(path.join(out, exportPrefix + '.png'), bytes)
    return { canceled: false }
  })
  ipcMain.handle('export:finishPng', (_e, payload) => { pngDone = payload.completed; return { canceled: false } })
  ipcMain.handle('export:pdf', async (_e, payload) => {
    const startedAt = Date.now()
    pdfFailure = undefined
    try {
      pdfHtml = payload.html
      const html = payload.html.replaceAll('{{SCREENPLAY_CJK_REGULAR_FONT_URL}}', pathToFileURL(path.join(root, 'src/assets/fonts/ScreenplayCJK-Regular.otf')).href).replaceAll('{{SCREENPLAY_CJK_BOLD_FONT_URL}}', pathToFileURL(path.join(root, 'src/assets/fonts/ScreenplayCJK-Bold.otf')).href)
      const htmlPath = path.join(out, exportPrefix + '-actual-print.html')
      await fs.writeFile(htmlPath, html)
      await fs.writeFile(path.join(out, exportPrefix + '.pdf'), await renderPdf(payload.html, { app, BrowserWindow }))
      pdfDone = true
      console.log(JSON.stringify({ event: 'pdf-render-completed', exportPrefix, durationMs: Date.now() - startedAt }))
      return { canceled: false, filePath: path.join(out, 'synthetic.pdf') }
    } catch (error) {
      pdfFailure = error
      console.error(JSON.stringify({ event: 'pdf-render-failed', exportPrefix, durationMs: Date.now() - startedAt, message: error.message }))
      throw error
    }
  })
  fixture = JSON.stringify({ appVersion: '0.7.7', title: '字体与局部标注验收', author: 'QA', language: 'zh-CN', formatId: 'hollywood', fontFamily: 'SimSun', fontSize: 12, pageSize: 'letter', elements: [{ id: 'font-qa', type: 'action', text: '郭然说：中文斜体与局部下划线……� 繁體 English 𠮷😀' }] })
  window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  window.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('RENDERER', message) })
  await window.loadFile(path.join(root, 'dist/index.html')); await until("Boolean(document.querySelector('.editor-row textarea'))"); await wait(200); await command('openProject')
  await until("document.querySelector('.editor-row textarea')?.value.startsWith('郭然')")
  const fontOptions = await evaluate("Array.from(document.querySelector('select[aria-label=全文字体]').options).map(o=>({text:o.text,value:o.value}))")
  assert.equal(fontOptions.find(item => item.value === 'SimSun')?.text, '宋体'); assert.ok(!fontOptions.some(item => item.value === 'w_MSCS-ExtB'))
  checks.push('readable-font-names-and-hidden-internal-aliases')
  await evaluate("(()=>{const s=document.querySelector('select[aria-label=全文字体]');s.value='SimHei';s.dispatchEvent(new Event('change',{bubbles:true}));})()"); await wait(80)
  assert.equal((await save()).fontFamily, 'SimHei')
  await evaluate("(()=>{const s=document.querySelector('select[aria-label=全文字体]');s.value='SimSun';s.dispatchEvent(new Event('change',{bubbles:true}));})()"); await wait(80)
  assert.equal((await save()).fontFamily, 'SimSun')
  checks.push('project-font-control-persists-real-family-value')
  await select(0, 2); await clickStyle('加粗'); await until("Boolean(document.querySelector('.rich-script-editor .rich-bold'))")
  let project = await save(); assert.equal(project.elements[0].textRuns.find(run => run.start === 0 && run.end === 2)?.bold, true)
  assert.ok(!project.elements[0].textStyle?.bold, 'Only selected name should become bold')
  await select(4, 8); await clickStyle('斜体'); assert.ok(await evaluate("Boolean(document.querySelector('.rich-script-editor .rich-italic'))"))
  await select(9, 14); await clickStyle('下划线'); assert.ok(await evaluate("Boolean(document.querySelector('.rich-script-editor .rich-underline'))"))
  checks.push('partial-bold-italic-underline-with-retained-selection')
  await select(2, 2); await window.webContents.insertText('新增'); await wait(150)
  project = await save(); assert.ok(project.elements[0].text.includes('郭然新增说'))
  const expected = project.elements[0]
  fixture = undefined; await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor'))")
  project = await save(); assert.deepEqual(project.elements[0], expected); assert.ok(project.elements[0].text.includes('� 繁體'))
  checks.push('rich-typing-and-font-save-reopen-exact-unicode-and-ranges')
  await command('undoProject'); await command('redoProject'); project = await save(); assert.deepEqual(project.elements[0], expected)
  checks.push('rich-undo-redo-keeps-body-and-ranges')
  await select(project.elements[0].text.length, project.elements[0].text.length); await window.webContents.insertText('继续输入'); await wait(150)
  project = await save(); assert.ok(project.elements[0].text.endsWith('继续输入'))
  checks.push('input-continues-after-save-reopen')
  await select(4, 6)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'B', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'B', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
  await wait(100)
  project = await save(); assert.ok(!project.elements[0].textStyle?.bold)
  assert.ok(project.elements[0].textRuns.some(run => run.start <= 4 && run.end >= 6 && run.bold))
  checks.push('native-formatting-shortcut-is-partial-not-paragraph-wide')
  const beforeSplit = project.elements[0].text
  await select(6, 6)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await wait(150)
  project = await save(); assert.equal(project.elements.length, 2); assert.equal(project.elements.map(element => element.text).join(''), beforeSplit)
  assert.equal(await evaluate("document.activeElement.dataset.elementId"), project.elements[1].id)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' }); await wait(150)
  project = await save(); assert.equal(project.elements.length, 1); assert.equal(project.elements[0].text.replace('\n', ''), beforeSplit)
  assert.ok(project.elements[0].textRuns.some(run => run.italic)); assert.ok(project.elements[0].textRuns.some(run => run.underline))
  checks.push('rich-split-focus-and-backspace-merge-preserve-styles')
  await command('exportPdf'); await until("Boolean(document.querySelector('.preview-zoom-toolbar'))")
  const before = await evaluate("document.querySelector('.format-preview-dialog .script-page').getBoundingClientRect().width")
  await evaluate("(()=>{const s=document.querySelector('select[aria-label=预览缩放]');s.value='1.5';s.dispatchEvent(new Event('change',{bubbles:true}))})()"); await wait(150)
  const after = await evaluate("document.querySelector('.format-preview-dialog .script-page').getBoundingClientRect().width")
  assert.ok(after > before * 2); assert.ok(await evaluate("document.querySelector('.preview-pages').scrollWidth > document.querySelector('.preview-pages').clientWidth"))
  await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
  window.webContents.invalidate(); await wait(250)
  await fs.writeFile(path.join(out, 'preview-150.png'), (await window.webContents.capturePage()).toPNG())
  checks.push('pdf-preview-150-percent-with-horizontal-scroll')
  await evaluate("document.querySelector('.format-preview-dialog .pdf-primary-button').click()"); await wait(500)
  await waitForPdf()
  assert.ok(pdfHtml?.includes('font-style:italic')); assert.ok(pdfHtml?.includes('text-decoration:underline')); assert.ok(pdfHtml?.includes('郭然'))
  await fs.writeFile(path.join(out, 'rich-print.html'), pdfHtml)
  checks.push('pdf-html-preserves-partial-styles')
  await until("!document.querySelector('.format-preview-dialog')")
  const beforeComposition = (await save()).elements[0].text
  await select(beforeComposition.length, beforeComposition.length)
  await evaluate("document.querySelector('.rich-script-editor').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}))")
  await window.webContents.insertText('中文输入验收')
  await evaluate("document.querySelector('.rich-script-editor').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文输入验收'}))")
  await wait(120)
  const afterComposition = (await save()).elements[0].text
  assert.equal(afterComposition, beforeComposition + '中文输入验收')
  await command('undoProject'); assert.equal((await save()).elements[0].text, beforeComposition)
  await command('redoProject'); assert.equal((await save()).elements[0].text, afterComposition)
  checks.push('rich-composition-after-export-one-undo-step-no-duplication')
  fixture = JSON.stringify({ ...project, elements: [{ id: 'newlines-qa', type: 'action', text: 'aa\n\nbb', textRuns: [{ start: 4, end: 6, bold: true }] }] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=\"newlines-qa\"]'))")
  await select(1000, 1000); await window.webContents.insertText('中'); await wait(120)
  const multiline = (await save()).elements[0]
  assert.equal(multiline.text, 'aa\n\nbb中')
  assert.ok(multiline.textRuns.some(run => run.start === 4 && run.end === 7 && run.bold))
  checks.push('rich-newline-and-empty-line-style-offsets')
  await evaluate("(()=>{const e=document.querySelector('.rich-script-editor');const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));})()")
  await wait(100)
  await evaluate(`(()=>{const e=document.querySelector('.rich-script-editor');const data=new DataTransfer();data.setData('text/html','<p></p><p><b>BB</b></p>');data.setData('text/plain',${JSON.stringify('\n\nBB')});e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()`)
  await wait(150)
  const pasted = (await save()).elements[0]
  assert.ok(pasted.text.endsWith('BB'))
  const boldText = pasted.textRuns.filter(run => run.bold).map(run => pasted.text.slice(run.start, run.end)).join('')
  assert.equal(boldText, 'BB')
  checks.push('rich-html-paste-with-empty-first-paragraph-preserves-style-offsets')
  fixture = JSON.stringify({ ...project, elements: [{ id: 'trailing-qa', type: 'action', text: 'aa', textRuns: [{ start: 0, end: 2, bold: true }] }] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=\"trailing-qa\"]'))")
  await select(1000, 1000)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] }); await wait(120)
  assert.equal((await save()).elements[0].text, 'aa\n')
  await clickStyle('斜体')
  assert.ok(await evaluate("Boolean(document.querySelector('.rich-script-editor .rich-italic'))"), 'Whole paragraph style must rebuild inherited inline styles')
  await window.webContents.insertText('中'); await wait(120)
  assert.equal((await save()).elements[0].text, 'aa\n中')
  checks.push('whole-paragraph-style-and-caret-after-trailing-newline')
  fixture = JSON.stringify({ ...project, elements: [{ id: 'transition-qa', type: 'transition', text: '切至：', textRuns: [{ start: 0, end: 2, bold: true }] }] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=\"transition-qa\"]'))")
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.rich-script-editor p')).textAlign"), 'right')
  checks.push('partial-styled-transition-remains-right-aligned')
  fixture = JSON.stringify({ ...project, formatId: 'eastAsia', pageSize: 'a4', exportSettings: { ...project.exportSettings, profileId: 'custom' }, elements: [{ id: 'cue-qa', type: 'character', text: '郭然' }, { id: 'speech-qa', type: 'dialogue', text: '我们走吧。' }, { id: 'cut-qa', type: 'transition', text: '切至：' }] })
  await command('openProject'); await until("Boolean(document.querySelector('.inline-dialogue-toggle input'))")
  await evaluate("document.querySelector('.inline-dialogue-toggle input').click()"); await wait(120)
  const aligned = await evaluate("(()=>{const a=document.querySelector('.inline-cue').getBoundingClientRect(),b=document.querySelector('.inline-speech').getBoundingClientRect();return Math.abs(a.top-b.top)<2 && b.left>a.left})()")
  assert.ok(aligned)
  const east = await save(); assert.equal(east.eastAsianDialogueStyle, 'inline'); assert.equal(east.elements[0].type, 'character'); assert.equal(east.elements[1].type, 'dialogue')
  await command('exportPdf'); await until("Boolean(document.querySelector('.format-preview-dialog'))")
  assert.ok(await evaluate("document.querySelector('.preview-stack').textContent.includes('郭然：我们走吧。')"))
  assert.ok(await evaluate("Array.from(document.querySelectorAll('.audit-item')).some(item=>item.classList.contains('pass') && item.querySelector('strong')?.textContent==='转场')"))
  checks.push('east-asian-inline-dialogue-and-correct-transition-preflight')
  await evaluate("document.querySelector('.format-preview-dialog header button').click()")
  for (const formatId of ['hollywood', 'eastAsia', 'stage', 'audio']) {
    const body = '宋体黑体……繁體 日本語 한국어 English é 𠮷👩‍💻'
    exportPrefix = 'mixed-' + formatId
    fixture = JSON.stringify({ ...project, formatId, pageSize: formatId === 'eastAsia' || formatId === 'audio' ? 'a4' : 'letter', fontFamily: 'QA Missing Serif', exportSettings: { ...project.exportSettings, profileId: 'custom', includeTitlePage: false }, elements: [{ id: 'mixed-font-qa', type: 'action', text: body, textRuns: [{ start: 0, end: 2, fontFamily: 'SimSun', italic: true }, { start: 2, end: 4, fontFamily: 'SimHei', bold: true, underline: true }] }] })
    await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=mixed-font-qa]'))")
    assert.ok(await evaluate("document.querySelector('select[aria-label=全文字体]').selectedOptions[0].text.includes('后备字体')"))
    await select(body.length, body.length); await window.webContents.insertText('追加'); await wait(120)
    let mixed = await save()
    assert.equal(mixed.formatId, formatId); assert.equal(mixed.fontFamily, 'QA Missing Serif'); assert.equal(mixed.elements[0].text, body + '追加')
    assert.ok(mixed.elements[0].textRuns.some(run => run.fontFamily === 'SimSun'))
    assert.ok(mixed.elements[0].textRuns.some(run => run.fontFamily === 'SimHei'))
    assert.ok(!mixed.elements[0].textRuns.some(run => run.fontFamily?.includes(',')), 'CSS fallback stack leaked into project metadata')
    await command('exportPdf'); await until("Boolean(document.querySelector('.format-preview-dialog'))")
    assert.ok(await evaluate("Array.from(document.querySelectorAll('.audit-item')).some(item => item.querySelector('strong')?.textContent==='字体可用性' && !item.classList.contains('pass'))"))
    pdfDone = false
    await evaluate("document.querySelector('.format-preview-dialog .pdf-primary-button').click()")
    await waitForPdf()
    assert.ok(pdfHtml.includes('font-style:italic') && pdfHtml.includes('text-decoration:underline'))
    await until("!document.querySelector('.format-preview-dialog')")
    pngDone = false; await command('exportPng')
    for (let i = 0; !pngDone && i < 200; i++) await wait(50)
    assert.ok(pngDone)
    await select(body.length + 2, body.length + 2); await window.webContents.insertText('继续'); await wait(120)
    mixed = await save(); assert.equal(mixed.elements[0].text, body + '追加继续')
    checks.push('mixed-fonts-save-pdf-png-continued-input-' + formatId)
  }
  fixture = JSON.stringify({ ...project, elements: [
    { id: 'merge-first', type: 'action', text: '宋体第一段', textStyle: { fontFamily: 'SimSun', bold: true } },
    { id: 'merge-second', type: 'action', text: '黑体第二段', textStyle: { fontFamily: 'SimHei', italic: true } },
  ] })
  await command('openProject'); await until("Boolean(document.querySelector('textarea[data-element-id=merge-second]'))")
  await evaluate("(()=>{const e=document.querySelector('textarea[data-element-id=merge-second]');e.focus();e.setSelectionRange(0,0)})()")
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' }); await wait(150)
  const merged = (await save()).elements
  assert.equal(merged.length, 1); assert.equal(merged[0].text, '宋体第一段\n黑体第二段')
  assert.ok(merged[0].textRuns.some(run => run.start === 6 && run.fontFamily === 'SimHei' && run.italic), 'Merging replaced the second paragraph font with the first paragraph font')
  checks.push('paragraph-merge-preserves-both-original-fonts-and-emphasis')
  const denseText = '中'.repeat(5001), denseRuns = Array.from({ length: denseText.length }, (_, index) => ({ start: index, end: index + 1, bold: Boolean(index % 2) }))
  fixture = JSON.stringify({ ...project, elements: [
    { id: 'dense-first', type: 'action', text: denseText, textRuns: denseRuns },
    { id: 'dense-second', type: 'action', text: denseText, textRuns: denseRuns },
  ] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=dense-second]'))")
  const denseBefore = (await save()).elements
  await evaluate("(()=>{const e=document.querySelector('.rich-script-editor[data-element-id=dense-second]');e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))})()")
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' }); await wait(150)
  assert.ok(await evaluate("document.body.textContent.includes('局部文字标注过多')"))
  assert.deepEqual((await save()).elements, denseBefore, 'Rejected dense merge changed original text or formatting')
  await evaluate("(()=>{const e=document.querySelector('.rich-script-editor[data-element-id=dense-second]');e.focus();const r=document.createRange();r.setStart(e.querySelector('p').firstChild.firstChild,0);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))})()")
  await window.webContents.insertText('续'); await wait(150)
  const denseAfter = (await save()).elements
  assert.equal(denseAfter.length, 2); assert.equal(denseAfter[0].text, denseText); assert.equal(denseAfter[1].text, '续' + denseText)
  checks.push('dense-merge-limit-preserves-draft-and-allows-continued-input')
  fixture = JSON.stringify({ ...project, elements: [{ id: 'dense-paste', type: 'action', text: '原文字', textRuns: [{ start: 0, end: 3, bold: true }] }] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=dense-paste]'))")
  await select(0, 3)
  const pastedDenseText = Array.from({ length: 10002 }, (_, index) => index % 2 ? '中' : '文').join('')
  await evaluate(`(()=>{const e=document.querySelector('.rich-script-editor[data-element-id=dense-paste]'),data=new DataTransfer();data.setData('text/html',Array.from({length:10002},(_,i)=>i%2?'<b>中</b>':'<i>文</i>').join(''));data.setData('text/plain',${JSON.stringify(pastedDenseText)});e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()`)
  await until("document.body.textContent.includes('局部文字标注过多')")
  const pastedDense = (await save()).elements[0]
  assert.equal(pastedDense.text, pastedDenseText); assert.ok((pastedDense.textRuns?.length ?? 0) <= 10000)
  await command('undoProject'); assert.equal((await save()).elements[0].text, '原文字')
  await command('redoProject'); assert.equal((await save()).elements[0].text, pastedDenseText)
  await select(pastedDenseText.length, pastedDenseText.length); await window.webContents.insertText('续'); await wait(150)
  assert.equal((await save()).elements[0].text, pastedDenseText + '续')
  checks.push('excessive-html-formatting-keeps-text-undo-redo-and-typing')
  for (const formatId of ['hollywood', 'eastAsia']) {
    const body = 'a '.repeat(6000)
    const ranges = Array.from({ length: 6000 }, (_, i) => ({ start: i * 2, end: i * 2 + 1, bold: Boolean(i % 2), underline: true }))
    const elements = [{ id: 'dense-display-cue', type: 'character', text: body, textRuns: ranges }]
    if (formatId === 'eastAsia') elements.push({ id: 'dense-display-dialogue', type: 'dialogue', text: body, textRuns: ranges })
    fixture = JSON.stringify({ ...project, formatId, eastAsianDialogueStyle: 'inline', exportSettings: { ...project.exportSettings, profileId: 'custom', includeTitlePage: false, moreContinued: false }, elements })
    await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=dense-display-cue]'))")
    const originalElements = (await save()).elements
    await command('exportPdf'); await until("Boolean(document.querySelector('.format-preview-dialog .script-line'))")
    const displayedText = await evaluate("Array.from(document.querySelectorAll('.preview-stack .script-line')).map(e=>e.textContent).join('')")
    assert.equal(displayedText, formatId === 'hollywood' ? body.toUpperCase() : body + '\uff1a' + body)
    assert.ok(await evaluate("Array.from(document.querySelectorAll('.preview-stack .script-line span')).some(e=>getComputedStyle(e).textDecorationLine.includes('underline'))"))
    await evaluate("document.querySelector('.format-preview-dialog header button').click()")
    assert.deepEqual((await save()).elements, originalElements, 'Dense display changed saved ranges')
    await select(body.length, body.length); await window.webContents.insertText(' next'); await wait(100)
    assert.ok((await save()).elements[0].text.endsWith(' next'))
    checks.push('dense-derived-layout-preview-save-and-continued-input-' + formatId)
  }
  fixture = JSON.stringify({ ...project, elements: [{ id: 'negative-style', type: 'action', text: '正常文字强调文字', textStyle: { bold: true, italic: true, underline: true }, textRuns: [{ start: 0, end: 4, bold: false, italic: false, underline: false }, { start: 4, end: 8, bold: true, italic: true, underline: true }] }] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=negative-style]'))")
  await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
  window.webContents.invalidate(); await wait(150)
  await fs.writeFile(path.join(out, 'negative-style.png'), (await window.webContents.capturePage()).toPNG())
  const negativeStyles = await evaluate("(()=>{const root=document.querySelector('.rich-script-editor'),first=root.querySelector('p').firstElementChild,last=root.querySelector('p').lastElementChild;return {plainWeight:getComputedStyle(first).fontWeight,plainItalic:getComputedStyle(first).fontStyle,rootDecoration:getComputedStyle(root).textDecorationLine,emphasisWeight:getComputedStyle(last).fontWeight,emphasisItalic:getComputedStyle(last).fontStyle,emphasisUnderline:getComputedStyle(last).textDecorationLine}})()")
  assert.equal(negativeStyles.plainWeight, '400', 'Explicit plain text inherited paragraph bold')
  assert.equal(negativeStyles.plainItalic, 'normal', 'Explicit nonitalic text inherited paragraph italic')
  assert.equal(negativeStyles.rootDecoration, 'none', 'Parent underline cannot be canceled by a child span')
  assert.equal(negativeStyles.emphasisWeight, '700'); assert.equal(negativeStyles.emphasisItalic, 'italic'); assert.ok(negativeStyles.emphasisUnderline.includes('underline'))
  await select(8, 8); await window.webContents.insertText('追加'); await wait(100)
  const negativeSaved = (await save()).elements[0]
  assert.equal(negativeSaved.text, '正常文字强调文字追加')
  assert.ok(negativeSaved.textRuns.some(run => run.start === 0 && run.end === 4 && run.bold === false && run.italic === false && run.underline === false))
  checks.push('explicit-negative-emphasis-renders-plain-inside-emphasized-paragraph')
  const combinations = ['常规', '加粗', '斜体', '粗斜', '划线', '粗线', '斜线', '全开']
  const combinationRuns = combinations.map((_text, index) => ({ start: index * 2, end: index * 2 + 2, bold: Boolean(index & 1), italic: Boolean(index & 2), underline: Boolean(index & 4) }))
  fixture = JSON.stringify({ ...project, elements: [{ id: 'mixed-negatives', type: 'action', text: combinations.join(''), textStyle: { bold: true, italic: true, underline: true }, textRuns: combinationRuns }] })
  await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=mixed-negatives]'))")
  const assertCombinations = async () => {
    const styles = await evaluate("(()=>{const e=document.querySelector('.rich-script-editor[data-element-id=mixed-negatives]'),w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),out=[];while(w.nextNode()){const s=getComputedStyle(w.currentNode.parentElement);out.push({text:w.currentNode.textContent,bold:Number(s.fontWeight)>=600,italic:s.fontStyle==='italic',underline:s.textDecorationLine.includes('underline')})}return out})()")
    for (let index = 0; index < combinations.length; index++) {
      const actual = styles.find(part => part.text.includes(combinations[index]))
      assert.ok(actual, 'Missing emphasis combination: ' + combinations[index])
      assert.equal(actual.bold, combinationRuns[index].bold, 'Incorrect bold for ' + combinations[index])
      assert.equal(actual.italic, combinationRuns[index].italic, 'Incorrect italic for ' + combinations[index])
      assert.equal(actual.underline, combinationRuns[index].underline, 'Incorrect underline for ' + combinations[index])
    }
  }
  await assertCombinations()
  const combinationSaved = (await save()).elements[0]
  fixture = undefined; await command('openProject'); await assertCombinations()
  assert.deepEqual((await save()).elements[0], combinationSaved)
  await select(combinationSaved.text.length, combinationSaved.text.length); await window.webContents.insertText('续写'); await wait(100)
  const combinationContinued = (await save()).elements[0]
  assert.equal(combinationContinued.text, combinationSaved.text + '续写')
  await command('undoProject'); assert.deepEqual((await save()).elements[0], combinationSaved); await assertCombinations()
  await command('redoProject'); assert.deepEqual((await save()).elements[0], combinationContinued); await assertCombinations()
  await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
  window.webContents.invalidate(); await wait(150)
  await fs.writeFile(path.join(out, 'mixed-negative-combinations.png'), (await window.webContents.capturePage()).toPNG())
  checks.push('all-eight-explicit-emphasis-combinations-ignore-paragraph-inheritance-save-reopen-history')
  fixtureExtension = 'fdx'
  fixture = '<FinalDraft><Content><Paragraph Type="Action"><Text>甲&#13;</Text><Text Style="Bold" Font="SimSun">&#10;乙</Text><Text Style="Italic" Font="SimHei">丙</Text></Paragraph></Content></FinalDraft>'
  await command('openProject'); await until("document.querySelector('.rich-script-editor')?.textContent === '甲乙丙'")
  const fdxStyle = await evaluate("Array.from(document.querySelectorAll('.rich-script-editor p > *')).map(e=>({text:e.textContent,weight:getComputedStyle(e).fontWeight,italic:getComputedStyle(e).fontStyle,font:getComputedStyle(e).fontFamily}))")
  assert.equal(fdxStyle.find(part => part.text.includes('乙')).weight, '700')
  assert.match(fdxStyle.find(part => part.text.includes('乙')).font, /SimSun/u)
  assert.equal(fdxStyle.find(part => part.text.includes('丙')).weight, '400')
  assert.equal(fdxStyle.find(part => part.text.includes('丙')).italic, 'italic')
  assert.match(fdxStyle.find(part => part.text.includes('丙')).font, /SimHei/u)
  await select(3, 3); await window.webContents.insertText('续'); await wait(100)
  const fdxSaved = (await save()).elements[0]
  assert.equal(fdxSaved.text, '甲\n乙丙续')
  fixture = undefined; fixtureExtension = 'ssproj'
  await command('openProject'); await until("document.querySelector('.rich-script-editor')?.textContent === '甲乙丙续'")
  assert.deepEqual((await save()).elements[0], fdxSaved)
  checks.push('fdx-cross-node-crlf-fonts-and-emphasis-typing-save-reopen')
  for (const clearCommand of ['deleteParagraph', 'deleteSceneBlock']) {
    const original = { id: 'last-rich-clear', type: 'action', text: '清空中文……', textRuns: [{ start: 0, end: 2, bold: true, fontFamily: 'SimSun' }, { start: 2, end: 6, italic: true, underline: true }] }
    fixture = JSON.stringify({ ...project, elements: [original] })
    await command('openProject'); await until("Boolean(document.querySelector('.rich-script-editor[data-element-id=last-rich-clear]'))")
    await select(original.text.length, original.text.length)
    window.webContents.focus()
    const modifiers = [process.platform === 'darwin' ? 'meta' : 'control', ...(clearCommand === 'deleteSceneBlock' ? ['shift'] : [])]
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace', modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace', modifiers }); await wait(150)
    const cleared = (await save()).elements[0]
    assert.equal(cleared.text, '')
    assert.equal(cleared.textRuns, undefined, 'Clearing the last paragraph retained ranges beyond its empty text')
    await command('undoProject'); assert.deepEqual((await save()).elements[0], original)
    await command('redoProject'); assert.deepEqual((await save()).elements[0], cleared)
    assert.equal(await evaluate('document.activeElement.dataset.elementId'), original.id)
    await window.webContents.insertText('重新写作'); await wait(100)
    const continued = (await save()).elements[0]
    assert.equal(continued.text, '重新写作')
    fixture = undefined; await command('openProject')
    assert.deepEqual((await save()).elements[0], continued)
    checks.push('last-paragraph-' + clearCommand + '-clears-ranges-history-focus-and-reopen')
  }
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: true, platform: process.platform, checks, scope: 'Isolated Electron renderer and UTF-8 disk roundtrip; not physical IME certification.' }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, out })); window.destroy(); app.exit(0)
}
main().catch(async error => { await fs.mkdir(out, { recursive: true }); if(window && !window.isDestroyed()) { console.log(await evaluate("({active:document.activeElement?.dataset.elementId,rows:Array.from(document.querySelectorAll('.editor-row')).map(e=>({id:e.dataset.elementId,length:e.querySelector('textarea')?.value.length??e.querySelector('.rich-script-editor')?.textContent.length})),status:document.querySelector('footer')?.textContent?.slice(0,500)})")); await fs.writeFile(path.join(out,'failure.png'),(await window.webContents.capturePage()).toPNG()); await command('saveProject'); if(saved) await fs.writeFile(path.join(out,'failure.ssproj'),saved); } await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ passed: false, checks, error: error.stack }, null, 2)); console.error(error); app.exit(1) })
