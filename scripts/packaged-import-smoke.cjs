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
const forcedScale = process.env.SCREENPLAY_FORCE_SCALE
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
  const result = await client.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
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
  if (forcedScale && !['1', '1.25', '1.5', '2'].includes(forcedScale)) throw new Error('Unsupported test render scale')
  child = spawn(executable, [...(source ? [root] : []), ...(forcedScale ? [`--force-device-scale-factor=${forcedScale}`] : []), `--user-data-dir=${profile}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`, `--inspect=127.0.0.1:${port + 1}`], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
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
    await evaluate(mainProcess, `require('electron').BrowserWindow.getAllWindows()[0].hide();require('electron').BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false); true`)
    renderer = await connect((await target(port)).webSocketDebuggerUrl)
    await until(async () => evaluate(renderer, `Boolean(document.querySelector('.editor-row textarea'))`), 'editor mounted')
    await until(async () => evaluate(renderer, "document.fonts.status === 'loaded'"), 'fonts loaded')
    await wait(250)
    const platform = await evaluate(mainProcess, `({platform:process.platform,arch:process.arch,version:require('electron').app.getVersion()})`)
    platform.display = await evaluate(renderer, `({pixelRatio:devicePixelRatio,width:innerWidth,height:innerHeight})`)
    platform.environment = forcedScale ? 'simulated-render-scale' : 'native-runtime-ui-automation'
    if (forcedScale) assert.ok(Math.abs(platform.display.pixelRatio-Number(forcedScale))<0.02, 'Requested render scale applied')
    assert.equal(platform.version, process.env.SCREENPLAY_EXPECTED_VERSION || require('../package.json').version, 'Actual application version')
    const fixtures = path.join(root, 'tests', 'fixtures', 'document-import')
    const reference = JSON.parse(await fs.readFile(path.join(fixtures, 'last-bus-final.ssproj'), 'utf8')).elements.map(e => [e.type, e.text])
    const cases = ['docx', 'txt', 'fountain'].map(extension => ({ extension, file: path.join(fixtures, extension === 'fountain' ? 'last-bus.fountain' : 'last-bus-import.'+extension), expected: reference, title: extension === 'fountain' ? '末班车' : undefined, author: extension === 'fountain' ? '剧本工坊原创教学' : undefined }))
    const punctuation = ['!真的是你。', '@你来了。', '>好的。', '.INT. ROOM - DAY']
    const literal = path.join(output, 'literal-prefixes.txt')
    await fs.writeFile(literal, punctuation.map(text => '林夏\n' + text).join('\n\n'))
    cases.push({ extension: 'literal-txt', file: literal, expected: punctuation.flatMap(text => [['character', '林夏'], ['dialogue', text]]) })
    const emptyTitle = path.join(output, 'empty-title.fountain')
    await fs.writeFile(emptyTitle, 'Title:\nAuthor:\n\n!The light goes out.')
    cases.push({ extension: 'empty-title-fountain', file: emptyTitle, expected: [['action', 'The light goes out.']], title: 'empty-title', author: '' })
    const rows = () => evaluate(renderer, `[...document.querySelectorAll('.editor-row textarea')].map(e=>e.value)`)
    const command = name => evaluate(mainProcess, `require('electron').BrowserWindow.getAllWindows()[0].webContents.send('menu:command',${JSON.stringify(name)}); true`)
    for (const { extension, file, expected, title, author } of cases) {
      const saved = path.join(output, extension+'.ssproj')
      await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(file)}]});require('electron').dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(saved)}});true`)
      const beforeReview = await rows()
      await command('importWordTxt')
      await until(async () => evaluate(renderer, `Boolean(document.querySelector('[role="dialog"][aria-label="导入确认工作台"]'))`), 'import review '+extension)
      assert.deepEqual(await rows(), beforeReview, 'Preview cannot replace the current document')
      await evaluate(renderer, `document.querySelector('.workflow-check input').click();true`)
      await until(async () => {
        await evaluate(renderer, `(()=>{const c=document.querySelector('.workflow-check input');if(c && !c.checked && !c.disabled)c.click()})();true`)
        await evaluate(renderer, `document.querySelector('.workflow-dialog>footer button')?.click();true`)
        return evaluate(renderer, `!document.querySelector('.workflow-dialog')`)
      }, 'confirmed import '+extension)
      await until(async () => JSON.stringify(await rows()) === JSON.stringify(expected.map(e => e[1])), 'imported body '+extension)
      await command('saveProjectAs')
      await until(async () => { try { return Boolean(JSON.parse(await fs.readFile(saved, 'utf8')).elements) } catch { return false } }, 'saved import '+extension)
      const project = JSON.parse(await fs.readFile(saved, 'utf8'))
      assert.deepEqual(project.elements.map(e => [e.type, e.text]), expected, extension+' paragraph types and body text')
      if (title !== undefined) { assert.equal(project.title, title); assert.equal(project.titlePage.title, title); assert.equal(project.author, author) }
      await evaluate(renderer, `document.querySelectorAll('.editor-row textarea')[${expected.length - 1}].focus();true`)
      await renderer.call('Input.insertText', { text: '……回归校验。' })
      const inserted = await rows()
      assert.ok(inserted.some(value=>value.includes('回归校验')), 'Actual editor receives native text after import '+extension)
      await command('saveProject')
      await until(async () => JSON.parse(await fs.readFile(saved, 'utf8')).elements.at(-1).text.includes('回归校验'), 'editable after import '+extension)
      const changed = JSON.parse(await fs.readFile(saved, 'utf8'))
      await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(saved)}]});true`)
      await command('openProject')
      await until(async () => JSON.stringify(await rows()) === JSON.stringify(changed.elements.map(e=>e.text)), 'reopened saved project '+extension)
      await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});true`)
      await command('importWordTxt'); await wait(250)
      assert.deepEqual(await rows(), changed.elements.map(e=>e.text), 'cancel preserves current document')
      results.push({ extension, paragraphs: project.elements.length, typesAndText: true, metadata: title !== undefined, editableAfterImport: true, saveAndReopen: true, cancelPreservesDocument: true })
    }
    const toolbar = async label => {
      await evaluate(renderer, `if(!document.querySelector('.app-shell').classList.contains('toolbar-expanded'))document.querySelector('.more-command').click();true`)
      await evaluate(renderer, `document.querySelector('.advanced-toolbar button[title='+${JSON.stringify(JSON.stringify(label))}+']').click();true`)
    }
    const closeWorkflow = () => evaluate(renderer, `document.querySelector('.workflow-dialog>header button').click();true`)
    const snapshot = async name => {
      const layout = await evaluate(renderer, `(()=>{const e=document.querySelector('.workflow-dialog'),r=e.getBoundingClientRect();return {width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight}})()`)
      assert.ok(layout.width <= layout.viewportWidth && layout.height <= layout.viewportHeight, 'Workflow dialog stays within viewport')
      if (process.env.SCREENPLAY_CAPTURE_WORKFLOWS !== '1') return
      await evaluate(mainProcess, `(()=>{const w=require('electron').BrowserWindow.getAllWindows()[0];const b=w.getBounds();w.setSize(b.width===1400?1440:1400,960);return true})()`)
      await wait(250)
      const rect = await evaluate(renderer, `(()=>{const r=document.querySelector('.workflow-dialog').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`)
      const bounds = { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
      const image = await evaluate(mainProcess, `require('electron').BrowserWindow.getAllWindows()[0].webContents.capturePage(${JSON.stringify(bounds)},{stayHidden:true,stayAwake:true}).then(image=>image.toPNG().toString('base64'))`)
      await fs.writeFile(path.join(output, name+'.png'), Buffer.from(image, 'base64'))
    }
    const baselineFile = path.join(output, 'handoff-baseline.ssproj')
    await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(path.join(fixtures,'last-bus-final.ssproj'))}]});require('electron').dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(baselineFile)}});true`)
    await command('openProject'); await until(async()=>JSON.stringify(await rows())===JSON.stringify(reference.map(e=>e[1])),'handoff baseline')
    await command('saveProjectAs'); await until(async()=>{try{return (await fs.stat(baselineFile)).size>0}catch{return false}},'baseline saved')
    const baselineBytes = await fs.readFile(baselineFile), incoming = JSON.parse(baselineBytes)
    incoming.elements[1].text = '交接修改：末班车停靠……'; incoming.elements[1].textStyle = { bold: true }
    const incomingFile = path.join(output,'handoff-incoming.ssproj'); await fs.writeFile(incomingFile, JSON.stringify(incoming))
    await evaluate(mainProcess, `require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(incomingFile)}]});true`)
    await toolbar('离线交接检查'); await until(async()=>evaluate(renderer, `Boolean(document.querySelector('.workflow-scene'))`),'handoff review')
    assert.deepEqual(await rows(), reference.map(e=>e[1]),'Handoff preview preserves current')
    await snapshot('workflow-handoff')
    await evaluate(renderer, `document.querySelector('.workflow-scene input').click();document.querySelector('.workflow-check input').click();true`)
    await until(async()=>{await evaluate(renderer, `[...document.querySelectorAll('.workflow-dialog>footer button')].find(b=>b.textContent.includes('合并所选')).click();true`);return evaluate(renderer, `!document.querySelector('.workflow-dialog')`)},'merged independent copy')
    assert.equal((await rows())[1],incoming.elements[1].text); assert.ok((await fs.readFile(baselineFile)).equals(baselineBytes),'Original project not overwritten')
    const zipFile=path.join(output,'submission-anonymous.zip')
    await evaluate(mainProcess, `require('electron').dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(zipFile)}});true`)
    await toolbar('投稿交付包'); await until(async()=>evaluate(renderer, `Boolean(document.querySelector('textarea[aria-label="一句话故事"]'))`),'submission editor')
    await evaluate(renderer, `document.querySelector('textarea[aria-label="一句话故事"]').focus();true`)
    await renderer.call('Input.insertText',{text:'末班车之前，母女决定把话说清楚。'})
    await evaluate(renderer, `document.querySelector('.workflow-controls input').click();document.querySelector('.workflow-check input').click();true`)
    await snapshot('workflow-submission')
    await evaluate(renderer, `document.querySelector('.workflow-dialog>footer button').click();true`)
    await until(async()=>{try{return (await fs.stat(zipFile)).size>1000}catch{return false}},'actual native PDF submission ZIP')
    const zip=await require('jszip').loadAsync(await fs.readFile(zipFile),{checkCRC32:true})
    assert.deepEqual(Object.keys(zip.files).sort(),['README.txt','logline.txt','script.pdf'])
    assert.equal(await zip.file('logline.txt').async('string'),'末班车之前，母女决定把话说清楚。')
    const pdf=await zip.file('script.pdf').async('nodebuffer');assert.ok(pdf.subarray(0,5).equals(Buffer.from('%PDF-')));await fs.writeFile(path.join(output,'submission-script.pdf'),pdf)
    await closeWorkflow();await until(async()=>evaluate(renderer, `document.activeElement?.tagName==='TEXTAREA'`),'focus after submission')
    await renderer.call('Input.insertText',{text:'……导出后继续输入。'});assert.ok((await rows()).some(t=>t.includes('导出后继续输入')))
    await toolbar('使用帮助与 BUG 反馈'); await until(async()=>evaluate(renderer, `Boolean(document.querySelector('.workflow-dialog select'))`),'help center')
    await evaluate(renderer, `[...document.querySelectorAll('.workflow-controls button')].find(b=>b.textContent==='BUG 反馈').click();true`)
    await until(async()=>evaluate(renderer, `document.querySelector('.feedback-qr')?.naturalWidth>0`),'feedback QR rendered')
    const feedback=await evaluate(renderer, `document.querySelector('.workflow-fields textarea[readonly]').value`)
    assert.ok(feedback.includes(platform.version));assert.ok(!/[A-Z]:[\\/]|\/Users\/|\/home\//u.test(feedback),'No private paths in default feedback')
    await snapshot('workflow-feedback');await closeWorkflow()
    results.push({workflow:'handoff-submission-feedback',sceneMergeExact:true,originalBytesPreserved:true,actualNativeZipPdf:true,materialsExact:true,typingAfterExport:true,qrRendered:true,feedbackNoPaths:true})
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, ...platform, executable, results }, null, 2))
    console.log(JSON.stringify({ passed: true, ...platform, output, results }))
    await evaluate(mainProcess, `setTimeout(()=>require('electron').app.quit(),100);true`)
  } catch (error) {
    let ui
    try { ui = renderer ? await evaluate(renderer, `({active:document.activeElement?.outerHTML?.slice(0,1000),rows:[...document.querySelectorAll('.editor-row textarea')].map(e=>e.value),dialog:document.querySelector('[role=dialog]')?.textContent?.slice(0,1000),status:document.querySelector('.statusbar')?.textContent})`) : undefined } catch {}
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, launchError: launchError?.message, stderr, results, ui }, null, 2))
    throw error
  } finally {
    renderer?.close(); mainProcess?.close()
    if (child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(3000)])
    if (child.exitCode === null) child.kill()
  }
}

for (const stream of [process.stdout, process.stderr]) stream.on('error', error => { if (error.code !== 'EPIPE') throw error })
main().catch(error => { console.error(error); process.exitCode = 1 })
