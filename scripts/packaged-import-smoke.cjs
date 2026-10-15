const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(root, 'acceptance-results', `document-import-${stamp}`)
const profile = path.join(root, 'tmp', `document-import-${stamp}`)
const source = process.env.SCREENPLAY_IMPORT_SOURCE === '1'
const executable = process.env.SCREENPLAY_ACCEPTANCE_EXECUTABLE || (source
  ? require('electron')
  : path.join(root, 'release', 'win-unpacked', 'Screenplay Studio.exe'))
const port = Number(process.env.SCREENPLAY_IMPORT_PORT || 9351)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
let child

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data)
    const entry = pending.get(value.id)
    if (!entry) return
    pending.delete(value.id); clearTimeout(entry.timer)
    if (value.error) entry.reject(new Error(value.error.message)); else entry.resolve(value.result)
  })
  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const request = ++id
        const timer = setTimeout(() => { pending.delete(request); reject(new Error(`Inspector timeout: ${method}`)) }, 20000)
        pending.set(request, { resolve, reject, timer })
        socket.send(JSON.stringify({ id: request, method, params }))
      })
    },
    close() { socket.close(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Inspector closed')) } pending.clear() },
  }
}

async function target(port) {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error('Application exited before import acceptance')
    try {
      const result = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) }).then(r => r.json())
      if (result[0]?.webSocketDebuggerUrl) return result.find(t => t.type === 'page') || result[0]
    } catch {}
    await wait(100)
  }
  throw new Error('Application inspector did not start')
}

async function evaluate(client, expression) {
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

async function until(check, label) {
  const end = Date.now() + 20000
  while (Date.now() < end) { if (await check()) return; await wait(100) }
  throw new Error('Timed out: '+label)
}

async function main() {
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65534)
  for (const p of [port, port + 1]) {
    let occupied = false
    try { await fetch(`http://127.0.0.1:${p}/json/list`, { signal: AbortSignal.timeout(500) }); occupied = true } catch {}
    assert.equal(occupied, false, 'Do not attach to another debug session')
  }
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(profile, { recursive: true })
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
  child = spawn(executable, [...(source ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`, `--inspect=127.0.0.1:${port + 1}`], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let stderr = '', launchError
  child.on('error', e => { launchError = e })
  child.stdout.on('data', () => {})
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-12000) })
  let renderer, mainProcess
  const results = []
  try {
    mainProcess = await connect((await target(port + 1)).webSocketDebuggerUrl)
    await until(async () => evaluate(mainProcess, `Boolean(process.mainModule?.require)`), 'main module ready')
    await evaluate(mainProcess, `globalThis.require=process.mainModule.require.bind(process.mainModule);true`)
    await until(async () => evaluate(mainProcess, `require('electron').app.isReady() && require('electron').BrowserWindow.getAllWindows().length > 0`), 'app ready')
    await evaluate(mainProcess, `require('electron').BrowserWindow.getAllWindows()[0].hide(); true`)
    renderer = await connect((await target(port)).webSocketDebuggerUrl)
    await until(async () => evaluate(renderer, `Boolean(document.querySelector('.editor-row textarea'))`), 'editor mounted')
    await until(async () => evaluate(renderer, "document.fonts.status === 'loaded'"), 'fonts loaded')
    await wait(250)
    const platform = await evaluate(mainProcess, `({platform:process.platform,arch:process.arch,version:require('electron').app.getVersion()})`)
    assert.equal(platform.version, process.env.SCREENPLAY_EXPECTED_VERSION || require('../package.json').version, 'Actual application version')
    const fixtures = path.join(root, 'tests', 'fixtures', 'document-import')
    const expected = JSON.parse(await fs.readFile(path.join(fixtures, 'last-bus-final.ssproj'), 'utf8')).elements.map(e => [e.type, e.text])
    const rows = () => evaluate(renderer, `[...document.querySelectorAll('.editor-row textarea')].map(e=>e.value)`)
    const command = name => evaluate(mainProcess, `require('electron').BrowserWindow.getAllWindows()[0].webContents.send('menu:command',${JSON.stringify(name)}); true`)
    for (const extension of ['docx', 'txt', 'fountain']) {
      const file = path.join(fixtures, extension === 'fountain' ? 'last-bus.fountain' : 'last-bus-import.'+extension)
      const saved = path.join(output, extension+'.ssproj')
      await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(file)}]});require('electron').dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(saved)}});true`)
      await command('importWordTxt')
      await until(async () => JSON.stringify(await rows()) === JSON.stringify(expected.map(e => e[1])), 'imported body '+extension)
      await command('saveProjectAs')
      await until(async () => { try { return Boolean(JSON.parse(await fs.readFile(saved, 'utf8')).elements) } catch { return false } }, 'saved import '+extension)
      const project = JSON.parse(await fs.readFile(saved, 'utf8'))
      assert.deepEqual(project.elements.map(e => [e.type, e.text]), expected, extension+' paragraph types and body text')
      if (extension === 'fountain') { assert.equal(project.title, '末班车'); assert.equal(project.titlePage.title, '末班车'); assert.equal(project.author, '剧本工坊原创教学') }
      await evaluate(renderer, `document.querySelectorAll('.editor-row textarea')[${expected.length - 1}].focus();true`)
      await renderer.call('Input.insertText', { text: '……回归校验。' })
      await command('saveProject')
      await until(async () => JSON.parse(await fs.readFile(saved, 'utf8')).elements.at(-1).text.includes('回归校验'), 'editable after import '+extension)
      const changed = JSON.parse(await fs.readFile(saved, 'utf8'))
      await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(saved)}]});true`)
      await command('openProject')
      await until(async () => JSON.stringify(await rows()) === JSON.stringify(changed.elements.map(e=>e.text)), 'reopened saved project '+extension)
      await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});true`)
      await command('importWordTxt'); await wait(250)
      assert.deepEqual(await rows(), changed.elements.map(e=>e.text), 'cancel preserves current document')
      results.push({ extension, paragraphs: project.elements.length, typesAndText: true, metadata: extension === 'fountain', editableAfterImport: true, saveAndReopen: true, cancelPreservesDocument: true })
    }
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, ...platform, executable, results }, null, 2))
    console.log(JSON.stringify({ passed: true, ...platform, output, results }))
    await evaluate(mainProcess, `setTimeout(()=>require('electron').app.quit(),100);true`)
  } catch (error) {
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, launchError: launchError?.message, stderr, results }, null, 2))
    throw error
  } finally {
    renderer?.close(); mainProcess?.close()
    if (child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(3000)])
    if (child.exitCode === null) child.kill()
  }
}

for (const stream of [process.stdout, process.stderr]) stream.on('error', error => { if (error.code !== 'EPIPE') throw error })
main().catch(error => { console.error(error); process.exitCode = 1 })
