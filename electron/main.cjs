const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { TextDecoder } = require('node:util')
const mammoth = require('mammoth')

const APP_DISPLAY_NAME = '剧本工坊'
const DEVELOPER_CREDIT = '本软件由1037 Film 郭之然独立开发完成'
const isDev = process.env.SCREENPLAY_DEV === '1'
const isMac = process.platform === 'darwin'

app.setName(APP_DISPLAY_NAME)

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#f3f4f1',
    title: APP_DISPLAY_NAME,
    icon: path.join(__dirname, '..', 'assets', 'brand', isMac ? 'app-icon-512.png' : 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  installChineseMenu(mainWindow)
}

function installChineseMenu(mainWindow) {
  const sendCommand = (command) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:command', command)
    }
  }

  const showAbout = () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: `关于${APP_DISPLAY_NAME}`,
      message: APP_DISPLAY_NAME,
      detail: `专注写作布局。支持好莱坞剧本格式、FDX、PDF 和 PNG 导出。\n\n${DEVELOPER_CREDIT}`,
      buttons: ['知道了'],
    })
  }

  const fileMenu = {
    label: '文件',
    submenu: [
      { label: '新建剧本', accelerator: 'CommandOrControl+N', click: () => sendCommand('newProject') },
      { label: '打开剧本...', accelerator: 'CommandOrControl+O', click: () => sendCommand('openProject') },
      { label: '偏好设置...', accelerator: 'CommandOrControl+,', click: () => sendCommand('openPreferences') },
      { label: '命令面板...', accelerator: 'CommandOrControl+K', click: () => sendCommand('openCommandPalette') },
      { label: '辅助功能...', accelerator: 'CommandOrControl+Shift+U', click: () => sendCommand('openAssistiveTools') },
      { type: 'separator' },
      { label: '保存', accelerator: 'CommandOrControl+S', click: () => sendCommand('saveProject') },
      { label: '另存为...', accelerator: 'CommandOrControl+Shift+S', click: () => sendCommand('saveProjectAs') },
      { type: 'separator' },
      { label: '导入 FDX...', click: () => sendCommand('importFdx') },
      { label: '导入文档...', click: () => sendCommand('importWordTxt') },
      { label: '导出 FDX...', click: () => sendCommand('exportFdx') },
      { label: '导出 PDF...', click: () => sendCommand('exportPdf') },
      { label: '导出 PNG 图片...', click: () => sendCommand('exportPng') },
      { type: 'separator' },
      isMac
        ? { label: '关闭窗口', accelerator: 'Command+W', role: 'close' }
        : { label: '退出', accelerator: 'Alt+F4', role: 'quit' },
    ],
  }

  const template = [
    fileMenu,
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CommandOrControl+Z', click: () => sendCommand('undoProject') },
        { label: '重做', accelerator: 'CommandOrControl+Y', click: () => sendCommand('redoProject') },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CommandOrControl+X', role: 'cut' },
        { label: '复制', accelerator: 'CommandOrControl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CommandOrControl+V', role: 'paste' },
        { label: '全选', accelerator: 'CommandOrControl+A', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '实际大小', accelerator: 'CommandOrControl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CommandOrControl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CommandOrControl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '重新加载', accelerator: 'CommandOrControl+R', role: 'reload' },
        { label: '全屏', accelerator: isMac ? 'Control+Command+F' : 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CommandOrControl+M', role: 'minimize' },
        ...(isMac ? [{ label: '缩放', role: 'zoom' }] : []),
        { label: '关闭窗口', accelerator: 'CommandOrControl+W', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [{ label: `关于${APP_DISPLAY_NAME}`, click: showAbout }],
    },
  ]

  if (isMac) {
    template.unshift({
      label: APP_DISPLAY_NAME,
      submenu: [
        { label: `关于${APP_DISPLAY_NAME}`, click: showAbout },
        { type: 'separator' },
        { label: '偏好设置...', accelerator: 'Command+,', click: () => sendCommand('openPreferences') },
        { type: 'separator' },
        { label: `隐藏${APP_DISPLAY_NAME}`, accelerator: 'Command+H', role: 'hide' },
        { label: '隐藏其他', accelerator: 'Command+Option+H', role: 'hideOthers' },
        { label: '全部显示', role: 'unhide' },
        { type: 'separator' },
        { label: `退出${APP_DISPLAY_NAME}`, accelerator: 'Command+Q', role: 'quit' },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

function registerIpc() {
  ipcMain.handle('system:listFonts', async () => ({ fonts: await listFonts() }))

  ipcMain.handle('file:openText', async (_event, filters) => {
    const result = await dialog.showOpenDialog({
      title: '打开剧本',
      properties: ['openFile'],
      filters,
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const filePath = result.filePaths[0]
    const content = await readTextFileContent(filePath)
    return { canceled: false, filePath, content }
  })

  ipcMain.handle('file:saveText', async (_event, payload) => {
    let filePath = payload.filePath

    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '保存剧本',
        defaultPath: payload.suggestedName,
        filters: payload.filters,
      })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      filePath = result.filePath
    }

    await fs.writeFile(filePath, payload.content, 'utf8')
    return { canceled: false, filePath }
  })

  ipcMain.handle('export:pdf', async (_event, payload) => {
    const result = await dialog.showSaveDialog({
      title: '导出 PDF',
      defaultPath: payload.suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const pdf = await renderPdf(payload.html)
    await fs.writeFile(result.filePath, pdf)
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('export:pngPages', async (_event, payload) => {
    const result = await dialog.showOpenDialog({
      title: '选择 PNG 导出文件夹',
      defaultPath: payload.suggestedFolderName,
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const folder = result.filePaths[0]
    await Promise.all(
      payload.pages.map(async (page) => {
        const base64 = page.dataUrl.replace(/^data:image\/png;base64,/, '')
        await fs.writeFile(path.join(folder, page.name), Buffer.from(base64, 'base64'))
      }),
    )

    return { canceled: false, filePath: folder }
  })
}

async function readTextFileContent(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }

  const buffer = await fs.readFile(filePath)
  if (extension === '.pdf') {
    const PDFParse = loadPdfParser()
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText({ pageJoiner: '\n' })
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  return decodeTextBuffer(buffer)
}

function loadPdfParser() {
  installPdfGraphicsGlobals()
  return require('pdf-parse').PDFParse
}

function installPdfGraphicsGlobals() {
  const canvas = require('@napi-rs/canvas')
  const graphicsGlobals = ['DOMMatrix', 'DOMPoint', 'DOMRect', 'ImageData', 'Path2D']

  graphicsGlobals.forEach((name) => {
    if (typeof globalThis[name] === 'undefined' && typeof canvas[name] !== 'undefined') {
      globalThis[name] = canvas[name]
    }
  })
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer)
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer)
  }

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length
  if (replacementCount > 0) {
    try {
      return new TextDecoder('gb18030').decode(buffer)
    } catch {
      return utf8
    }
  }

  return utf8
}

async function renderPdf(html) {
  const printWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await printWindow.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true')
  const pdf = await printWindow.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    margins: { marginType: 'none' },
  })
  printWindow.destroy()
  return pdf
}

async function listFonts() {
  if (process.platform === 'win32') {
    return listWindowsFonts()
  }

  if (isMac) {
    return listMacFonts()
  }

  return fallbackFonts()
}

async function listWindowsFonts() {
  const command = `
$paths = @(
  "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
  "HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
)
$items = foreach ($path in $paths) {
  if (Test-Path $path) {
    (Get-ItemProperty $path).PSObject.Properties |
      Where-Object { $_.Name -notlike "PS*" } |
      ForEach-Object { $_.Name }
  }
}
$items | Sort-Object -Unique | ConvertTo-Json
`

  try {
    const stdout = await execFileOutput('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
    })
    const parsed = JSON.parse(stdout)
    const names = Array.isArray(parsed) ? parsed : [parsed]
    return uniqueFontNames(names)
  } catch {
    return fallbackFonts()
  }
}

async function listMacFonts() {
  try {
    const stdout = await execFileOutput('system_profiler', ['SPFontsDataType', '-json'], { timeout: 20000 })
    const parsed = JSON.parse(stdout)
    const names = []
    collectFontNames(parsed.SPFontsDataType ?? parsed, names)
    const fonts = uniqueFontNames(names)
    return fonts.length > 0 ? fonts : fallbackFonts()
  } catch {
    return fallbackFonts()
  }
}

function execFileOutput(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout.trim())
    })
  })
}

function collectFontNames(value, names) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFontNames(item, names))
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'string' && ['_name', 'name', 'family', 'full_name', 'display_name'].includes(key)) {
      names.push(item)
      return
    }

    if (typeof item === 'object') {
      collectFontNames(item, names)
    }
  })
}

function uniqueFontNames(values) {
  return Array.from(new Set(values.map(cleanFontName).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function cleanFontName(value) {
  return String(value)
    .replace(/\s*\((TrueType|OpenType|Type 1|Raster)\)/gi, '')
    .replace(/\s*&\s*/g, ' ')
    .replace(/\s+(Regular|Normal)$/i, '')
    .trim()
}

function fallbackFonts() {
  return [
    'Courier New',
    'Courier',
    'Menlo',
    'Monaco',
    'PingFang SC',
    'PingFang TC',
    'Hiragino Sans GB',
    'Songti SC',
    'Microsoft YaHei',
    'SimSun',
    'DengXian',
    'Arial',
    'Times New Roman',
  ]
}
