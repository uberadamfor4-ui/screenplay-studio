const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { installInputGuards } = require('../electron/inputGuards.cjs')

const root = path.resolve(__dirname, '..')
const userData = path.join(root, 'tmp', 'long-project-acceptance')
const elementCount = Number(process.env.SCREENPLAY_STRESS_ELEMENTS || 2500)
const projectElementLimit = 5000

function wait(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function evaluate(window, source) {
  return window.webContents.executeJavaScript(source)
}

async function waitFor(window, predicate, timeoutMs = 15000) {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    if (await evaluate(window, predicate)) {
      return performance.now() - startedAt
    }
    await wait()
  }
  throw new Error(`Timed out after ${timeoutMs} ms: ${predicate}`)
}

async function main() {
  app.setPath('userData', userData)
  await fs.rm(userData, { recursive: true, force: true })
  await app.whenReady()

  const recoverySnapshot = {
    savedAt: new Date(Date.now() + 60000).toISOString(),
    project: {
      appVersion: '0.6.3',
      title: 'Long project acceptance',
      author: 'Screenplay Studio',
      language: 'zh-CN',
      formatId: 'hollywood',
      fontFamily: 'Courier Prime',
      fontSize: 12,
      pageSize: 'letter',
      elements: Array.from({ length: elementCount }, (_, index) => ({
        id: `stress-${index}`,
        type: index % 12 === 0 ? 'scene' : 'action',
        text: index % 12 === 0
          ? 'INT. STRESS ROOM - DAY'
          : `Paragraph ${index} with English and \u4e2d\u6587 text\u2026\u2026 for responsive editing.`,
      })),
    },
  }
  ipcMain.handle('system:listFonts', async () => ({ fonts: [] }))
  ipcMain.handle('system:setUiLocale', async (_event, locale) => ({ locale }))
  ipcMain.handle('recovery:read', async () => recoverySnapshot)
  let recoveryWriteCount = 0
  ipcMain.handle('recovery:write', async () => {
    recoveryWriteCount += 1
    return true
  })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  installInputGuards(window)
  const reloadStartedAt = performance.now()
  await window.loadFile(path.join(root, 'dist', 'index.html'))
  await waitFor(window, `Boolean(document.querySelector('.autosave-banner button'))`)
  const noticeReadyMs = performance.now() - reloadStartedAt

  const recoveryStartedAt = performance.now()
  await evaluate(window, `document.querySelector('.autosave-banner button').click()`)
  const recoveryRenderMs = await waitFor(
    window,
    `document.querySelectorAll('.editor-row textarea').length === ${elementCount}`,
    30000,
  )

  const focusStartedAt = performance.now()
  await evaluate(window, `(() => {
    const editor = document.querySelector('.editor-row textarea')
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    return editor.value
  })()`)
  const focusReadyMs = performance.now() - focusStartedAt
  recoveryWriteCount = 0
  await evaluate(window, `(() => {
    const heartbeat = { last: performance.now(), maxGap: 0 }
    window.__screenplayHeartbeat = heartbeat
    window.__screenplayHeartbeatTimer = window.setInterval(() => {
      const now = performance.now()
      heartbeat.maxGap = Math.max(heartbeat.maxGap, now - heartbeat.last)
      heartbeat.last = now
    }, 20)
  })()`)
  const typingStartedAt = performance.now()
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'x' })
  window.webContents.sendInputEvent({ type: 'char', keyCode: 'x' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'x' })
  const typingLatencyMs = await waitFor(window, `document.querySelector('.editor-row textarea').value.endsWith('x')`)

  const enterStartedAt = performance.now()
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ENTER' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ENTER' })
  const expectedRows = elementCount < projectElementLimit ? elementCount + 1 : elementCount
  const enterLatencyMs = await waitFor(
    window,
    elementCount < projectElementLimit
      ? `document.querySelectorAll('.editor-row textarea').length === ${expectedRows}`
      : `document.querySelector('.statusbar')?.textContent.includes('5000 个段落')`,
  )
  await evaluate(window, `(() => {
    if (window.__screenplayHeartbeat) {
      window.__screenplayHeartbeat.last = performance.now()
      window.__screenplayHeartbeat.maxGap = 0
    }
  })()`)
  await wait(1700)
  const autoSaveMaxEventLoopGapMs = await evaluate(window, `(() => {
    window.clearInterval(window.__screenplayHeartbeatTimer)
    return window.__screenplayHeartbeat?.maxGap ?? 0
  })()`)

  const state = await evaluate(window, `(() => {
    const active = document.activeElement
    const activeRow = active?.closest('.editor-row')
    return {
      rows: document.querySelectorAll('.editor-row textarea').length,
      activeTag: active?.tagName ?? '',
      activeElementId: active?.dataset?.elementId ?? '',
      selectedElementId: activeRow?.dataset?.elementId ?? '',
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })()`)
  const memory = await app.getAppMetrics()
  const rendererMetric = memory.find((metric) => metric.type === 'Tab' || metric.type === 'Browser')
  const results = {
    elementCount,
    noticeReadyMs: Math.round(noticeReadyMs),
    recoveryRenderMs: Math.round(recoveryRenderMs),
    focusReadyMs: Math.round(focusReadyMs),
    typingLatencyMs: Math.round(typingLatencyMs),
    enterLatencyMs: Math.round(enterLatencyMs),
    autoSaveMaxEventLoopGapMs: Math.round(autoSaveMaxEventLoopGapMs),
    recoveryWriteCount,
    state,
    rendererMemoryKb: rendererMetric?.memory?.workingSetSize,
    timingSanity: {
      recoveryStartedAt: Math.round(recoveryStartedAt),
      typingStartedAt: Math.round(typingStartedAt),
      enterStartedAt: Math.round(enterStartedAt),
    },
  }

  if (state.rows !== expectedRows || state.activeTag !== 'TEXTAREA' || !state.activeElementId) {
    throw new Error(`Long-project editing lost focus or content: ${JSON.stringify(results)}`)
  }
  if (focusReadyMs > 3000 || typingLatencyMs > 1000 || enterLatencyMs > 1500) {
    throw new Error(`Long-project input latency exceeded the acceptance limit: ${JSON.stringify(results)}`)
  }
  if (autoSaveMaxEventLoopGapMs > 500 || recoveryWriteCount < 1) {
    throw new Error(`Long-project auto-save responsiveness failed: ${JSON.stringify(results)}`)
  }

  console.log(JSON.stringify(results, null, 2))
  window.destroy()
  app.quit()
}

main().catch((error) => {
  console.error(error)
  app.exitCode = 1
  app.quit()
})
