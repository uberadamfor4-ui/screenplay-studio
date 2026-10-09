const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { buildPortableProject, extractPortableProject } = require('../electron/portableProject.cjs')
const root = path.resolve(__dirname, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(root, 'acceptance-results', `writing-tools-${stamp}`)
app.setPath('userData', path.join(root, 'tmp', `writing-tools-${stamp}`))
const wait = (ms = 160) => new Promise(resolve => setTimeout(resolve, ms))
let window, latest, reviewSource, packed, imported, anonymousPdf
const errors = [], results = []
const project = {
  appVersion: '0.6.8', title: '工具验收', author: 'PRIVATE AUTHOR', language: 'zh-CN', formatId: 'hollywood', fontFamily: 'Courier Prime', fontSize: 12, pageSize: 'letter',
  titlePage: { enabled: true, title: '工具验收', credit: '编剧', authors: 'PRIVATE AUTHOR', contact: 'PRIVATE CONTACT', basedOn: '', copyright: 'PRIVATE COPYRIGHT', draftDate: '' },
  exportSettings: { profileId: 'us-spec', includeTitlePage: true, moreContinued: true, sceneNumbers: false, lockedPageLabels: false, headerText: 'PRIVATE HEADER', footerText: 'PRIVATE FOOTER' },
  writingTools: { projectId: 'acceptance-project', aliases: [], tasks: [], cuttings: [], continuity: [], storyLinks: [], reviewImports: [] },
  elements: [
    { id: 's1', type: 'scene', text: 'INT. HOME - DAY' },
    { id: 'a1', type: 'action', text: '老李走进房间……', textStyle: { bold: true } },
    { id: 'c1', type: 'character', text: '老李' },
    { id: 'd1', type: 'dialogue', text: '这是第一句对白。' },
    { id: 's2', type: 'scene', text: 'EXT. STREET - NIGHT' },
    { id: 'c2', type: 'character', text: '李明' },
    { id: 'd2', type: 'dialogue', text: '这是第二句对白。' },
    { id: 'n1', type: 'note', text: 'PRIVATE NOTE' },
  ], reviewNotes: [],
  production: { shots: [{ id: 'shot1', sceneId: 's1', storyboardPath: path.join(root, 'assets', 'brand', 'app-icon-512.png') }] },
}
const evaluate = source => window.webContents.executeJavaScript(source)
async function click(text, selector = '.writing-tool-panel button') {
  const ok = await evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(x => x.textContent.trim().includes(${JSON.stringify(text)})); if (!b || b.disabled) return false; b.click(); return true })()`)
  assert.ok(ok, `Button unavailable: ${text}`); await wait()
}
async function field(label, value, kind = 'input,textarea,select') {
  const ok = await evaluate(`(() => {
    const label = [...document.querySelectorAll('.writing-tool-panel label')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)}));
    const e = label?.querySelector(${JSON.stringify(kind)}); if (!e) return false;
    const prototype = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(e, ${JSON.stringify(value)});
    e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); return true;
  })()`)
  assert.ok(ok, `Field missing: ${label}`); await wait(80)
}
async function tab(id) { await evaluate(`document.getElementById('writing-tab-${id}').click()`); await wait() }
async function snapshot() {
  await evaluate(`window.dispatchEvent(new Event('beforeunload'))`); await wait(180)
  assert.ok(latest?.project); return latest.project
}
async function audit(name) {
  const result = await evaluate(`(() => {
    const root = document.querySelector('.writing-tools-dialog');
    const visible = e => e.getBoundingClientRect().width && e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
    const overflow = [...root.querySelectorAll('*')].filter(visible).filter(e => !e.matches('input,textarea,select') && e.scrollWidth > e.clientWidth + 2 && !['auto','scroll'].includes(getComputedStyle(e).overflowX)).map(e => e.className || e.tagName);
    const badButtons = [...root.querySelectorAll('button')].filter(visible).filter(e => e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2).map(e => e.textContent);
    const rect = root.getBoundingClientRect();
    return { overflow, badButtons, inViewport: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1 };
  })()`)
  assert.deepEqual(result.overflow, [], `${name}: horizontal overflow`)
  assert.deepEqual(result.badButtons, [], `${name}: clipped button`)
  assert.ok(result.inViewport, `${name}: dialog outside viewport`)
  results.push({ name, ...result })
}
async function openTools() {
  window.webContents.send('menu:command', 'openAssistiveTools'); await wait()
  assert.ok(await evaluate(`(() => { const button = [...document.querySelectorAll('.assistive-dialog button')].find(x => /打开写作辅助工具|Open Writing Tools|打開寫作輔助工具/u.test(x.textContent)); button?.click(); return Boolean(button) })()`)); await wait()
}
async function closeTools() { await evaluate(`document.querySelector('.writing-tools-dialog > header button').click()`); await wait() }
async function main() {
  await fs.mkdir(output, { recursive: true }); await app.whenReady()
  ipcMain.handle('system:listFonts', async () => ({ fonts: [] }))
  ipcMain.handle('system:setUiLocale', async (_event, locale) => ({ locale }))
  ipcMain.handle('recovery:read', async () => undefined)
  ipcMain.handle('recovery:write', async (_event, payload) => { latest = payload; return true })
  ipcMain.handle('revision:read', async () => undefined)
  ipcMain.handle('revision:write', async () => true)
  ipcMain.handle('file:openText', async (_event, filters) => filters[0].extensions.includes('ssreview') ? { canceled: false, content: reviewSource, filePath: path.join(output, 'review.ssreview') } : { canceled: false, content: JSON.stringify(project), filePath: path.join(output, 'source.ssproj') })
  ipcMain.handle('file:saveText', async (_event, payload) => { await fs.writeFile(path.join(output, path.basename(payload.suggestedName)), payload.content); return { canceled: false, filePath: path.join(output, path.basename(payload.suggestedName)) } })
  ipcMain.handle('project:exportPortable', async (_event, payload) => { packed = await buildPortableProject(payload.project, payload.sourcePath); await fs.writeFile(path.join(output, 'portable.sspack'), packed.bytes); return { canceled: false, assetCount: packed.manifest.assetCount, issues: [] } })
  ipcMain.handle('project:importPortable', async () => { imported = await extractPortableProject(packed.bytes, output); return { canceled: false, content: imported.content, filePath: imported.filePath } })
  ipcMain.handle('export:pdf', (_event, payload) => {
    anonymousPdf = renderAnonymousPdf(payload)
    return anonymousPdf
  })
  async function renderAnonymousPdf(payload) {
    for (const privateText of ['PRIVATE AUTHOR', 'PRIVATE CONTACT', 'PRIVATE COPYRIGHT', 'PRIVATE HEADER', 'PRIVATE FOOTER', 'PRIVATE NOTE']) assert.equal(payload.html.includes(privateText), false, privateText)
    assert.ok(payload.html.includes('font-weight:700') || payload.html.includes('font-weight: 700'))
    const print = new BrowserWindow({ width: 900, height: 1200, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } })
    try {
      const html = payload.html
        .replaceAll('{{SCREENPLAY_CJK_REGULAR_FONT_URL}}', pathToFileURL(path.join(root, 'src', 'assets', 'fonts', 'ScreenplayCJK-Regular.otf')).href)
        .replaceAll('{{SCREENPLAY_CJK_BOLD_FONT_URL}}', pathToFileURL(path.join(root, 'src', 'assets', 'fonts', 'ScreenplayCJK-Bold.otf')).href)
      const htmlPath = path.join(output, 'anonymous.html'); await fs.writeFile(htmlPath, html)
      await print.loadFile(htmlPath); await print.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      const pdf = await print.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } })
      await fs.writeFile(path.join(output, 'anonymous.pdf'), pdf)
      return { canceled: false, filePath: path.join(output, 'anonymous.pdf') }
    } finally { print.destroy() }
  }
  window = new BrowserWindow({ width: 1440, height: 900, show: false, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(root, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  await window.loadFile(path.join(root, 'dist', 'index.html')); await wait(500)
  window.webContents.send('menu:command', 'openProject'); await wait(500)
  await openTools()
  assert.equal(await evaluate(`document.querySelectorAll('.writing-tools-layout [role="tab"]').length`), 10)
  await field('替换规则', '老李=李明')
  await click('预览修改'); assert.equal(await evaluate(`document.querySelectorAll('.writing-diff').length`), 2)
  await click('应用选中的修改'); assert.equal((await snapshot()).elements.find(x => x.id === 'a1').text, '李明走进房间……')
  await tab('aliases'); await field('规范名称', '李明'); await field('别名', '阿明\n老李'); await click('保存别名')
  assert.equal((await snapshot()).writingTools.aliases.length, 1)
  await tab('tasks'); await field('待办事项', '重写结尾'); await click('加入待办'); assert.equal((await snapshot()).writingTools.tasks.length, 1)
  await click('导出待办清单')
  await closeTools(); window.webContents.send('menu:command', 'undoProject'); await wait(); assert.equal((await snapshot()).writingTools.tasks.length, 0)
  window.webContents.send('menu:command', 'redoProject'); await wait(); assert.equal((await snapshot()).writingTools.tasks.length, 1); await openTools()
  await tab('cuttings'); await field('废稿名称', '备用开场'); await field('收纳范围', 'scene'); await click('收纳废稿')
  await evaluate(`(() => { const label = [...document.querySelectorAll('.writing-tool-panel label')].find(x => x.textContent.startsWith('恢复位置')); label.querySelector('select').focus() })()`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' }); await wait()
  assert.equal(await evaluate('document.activeElement.tagName'), 'SUMMARY')
  await evaluate(`document.querySelector('.writing-cutting').open = true`)
  await field('恢复位置', 'd2'); await click('插入副本')
  const restored = await snapshot(); assert.equal(restored.elements.length, 12); assert.equal(new Set(restored.elements.map(x => x.id)).size, 12)
  await tab('continuity'); await field('人物 / 物品', '李明'); await field('属性', '左手'); await field('状态', '受伤'); await field('故事时间', '08:00'); await click('记录状态')
  await field('场景', 's2'); await field('状态', '完好'); await field('故事时间', '18:00'); await click('记录状态')
  assert.ok(await evaluate(`document.querySelector('.writing-tool-panel').textContent.includes('状态变化缺少记录')`))
  await tab('links'); await field('伏笔名称', '钥匙'); await field('铺垫段落', 'a1'); await field('回收段落', 'd2'); await click('保存关联')
  assert.equal((await snapshot()).writingTools.storyLinks.length, 1)
  await tab('rehearsal'); await field('我的角色', '李明'); assert.equal(await evaluate(`document.querySelector('.writing-rehearsal pre').textContent`), '……')
  await click('显示台词'); assert.ok(await evaluate(`document.querySelector('.writing-rehearsal pre').textContent.includes('第一句')`))
  await click('开始计时'); await wait(1100); assert.ok(await evaluate(`document.querySelector('.writing-actions output').textContent !== '00:00'`)); await click('暂停')
  await tab('review')
  const p = await snapshot()
  reviewSource = JSON.stringify({ kind: 'screenplay-review', version: 1, projectId: p.writingTools.projectId, title: p.title, exportedAt: new Date().toISOString(), entries: [{ note: { id: 'review1', elementId: 'a1', author: '导演', category: 'director', text: '离线回传批注', resolved: false, createdAt: new Date().toISOString() }, anchorText: p.elements.find(x => x.id === 'a1').text }] })
  await click('导入并核对'); await click('合并选中的批注'); assert.equal((await snapshot()).reviewNotes.length, 1)
  await click('导入并核对'); assert.ok(await evaluate(`document.querySelector('.writing-tool-panel').textContent.includes('已合并')`)); await click('导出批注文件')
  await tab('privacy'); await evaluate(`(() => { const e = [...document.querySelectorAll('.writing-tool-panel label')].find(x => x.textContent.includes('已人工核对')).querySelector('input'); e.click() })()`)
  const sourceBefore = JSON.stringify((await snapshot()).elements)
  await click('导出匿名 PDF')
  const exportDeadline = Date.now() + 60_000
  while (!anonymousPdf && Date.now() < exportDeadline) await wait(50)
  assert.ok(anonymousPdf, 'Anonymous export did not start before the deadline')
  let printTimeout
  try { await Promise.race([anonymousPdf, new Promise((_, reject) => { printTimeout = setTimeout(() => reject(new Error('Anonymous PDF export timed out')), 60_000) })]) }
  finally { clearTimeout(printTimeout) }
  assert.ok((await fs.stat(path.join(output, 'anonymous.pdf'))).size > 1000)
  assert.equal(JSON.stringify((await snapshot()).elements), sourceBefore)
  for (const size of [[1440, 900], [1040, 720], [620, 700]]) {
    window.setSize(...size); await wait()
    for (const id of ['replace', 'aliases', 'tasks', 'cuttings', 'continuity', 'links', 'rehearsal', 'review', 'portable', 'privacy']) { await tab(id); await audit(`${id}-${size.join('x')}`) }
  }
  window.setSize(1440, 900); await tab('links'); await fs.writeFile(path.join(output, 'writing-tools.png'), (await window.webContents.capturePage()).toPNG())
  await tab('portable'); await click('打包项目与附件'); assert.equal(packed.manifest.assetCount, 1)
  await click('打开项目包'); await wait(300); assert.ok(imported?.filePath)
  assert.equal(await evaluate(`Boolean(document.querySelector('.writing-tools-dialog'))`), false)
  await openTools(); assert.equal((await snapshot()).writingTools.storyLinks.length, 1)
  await closeTools()
  assert.equal(await evaluate(`document.activeElement.tagName`), 'TEXTAREA')
  for (const locale of ['en-US', 'zh-TW', 'zh-CN']) {
    window.webContents.send('menu:command', 'openPreferences'); await wait()
    await evaluate(`(() => { const select = [...document.querySelectorAll('[role="dialog"] select')].find(x => [...x.options].some(o => o.value === 'en-US')); select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`); await wait()
    await evaluate(`document.querySelector('[role="dialog"] header button').click()`); await wait()
    await openTools(); assert.equal(await evaluate('document.documentElement.lang'), locale)
    await audit(`locale-${locale}`); await closeTools()
  }
  window.webContents.send('menu:command', 'openPreproduction'); await wait(200)
  await click('摄影', 'button'); await click('分镜', 'button')
  const media = await evaluate(`(async () => { const img = document.querySelector('.storyboard-frame img'); await img?.decode?.().catch(() => {}); return { source: img?.src, width: img?.naturalWidth } })()`)
  assert.ok(media.width > 0 && media.source.includes('assets/000001.png'), JSON.stringify(media))
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks: results, media, errors, features: 10, pdf: 'anonymous.pdf' }, null, 2))
  console.log(JSON.stringify({ passed: true, features: 10, layoutChecks: results.length, output }))
  window.destroy(); app.exit(0)
}
main().catch(async error => { console.error(error); await fs.mkdir(output, { recursive: true }); if (window) await fs.writeFile(path.join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG()); app.exit(1) })
