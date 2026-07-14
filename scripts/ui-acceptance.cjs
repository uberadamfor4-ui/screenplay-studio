const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'acceptance-results', new Date().toISOString().replace(/[:.]/g, '-'))

async function wait(ms = 120) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function clickByText(window, text) {
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.textContent.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}))
    if (!target) return false
    target.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Button not found: ${text}`)
  await wait()
}

async function clickByTitle(window, title) {
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('button[title=${JSON.stringify(title)}]')
    if (!target) return false
    target.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Titled button not found: ${title}`)
  await wait()
}

async function capture(window, name) {
  window.webContents.invalidate()
  await wait(220)
  const image = await window.webContents.capturePage()
  await fs.writeFile(path.join(output, `${name}.png`), image.toPNG())
}

async function dragFirstSceneToFirstDay(window) {
  const started = await window.webContents.executeJavaScript(`(() => {
    const source = document.querySelector('.schedule-column.unassigned .scene-strip')
    if (!source) return false
    const transfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    window.__acceptanceDragTransfer = transfer
    return true
  })()`)
  if (!started) throw new Error('No unassigned scene available for drag test')
  await wait(100)
  const assigned = await window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('.schedule-column:not(.unassigned)')
    if (!target) return false
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__acceptanceDragTransfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__acceptanceDragTransfer }))
    return true
  })()`)
  if (!assigned) throw new Error('No shoot day available for drag test')
  await wait(180)
  const moved = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.schedule-column:not(.unassigned) .scene-strip'))`)
  if (!moved) throw new Error('Scene drag did not assign the scene to the shoot day')
}

async function audit(window, name) {
  return window.webContents.executeJavaScript(`(() => {
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const overflow = [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 2 && !['auto', 'scroll'].includes(getComputedStyle(element).overflowX))
      .slice(0, 20)
      .map((element) => ({ tag: element.tagName, className: element.className, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
    const clippedButtons = [...document.querySelectorAll('button')]
      .filter(visible)
      .filter((button) => button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2)
      .slice(0, 20)
      .map((button) => ({ text: button.textContent.replace(/\\s+/g, ' ').trim(), className: button.className }))
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map((dialog) => {
      const rect = dialog.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, withinViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1 }
    })
    return {
      name: ${JSON.stringify(name)},
      viewport,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      overflow,
      clippedButtons,
      dialogs,
      activeTitle: document.querySelector('.panel-heading h1, [role="dialog"] h2')?.textContent ?? '',
    }
  })()`)
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#ffffff',
    paintWhenInitiallyHidden: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  await window.loadFile(path.join(root, 'dist', 'index.html'))
  await wait(500)
  const results = []

  results.push(await audit(window, 'writing-desktop'))
  await capture(window, '01-writing-desktop')

  await clickByText(window, '更多工具')
  await clickByText(window, 'FDX 专业互通实验室')
  results.push(await audit(window, 'fdx-empty-desktop'))
  await capture(window, '02-fdx-empty-desktop')
  await clickByText(window, '测试当前剧本')
  results.push(await audit(window, 'fdx-report-desktop'))
  await capture(window, '03-fdx-report-desktop')
  await clickByTitle(window, '关闭')

  await clickByText(window, '制片工作区')
  await clickByTitle(window, '拍摄排期')
  await clickByText(window, '增加拍摄日')
  await dragFirstSceneToFirstDay(window)
  await clickByText(window, '演员与转场条件')
  results.push(await audit(window, 'schedule-desktop'))
  await capture(window, '04-schedule-desktop')

  await clickByTitle(window, '预算与资产')
  await clickByText(window, '预算项目')
  results.push(await audit(window, 'budget-desktop'))
  await capture(window, '05-budget-desktop')

  await clickByTitle(window, '道具')
  await clickByTitle(window, '新增')
  await clickByTitle(window, '预算与资产')
  await clickByText(window, '记录流转')
  const ledgerPosition = await window.webContents.executeJavaScript(`(() => {
    const main = document.querySelector('.production-main')
    const ledger = document.querySelector('.asset-ledger')
    const row = document.querySelector('.asset-event-row:not(.head)')
    if (!main || !ledger || !row) return null
    main.style.scrollBehavior = 'auto'
    main.scrollTop = Math.max(0, ledger.offsetTop - 12)
    return { scrollTop: main.scrollTop, targetTop: ledger.offsetTop, rowText: row.textContent.trim() }
  })()`)
  if (!ledgerPosition || ledgerPosition.scrollTop <= 0) throw new Error('Asset lifecycle ledger was not reached')
  await wait(150)
  results.push(await audit(window, 'asset-ledger-desktop'))
  await capture(window, '05b-asset-ledger-desktop')
  await window.webContents.executeJavaScript(`(() => { const main = document.querySelector('.production-main'); if (main) main.scrollTop = 0 })()`)

  await clickByTitle(window, '修订与分发')
  await clickByText(window, '先锁页并锁场')
  await wait(200)
  await clickByText(window, '开始下一修订组')
  results.push(await audit(window, 'revision-desktop'))
  await capture(window, '06-revision-desktop')

  window.setSize(1040, 720)
  await wait(180)
  results.push(await audit(window, 'revision-minimum'))
  await capture(window, '07-revision-minimum')

  await clickByTitle(window, '拍摄排期')
  results.push(await audit(window, 'schedule-minimum'))
  await capture(window, '08-schedule-minimum')

  await clickByTitle(window, '预算与资产')
  results.push(await audit(window, 'budget-minimum'))
  await capture(window, '09-budget-minimum')

  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ output, results }, null, 2), 'utf8')
  console.log(JSON.stringify({ output, results }, null, 2))
  window.destroy()
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => {
  console.error(error)
  app.exit(1)
})
