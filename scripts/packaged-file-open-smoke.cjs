const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = process.env.SCREENPLAY_FILE_OPEN_OUTPUT || path.join(root, 'acceptance-results', `file-open-${stamp}`)
const profile = path.join(root, 'tmp', 'file-open', stamp)
const port = Number(process.env.SCREENPLAY_FILE_OPEN_PORT || 9367)
const executable = process.env.SCREENPLAY_FILE_OPEN_EXECUTABLE
const source = !executable
const results = {}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let client, child
async function connect(url) {
  const socket = new WebSocket(url), pending = new Map()
  let id = 0
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data), item = pending.get(data.id)
    if (!item) return
    clearTimeout(item.timer); pending.delete(data.id)
    if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result)
  })
  return { call(method, params = {}) { return new Promise((resolve, reject) => {
    const request = ++id, timer = setTimeout(() => { pending.delete(request); reject(new Error('DevTools timeout: ' + method)) }, 20000)
    pending.set(request, { resolve, reject, timer }); socket.send(JSON.stringify({ id: request, method, params }))
  }) }, close() { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Closed')) }; socket.close() } }
}
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function until(test, label, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await test()) return; await wait(100) }
  throw new Error('Timed out: ' + label)
}
function launch(extra = []) {
  const binary = executable || require('electron')
  const args = [...(source ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, ...extra]
  const process = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  process.on('error', error => console.error(error.message))
  process.stderr.on('data', () => {})
  return process
}
async function main() {
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(profile, { recursive: true })
  const file = path.join(output, '中文 空格 latest.ssproj')
  const fixture = { title: '磁盘最新稿', author: '', language: 'zh-CN', formatId: 'hollywood', fontFamily: 'Courier Prime', fontSize: 12, pageSize: 'letter', elements: [{ id: 'open-latest', type: 'action', text: 'LATEST-DISK-最新正文……' }] }
  await fs.writeFile(file, JSON.stringify(fixture))
  child = launch([file])
  let target
  await until(async () => {
    try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page'); return target?.webSocketDebuggerUrl } catch { return false }
  }, 'native app startup')
  client = await connect(target.webSocketDebuggerUrl)
  await until(() => evaluate(`Boolean(document.querySelector('.editor-row textarea'))`), 'editor mount')
  results.before = await evaluate(`({ title:document.querySelector('.brand')?.textContent, text:[...document.querySelectorAll('.editor-row textarea')].map(x=>x.value), status:document.querySelector('.statusbar')?.textContent })`)
  await until(() => evaluate(`document.querySelector('.editor-row textarea')?.value.includes('LATEST-DISK-最新正文')`), 'cold launch reads requested file')
  results.coldOpen = true
  await evaluate(`document.querySelector('.editor-row textarea').focus()`)
  await client.call('Input.insertText', { text: '编辑后-SAVED-' })
  await wait(150)
  await evaluate(`document.querySelector('[role="toolbar"] button[title="保存"]').click()`)
  await until(async () => JSON.parse(await fs.readFile(file, 'utf8')).elements[0].text.includes('编辑后-SAVED-'), 'normal save overwrites original path without picker')
  results.overwriteOriginal = true
  const second = path.join(output, '第二份.ssproj')
  await fs.writeFile(second, JSON.stringify({ ...fixture, title: '第二份', elements: [{ id: 'open-second', type: 'action', text: 'WARM-SECOND-第二份新稿' }] }))
  const other = launch([second])
  await until(() => evaluate(`document.querySelector('.editor-row textarea')?.value === 'WARM-SECOND-第二份新稿'`), 'warm launch delivers requested second file')
  await until(() => other.exitCode !== null, 'secondary launcher exits')
  results.warmOpen = true
  await evaluate(`document.querySelector('.editor-row textarea').focus()`)
  await client.call('Input.insertText', { text: 'KEEP-UNSAVED-' }); await wait(100)
  const dirtyRequest = launch([file])
  await until(() => evaluate(`Boolean(document.querySelector('.external-open-banner'))`), 'unsaved work blocks external replacement visibly')
  assert.ok(await evaluate(`document.querySelector('.editor-row textarea').value.includes('KEEP-UNSAVED-')`))
  await until(() => dirtyRequest.exitCode !== null, 'dirty secondary launcher exits')
  results.dirtyWorkPreserved = true
  await evaluate(`document.querySelector('.external-open-banner button').click()`)
  await until(() => evaluate(`document.querySelector('.editor-row textarea')?.value.includes('编辑后-SAVED-')`), 'save current then open pending file')
  assert.ok(JSON.parse(await fs.readFile(second, 'utf8')).elements[0].text.includes('KEEP-UNSAVED-'))
  results.saveThenOpen = true
  await fs.writeFile(path.join(output, 'native-file-open.png'), Buffer.from((await client.call('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, results, platform: process.platform, executable: executable || 'source', isolatedProfile: true }, null, 2))
  console.log(JSON.stringify({ passed: true, output, results }))
}
main().catch(async error => {
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: false, results, error: error.message, isolatedProfile: true }, null, 2))
  console.error(error.message); process.exitCode = 1
}).finally(async () => {
  try { await client?.call('Browser.close') } catch {}
  client?.close()
  if (child && child.exitCode === null) { await wait(1000); if (child.exitCode === null) child.kill() }
})
