const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const executable = process.env.SCREENPLAY_ACCEPTANCE_EXECUTABLE
  || path.join(root, 'release', 'win-unpacked', 'Screenplay Studio.exe')
const port = Number(process.env.SCREENPLAY_ACCEPTANCE_PORT || 9337)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = path.join(root, 'acceptance-results', `packaged-input-${stamp}`)
const userData = path.join(root, 'tmp', 'packaged-input-smoke')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForTarget(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
      const target = targets.find((item) => item.type === 'page')
      if (target?.webSocketDebuggerUrl) return target
    } catch {
      // The packaged app is still starting.
    }
    await wait(150)
  }
  throw new Error('Timed out waiting for the packaged app DevTools target')
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  return {
    call(method, params = {}) {
      const id = ++nextId
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    close() {
      socket.close()
    },
  }
}

async function evaluate(client, expression) {
  const result = await client.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

const stateExpression = `(() => {
  const active = document.activeElement
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]')
  return {
    tag: active?.tagName ?? '',
    className: active?.className ?? '',
    elementId: active?.dataset?.elementId ?? '',
    value: active instanceof HTMLTextAreaElement ? active.value : '',
    dialog: modal?.querySelector('h2')?.textContent?.trim() ?? '',
    modalContainsActive: Boolean(modal?.contains(active)),
  }
})()`

async function main() {
  const resolvedExecutable = path.resolve(executable)
  const resolvedUserData = path.resolve(userData)
  const printModifiers = process.platform === 'darwin' ? 4 : 2
  const tempRoot = path.resolve(root, 'tmp') + path.sep
  if (!resolvedUserData.startsWith(tempRoot)) throw new Error('Smoke-test user data escaped the project temp directory')
  await fs.rm(resolvedUserData, { recursive: true, force: true })
  await fs.mkdir(output, { recursive: true })

  const child = spawn(resolvedExecutable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolvedUserData}`,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })

  const target = await waitForTarget()
  const client = await connect(target.webSocketDebuggerUrl)
  try {
    await client.call('Runtime.enable')
    await client.call('Page.enable')
    await evaluate(client, `document.fonts.ready.then(() => document.readyState)`)
    await wait(350)

    const results = {}
    results.start = await evaluate(client, stateExpression)
    if (results.start.tag !== 'TEXTAREA') throw new Error(`Packaged editor did not receive focus: ${JSON.stringify(results.start)}`)

    await evaluate(client, `(() => {
      const editor = document.activeElement
      editor.setSelectionRange(editor.value.length, editor.value.length)
    })()`)
    await client.call('Input.insertText', { text: 'x' })
    await wait(120)
    results.afterTyping = await evaluate(client, stateExpression)
    if (!results.afterTyping.value.endsWith('x')) throw new Error(`Packaged typing failed: ${JSON.stringify(results.afterTyping)}`)

    await evaluate(client, `(() => {
      const button = document.querySelector('.pdf-command')
      button.focus()
      button.click()
    })()`)
    await wait(250)
    results.previewOpen = await evaluate(client, stateExpression)
    if (!results.previewOpen.dialog || !results.previewOpen.modalContainsActive) {
      throw new Error(`Packaged PDF preview focus failed: ${JSON.stringify(results.previewOpen)}`)
    }

    await evaluate(client, `document.querySelector('[role="dialog"][aria-modal="true"] button[aria-label="关闭"]').click()`)
    await wait(160)
    results.previewClosed = await evaluate(client, stateExpression)
    if (results.previewClosed.tag !== 'TEXTAREA') {
      throw new Error(`Packaged editor focus did not return: ${JSON.stringify(results.previewClosed)}`)
    }
    await client.call('Input.insertText', { text: 'y' })
    await wait(120)
    results.afterPreviewTyping = await evaluate(client, stateExpression)
    if (!results.afterPreviewTyping.value.endsWith('xy')) {
      throw new Error(`Packaged typing failed after preview: ${JSON.stringify(results.afterPreviewTyping)}`)
    }

    await evaluate(client, `document.querySelector('.pdf-command').focus()`)
    await client.call('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      modifiers: printModifiers,
      key: 'p',
      code: 'KeyP',
      windowsVirtualKeyCode: 80,
      nativeVirtualKeyCode: 80,
    })
    await client.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: printModifiers,
      key: 'p',
      code: 'KeyP',
      windowsVirtualKeyCode: 80,
      nativeVirtualKeyCode: 80,
    })
    await wait(160)
    results.nativePrint = await evaluate(client, stateExpression)
    if (results.nativePrint.dialog || results.nativePrint.tag !== 'TEXTAREA') {
      throw new Error(`Packaged native print guard failed: ${JSON.stringify(results.nativePrint)}`)
    }

    const screenshot = await client.call('Page.captureScreenshot', { format: 'png' })
    await fs.writeFile(path.join(output, 'packaged-input-final.png'), Buffer.from(screenshot.data, 'base64'))
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ executable: resolvedExecutable, results }, null, 2))
    console.log(JSON.stringify({ executable: resolvedExecutable, output, results }, null, 2))
    await client.call('Browser.close')
  } finally {
    client.close()
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      wait(3_000),
    ])
    if (child.exitCode === null) child.kill()
    if (stderr.trim()) console.error(stderr.trim())
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
