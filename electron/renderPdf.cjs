const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { coverBoundsScript, coverOverflowCode } = require('./printSafety.cjs')

function withTimeout(promise, timeoutMs, message) {
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
    timeout.unref?.()
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}

async function renderPdf(html, { app, BrowserWindow, io = fs }) {
  const printWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const fontRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'fonts')
    : path.join(__dirname, '..', 'src', 'assets', 'fonts')
  const printableHtml = html
    .replaceAll('{{SCREENPLAY_CJK_REGULAR_FONT_URL}}', pathToFileURL(path.join(fontRoot, 'ScreenplayCJK-Regular.otf')).href)
    .replaceAll('{{SCREENPLAY_CJK_BOLD_FONT_URL}}', pathToFileURL(path.join(fontRoot, 'ScreenplayCJK-Bold.otf')).href)
  const tempHtmlPath = path.join(app.getPath('temp'), `screenplay-studio-print-${process.pid}-${Date.now()}-${randomUUID()}.html`)
  try {
    await io.writeFile(tempHtmlPath, printableHtml, 'utf8')
    await withTimeout(printWindow.loadFile(tempHtmlPath), 30_000, 'PDF 页面加载超时。')
    await withTimeout(
      printWindow.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true'),
      30_000,
      'PDF 字体加载超时。',
    )
    const coverFits = await withTimeout(printWindow.webContents.executeJavaScript(coverBoundsScript), 10_000, 'PDF 封面检查超时。')
    if (coverFits !== true) throw new Error(`${coverOverflowCode}: Cover text does not fit on one page.`)
    return await withTimeout(printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' },
    }), 60_000, 'PDF 生成超时。')
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
    await io.unlink(tempHtmlPath).catch(() => {})
  }
}

module.exports = { renderPdf, withTimeout }
