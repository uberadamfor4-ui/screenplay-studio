const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const out = path.resolve(process.env.SCREENPLAY_GATE_OUTPUT || path.join(root, 'acceptance-results'), `privacy-policy-${Date.now()}`)
app.setPath('userData', path.join(out, 'synthetic-profile'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let window, opens = 0, failBrowser = false
const checks = []
const evaluate = source => window.webContents.executeJavaScript(source)
async function until(source) {
  for (let i = 0; i < 100; i++) { if (await evaluate(source)) return; await wait(50) }
  throw new Error(`Timed out: ${source}`)
}
async function click(text) {
  assert.ok(await evaluate(`(() => {const b=[...document.querySelectorAll('.workflow-dialog button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});b?.click();return !!b})()`))
  await wait(80)
}
async function main() {
  await fs.mkdir(out, { recursive: true })
  await app.whenReady()
  app.on('window-all-closed', () => {})
  for (const [key, value] of Object.entries({ 'system:listFonts': { fonts: [] }, 'recovery:read': undefined, 'revision:read': undefined, 'recovery:write': true, 'revision:write': true, 'project:getPendingOpen': { canceled: true } })) ipcMain.handle(key, () => value)
  ipcMain.handle('system:setUiLocale', (_event, locale) => ({ locale }))
  ipcMain.handle('help:openPrivacyPolicy', async () => { opens++; if (failBrowser) throw new Error('Synthetic unavailable browser') })
  window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  await window.loadFile(path.join(root, 'dist/index.html'))
  for (const [locale, title, online, feedback, policy] of [
    ['zh-CN', '隐私政策', '在浏览器中查看政策', 'BUG 反馈', '隐私政策'],
    ['en-US', 'Privacy policy', 'View policy in browser', 'Bug feedback', 'Privacy policy'],
    ['zh-TW', '隱私政策', '在瀏覽器中檢視政策', 'BUG 回報', '隱私政策'],
  ]) {
    await evaluate(`localStorage.setItem('screenplay-studio.uiLocale.v3',${JSON.stringify(locale)})`)
    await window.loadFile(path.join(root, 'dist/index.html'))
    await until("Boolean(document.querySelector('.editor-row textarea'))")
    const manuscript = await evaluate("[...document.querySelectorAll('.editor-row textarea')].map(e=>e.value).join('\\n')")
    window.webContents.send('menu:command', 'openPrivacyPolicy')
    await until("document.querySelectorAll('[data-policy-section]').length===9")
    assert.equal(await evaluate("document.querySelector('[role=dialog]').getAttribute('aria-label')"), title)
    assert.equal(opens, locale === 'zh-CN' ? 0 : (locale === 'en-US' ? 2 : 4))
    for (const [width, height] of [[1440, 1000], [900, 600]]) {
      window.setContentSize(width, height)
      await wait(100)
      const layout = await evaluate(`(() => {const d=document.querySelector('.workflow-dialog'),b=d.querySelector('.workflow-body'),r=d.getBoundingClientRect();return {width:r.width,height:r.height,overflow:b.scrollWidth>b.clientWidth+2,reachable:b.scrollHeight>b.clientHeight,closeVisible:d.querySelector('header button').getBoundingClientRect().bottom<innerHeight}})()`)
      assert.ok(layout.width <= width && layout.height <= height && !layout.overflow && layout.closeVisible)
      await evaluate("document.querySelector('.workflow-body').scrollTop=100000")
      assert.ok(await evaluate("document.querySelector('[data-policy-section=changes]').getBoundingClientRect().bottom <= document.querySelector('.workflow-body').getBoundingClientRect().bottom+2"))
      await evaluate("document.querySelector('.workflow-body').scrollTop=0")
      await fs.writeFile(path.join(out, `${locale}-${width}.png`), (await window.webContents.capturePage()).toPNG())
      checks.push({ id: `${locale}-${width}-complete-offline-layout`, passed: true })
    }
    failBrowser = true
    await click(online)
    await until("Boolean(document.querySelector('.app-privacy-policy [role=status]'))")
    assert.ok(!await evaluate("document.querySelector('.app-privacy-policy button').disabled"))
    assert.equal(await evaluate("document.querySelectorAll('[data-policy-section]').length"), 9)
    failBrowser = false
    await click(online)
    assert.ok(!await evaluate("Boolean(document.querySelector('.app-privacy-policy [role=status]'))"))
    await click(feedback)
    await evaluate("(()=>{const e=document.querySelector('.workflow-fields textarea'),s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;s.call(e,'Synthetic unsent feedback');e.dispatchEvent(new Event('input',{bubbles:true}))})()")
    await click(policy)
    await click(feedback)
    assert.equal(await evaluate("document.querySelector('.workflow-fields textarea').value"), 'Synthetic unsent feedback')
    await evaluate("document.querySelector('.workflow-dialog header button').click()")
    await until("!document.querySelector('[role=dialog]')")
    assert.equal(await evaluate("[...document.querySelectorAll('.editor-row textarea')].map(e=>e.value).join('\\n')"), manuscript)
    await evaluate("document.querySelector('.editor-row textarea').focus()")
    await window.webContents.insertText('Synthetic continued writing')
    await until("document.querySelector('.editor-row textarea').value.includes('Synthetic continued writing')")
    checks.push({ id: `${locale}-browser-error-feedback-retention-and-writing`, passed: true })
  }
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, platform: process.platform, scope: 'isolated-renderer-and-stubbed-browser-opener-not-native-Mac-or-ASC-screenshot', checks }, null, 2))
  console.log(JSON.stringify({ passed: true, checks: checks.length, out }))
}
main().then(() => { window?.destroy(); app.exit(0) }).catch(async error => { console.error(error); await fs.mkdir(out, { recursive: true }); await fs.writeFile(path.join(out, 'failure.txt'), error.stack || error.message); window?.destroy(); app.exit(1) })
