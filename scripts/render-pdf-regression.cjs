const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const urlIndex = process.argv.findIndex((value) => /^https?:\/\//u.test(value))
const url = process.env.SCREENPLAY_PDF_URL ?? (urlIndex >= 0 ? process.argv[urlIndex] : undefined)
const outputPath = process.env.SCREENPLAY_PDF_OUTPUT ?? (urlIndex >= 0 ? process.argv[urlIndex + 1] : undefined)
const fontOverrideUrl = process.env.SCREENPLAY_PDF_FONT_OVERRIDE_URL
if (!url || !outputPath) {
  console.error('Usage: electron scripts/render-pdf-regression.cjs <url> <output.pdf>')
  app.whenReady().then(() => app.exit(1))
} else {
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 900, height: 1200, paintWhenInitiallyHidden: true })
    try {
      await withTimeout(window.loadURL(url), 30_000, 'PDF regression page load timed out')
      let ready = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        ready = await window.webContents.executeJavaScript("document.documentElement.dataset.pdfReady === 'true'")
        if (ready) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!ready) {
        throw new Error('PDF regression fixture did not become ready')
      }
      if (fontOverrideUrl) {
        await window.webContents.executeJavaScript(`(() => {
          const style = document.createElement('style')
          style.textContent = '@font-face { font-family: "PDF Unicode Test"; src: url(${JSON.stringify(fontOverrideUrl)}); font-weight: 100 900; } * { font-family: "PDF Unicode Test" !important; }'
          document.head.append(style)
          return document.fonts.load('12pt "PDF Unicode Test"')
        })()`)
      }
      await withTimeout(window.webContents.executeJavaScript('document.fonts.ready.then(() => true)'), 30_000, 'PDF regression fonts timed out')
      const pdf = await withTimeout(
        window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } }),
        60_000,
        'PDF regression print timed out',
      )
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, pdf)
    } finally {
      window.destroy()
      app.quit()
    }
  }).catch((error) => {
    console.error(error)
    app.exit(1)
  })
}

function withTimeout(promise, timeoutMs, message) {
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
    timeout.unref?.()
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}
