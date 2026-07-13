const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const [, , url, outputPath] = process.argv
if (!url || !outputPath) {
  throw new Error('Usage: electron scripts/render-pdf-regression.cjs <url> <output.pdf>')
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { offscreen: true } })
  try {
    await window.loadURL(url)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = await window.webContents.executeJavaScript("document.documentElement.dataset.pdfReady === 'true'")
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } })
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, pdf)
  } finally {
    window.destroy()
    app.quit()
  }
})
