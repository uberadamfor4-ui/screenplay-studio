const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { TextDecoder } = require('node:util')
const mammoth = require('mammoth')
const { addBoundedTextBytes, inspectDocxArchive } = require('./documentSafety.cjs')
const { uniqueFontNames } = require('./fontNames.cjs')
const { installInputGuards } = require('./inputGuards.cjs')
const { findStalePngFiles } = require('./pngExportSafety.cjs')

const APP_DISPLAY_NAME = '剧本工坊'
const DEVELOPER_CREDIT = '本软件由1037 Film 郭之然独立开发完成'
const isDev = process.env.SCREENPLAY_DEV === '1'
const isMac = process.platform === 'darwin'
const pngExportSessions = new Map()
let recoveryWriteQueue = Promise.resolve()
const maxProjectFileBytes = 32 * 1024 * 1024
const maxFdxFileBytes = 16 * 1024 * 1024
const maxImportFileBytes = 8 * 1024 * 1024
const maxDocumentFileBytes = 25 * 1024 * 1024
const maxImportedTextCharacters = 4 * 1024 * 1024
const maxIpcTextBytes = 64 * 1024 * 1024
const maxPngDataUrlCharacters = 80 * 1024 * 1024
const maxFdxLabFiles = 50
const maxFdxLabTotalTextBytes = 64 * 1024 * 1024
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let applicationLocale = 'zh-CN'

const desktopMenuLabels = {
  'zh-CN': {
    appName: '剧本工坊',
    about: '关于{app}',
    aboutDetail: '专注写作布局。支持好莱坞剧本格式、FDX、PDF 和 PNG 导出。',
    acknowledge: '知道了',
    file: '文件',
    newProject: '新建剧本',
    openProject: '打开剧本...',
    preferences: '偏好设置...',
    commandPalette: '命令面板...',
    assistiveTools: '辅助功能...',
    save: '保存',
    saveAs: '另存为...',
    importFdx: '导入 FDX...',
    importDocument: '导入文档...',
    exportFdx: '导出 FDX...',
    exportPdf: '导出 PDF...',
    exportPng: '导出 PNG 图片...',
    closeWindow: '关闭窗口',
    quit: '退出{app}',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    view: '视图',
    writing: '专注写作',
    preproduction: '前期制片',
    onset: '拍摄现场',
    post: '后期交接',
    actualSize: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    reload: '重新加载',
    fullscreen: '全屏',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    help: '帮助',
    hide: '隐藏{app}',
    hideOthers: '隐藏其他',
    showAll: '全部显示',
  },
  'en-US': {
    appName: 'Screenplay Studio',
    about: 'About {app}',
    aboutDetail: 'A focused writing workspace with Hollywood screenplay formatting and FDX, PDF, and PNG export.',
    acknowledge: 'OK',
    file: 'File',
    newProject: 'New Script',
    openProject: 'Open Script...',
    preferences: 'Preferences...',
    commandPalette: 'Command Palette...',
    assistiveTools: 'Assistive Tools...',
    save: 'Save',
    saveAs: 'Save As...',
    importFdx: 'Import FDX...',
    importDocument: 'Import Document...',
    exportFdx: 'Export FDX...',
    exportPdf: 'Export PDF...',
    exportPng: 'Export PNG Images...',
    closeWindow: 'Close Window',
    quit: 'Quit {app}',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    writing: 'Focus Writing',
    preproduction: 'Preproduction',
    onset: 'On Set',
    post: 'Post Handoff',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    reload: 'Reload',
    fullscreen: 'Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    help: 'Help',
    hide: 'Hide {app}',
    hideOthers: 'Hide Others',
    showAll: 'Show All',
  },
  'zh-TW': {
    appName: '劇本工坊',
    about: '關於{app}',
    aboutDetail: '專注寫作佈局。支援好萊塢劇本格式、FDX、PDF 與 PNG 匯出。',
    acknowledge: '知道了',
    file: '檔案',
    newProject: '新增劇本',
    openProject: '開啟劇本...',
    preferences: '偏好設定...',
    commandPalette: '命令面板...',
    assistiveTools: '輔助功能...',
    save: '儲存',
    saveAs: '另存新檔...',
    importFdx: '匯入 FDX...',
    importDocument: '匯入文件...',
    exportFdx: '匯出 FDX...',
    exportPdf: '匯出 PDF...',
    exportPng: '匯出 PNG 圖片...',
    closeWindow: '關閉視窗',
    quit: '結束{app}',
    edit: '編輯',
    undo: '復原',
    redo: '重做',
    cut: '剪下',
    copy: '複製',
    paste: '貼上',
    selectAll: '全選',
    view: '檢視',
    writing: '專注寫作',
    preproduction: '前期製片',
    onset: '拍攝現場',
    post: '後期交接',
    actualSize: '實際大小',
    zoomIn: '放大',
    zoomOut: '縮小',
    reload: '重新載入',
    fullscreen: '全螢幕',
    window: '視窗',
    minimize: '最小化',
    zoom: '縮放',
    help: '說明',
    hide: '隱藏{app}',
    hideOthers: '隱藏其他',
    showAll: '全部顯示',
  },
}

app.setName(APP_DISPLAY_NAME)

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f3f4f1',
    title: APP_DISPLAY_NAME,
    icon: path.join(__dirname, '..', 'assets', 'brand', isMac ? 'app-icon-512.png' : 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  installInputGuards(mainWindow)
  installNavigationGuards(mainWindow)

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  installApplicationMenu(mainWindow, applicationLocale)
  return mainWindow
}

function installNavigationGuards(browserWindow) {
  const productionEntry = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  browserWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
  browserWindow.webContents.on('will-navigate', (event, targetUrl) => {
    let trusted = targetUrl === productionEntry || targetUrl.startsWith(`${productionEntry}#`)
    if (isDev) {
      try {
        trusted = new URL(targetUrl).origin === 'http://127.0.0.1:5173'
      } catch {
        trusted = false
      }
    }
    if (!trusted) event.preventDefault()
  })
}

function installApplicationMenu(mainWindow, locale) {
  const labels = desktopMenuLabels[normalizeDesktopLocale(locale)]
  const formatAppLabel = (value) => value.replace('{app}', labels.appName)
  const sendCommand = (command) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:command', command)
    }
  }

  const showAbout = () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: formatAppLabel(labels.about),
      message: labels.appName,
      detail: `${labels.aboutDetail}\n\n${DEVELOPER_CREDIT}`,
      buttons: [labels.acknowledge],
    })
  }
  const rendererAccelerator = (accelerator) => isMac ? {} : {
    accelerator,
    registerAccelerator: false,
  }

  const fileMenu = {
    label: labels.file,
    submenu: [
      { label: labels.newProject, ...rendererAccelerator('CommandOrControl+N'), click: () => sendCommand('newProject') },
      { label: labels.openProject, ...rendererAccelerator('CommandOrControl+O'), click: () => sendCommand('openProject') },
      { label: labels.preferences, ...rendererAccelerator('CommandOrControl+,'), click: () => sendCommand('openPreferences') },
      { label: labels.commandPalette, ...rendererAccelerator('CommandOrControl+K'), click: () => sendCommand('openCommandPalette') },
      { label: labels.assistiveTools, ...rendererAccelerator('CommandOrControl+Shift+U'), click: () => sendCommand('openAssistiveTools') },
      { type: 'separator' },
      { label: labels.save, ...rendererAccelerator('CommandOrControl+S'), click: () => sendCommand('saveProject') },
      { label: labels.saveAs, ...rendererAccelerator('CommandOrControl+Shift+S'), click: () => sendCommand('saveProjectAs') },
      { type: 'separator' },
      { label: labels.importFdx, click: () => sendCommand('importFdx') },
      { label: labels.importDocument, click: () => sendCommand('importWordTxt') },
      { label: labels.exportFdx, click: () => sendCommand('exportFdx') },
      { label: labels.exportPdf, click: () => sendCommand('exportPdf') },
      { label: labels.exportPng, click: () => sendCommand('exportPng') },
      { type: 'separator' },
      isMac
        ? { label: labels.closeWindow, accelerator: 'Command+W', role: 'close' }
        : { label: formatAppLabel(labels.quit), accelerator: 'Alt+F4', role: 'quit' },
    ],
  }

  const template = [
    fileMenu,
    {
      label: labels.edit,
      submenu: [
        { label: labels.undo, ...rendererAccelerator('CommandOrControl+Z'), click: () => sendCommand('undoProject') },
        { label: labels.redo, ...rendererAccelerator('CommandOrControl+Y'), click: () => sendCommand('redoProject') },
        { type: 'separator' },
        { label: labels.cut, accelerator: 'CommandOrControl+X', role: 'cut' },
        { label: labels.copy, accelerator: 'CommandOrControl+C', role: 'copy' },
        { label: labels.paste, accelerator: 'CommandOrControl+V', role: 'paste' },
        { label: labels.selectAll, accelerator: 'CommandOrControl+A', role: 'selectAll' },
      ],
    },
    {
      label: labels.view,
      submenu: [
        { label: labels.writing, ...rendererAccelerator('CommandOrControl+1'), click: () => sendCommand('openWritingWorkspace') },
        { label: labels.preproduction, ...rendererAccelerator('CommandOrControl+2'), click: () => sendCommand('openPreproduction') },
        { label: labels.onset, ...rendererAccelerator('CommandOrControl+3'), click: () => sendCommand('openOnset') },
        { label: labels.post, ...rendererAccelerator('CommandOrControl+4'), click: () => sendCommand('openPost') },
        { type: 'separator' },
        { label: labels.actualSize, accelerator: 'CommandOrControl+0', role: 'resetZoom' },
        { label: labels.zoomIn, accelerator: 'CommandOrControl+=', role: 'zoomIn' },
        { label: labels.zoomOut, accelerator: 'CommandOrControl+-', role: 'zoomOut' },
        { type: 'separator' },
        ...(isDev ? [{ label: labels.reload, accelerator: 'CommandOrControl+R', role: 'reload' }] : []),
        { label: labels.fullscreen, accelerator: isMac ? 'Control+Command+F' : 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: labels.window,
      submenu: [
        { label: labels.minimize, accelerator: 'CommandOrControl+M', role: 'minimize' },
        ...(isMac ? [{ label: labels.zoom, role: 'zoom' }] : []),
        { label: labels.closeWindow, accelerator: 'CommandOrControl+W', role: 'close' },
      ],
    },
    {
      label: labels.help,
      submenu: [{ label: formatAppLabel(labels.about), click: showAbout }],
    },
  ]

  if (isMac) {
    template.unshift({
      label: labels.appName,
      submenu: [
        { label: formatAppLabel(labels.about), click: showAbout },
        { type: 'separator' },
        { label: labels.preferences, click: () => sendCommand('openPreferences') },
        { type: 'separator' },
        { label: formatAppLabel(labels.hide), accelerator: 'Command+H', role: 'hide' },
        { label: labels.hideOthers, accelerator: 'Command+Option+H', role: 'hideOthers' },
        { label: labels.showAll, role: 'unhide' },
        { type: 'separator' },
        { label: formatAppLabel(labels.quit), accelerator: 'Command+Q', role: 'quit' },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

function registerIpc() {
  ipcMain.handle('system:listFonts', async () => ({ fonts: await listFonts() }))
  ipcMain.handle('system:setUiLocale', (event, locale) => {
    applicationLocale = normalizeDesktopLocale(locale)
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner && !owner.isDestroyed()) {
      owner.setTitle(desktopMenuLabels[applicationLocale].appName)
      installApplicationMenu(owner, applicationLocale)
    }
    return { locale: applicationLocale }
  })

  ipcMain.handle('file:openText', async (event, filters) => {
    const result = await showOpenDialogFor(event, {
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

  ipcMain.handle('file:openTexts', async (event, filters) => {
    const result = await showOpenDialogFor(event, {
      title: '选择 FDX 互通样本',
      properties: ['openFile', 'multiSelections'],
      filters,
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, files: [] }
    }

    if (result.filePaths.length > maxFdxLabFiles) {
      throw new Error(`一次最多检查 ${maxFdxLabFiles} 个 FDX 文件。`)
    }

    const files = []
    let totalTextBytes = 0
    let batchLimitReached = false
    for (const filePath of result.filePaths) {
      if (batchLimitReached) {
        files.push({ filePath, content: '', error: '所选 FDX 样本正文合计过大，请分批检查。' })
        continue
      }
      try {
        if (path.extname(filePath).toLowerCase() !== '.fdx') {
          throw new Error('FDX 互通实验室只接受 .fdx 文件。')
        }
        const content = await readTextFileContent(filePath)
        totalTextBytes = addBoundedTextBytes(totalTextBytes, content, maxFdxLabTotalTextBytes)
        files.push({ filePath, content })
      } catch (error) {
        if (error instanceof Error && error.message.includes('正文合计超过')) batchLimitReached = true
        files.push({
          filePath,
          content: '',
          error: error instanceof Error ? error.message : '无法读取文件',
        })
      }
    }
    return { canceled: false, files }
  })

  ipcMain.handle('file:saveText', async (event, payload) => {
    assertTextPayload(payload?.content, maxIpcTextBytes, '保存内容')
    let filePath = payload.filePath

    if (!filePath) {
      const result = await showSaveDialogFor(event, {
        title: '保存剧本',
        defaultPath: payload.suggestedName,
        filters: payload.filters,
      })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      filePath = result.filePath
    }

    await atomicWriteFile(filePath, payload.content, 'utf8')
    return { canceled: false, filePath }
  })

  ipcMain.handle('export:pdf', async (event, payload) => {
    assertTextPayload(payload?.html, maxIpcTextBytes, 'PDF 页面')
    const result = await showSaveDialogFor(event, {
      title: '导出 PDF',
      defaultPath: payload.suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const pdf = await renderPdf(payload.html)
    await atomicWriteFile(result.filePath, pdf)
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('export:choosePngFolder', async (event, suggestedFolderName) => {
    const result = await showOpenDialogFor(event, {
      title: '选择 PNG 导出文件夹',
      defaultPath: typeof suggestedFolderName === 'string' ? suggestedFolderName : undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    const exportToken = randomUUID()
    const expires = setTimeout(() => pngExportSessions.delete(exportToken), 30 * 60 * 1000)
    expires.unref()
    pngExportSessions.set(exportToken, {
      folderPath: result.filePaths[0],
      senderId: event.sender.id,
      expires,
      writtenFileNames: new Set(),
    })
    return { canceled: false, filePath: result.filePaths[0], exportToken }
  })

  ipcMain.handle('export:pngPage', async (event, payload) => {
    const session = pngExportSessions.get(payload?.exportToken)
    if (!session || session.senderId !== event.sender.id) {
      throw new Error('PNG 导出会话已失效，请重新选择导出文件夹。')
    }
    const page = payload?.page
    const fileName = path.basename(typeof page?.name === 'string' ? page.name : '')
    if (typeof page?.dataUrl !== 'string' || page.dataUrl.length > maxPngDataUrlCharacters) {
      throw new Error('PNG 页面数据过大或无效。')
    }
    const match = typeof page?.dataUrl === 'string' ? page.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/) : null
    if (!fileName || path.extname(fileName).toLowerCase() !== '.png' || !match) {
      throw new Error('PNG 页面数据无效。')
    }
    const destination = path.join(session.folderPath, fileName)
    await atomicWriteFile(destination, Buffer.from(match[1], 'base64'))
    session.writtenFileNames.add(fileName)
    return { canceled: false, filePath: destination }
  })

  ipcMain.handle('export:finishPng', async (event, payload) => {
    const exportToken = payload?.exportToken
    const session = pngExportSessions.get(exportToken)
    if (!session || session.senderId !== event.sender.id) {
      return { canceled: false }
    }

    try {
      if (payload.completed) {
        const directoryEntries = await fs.readdir(session.folderPath)
        const staleFiles = findStalePngFiles(directoryEntries, session.writtenFileNames)
        await Promise.all(staleFiles.map((fileName) => fs.rm(path.join(session.folderPath, fileName), { force: true })))
      }
    } finally {
      clearTimeout(session.expires)
      pngExportSessions.delete(exportToken)
    }
    return { canceled: false }
  })

  ipcMain.handle('edit:native', (event, command) => {
    if (command === 'undo') {
      event.sender.undo()
      return true
    }
    if (command === 'redo') {
      event.sender.redo()
      return true
    }
    throw new Error('不支持的编辑命令。')
  })

  ipcMain.handle('recovery:read', async () => {
    try {
      return JSON.parse(await fs.readFile(getRecoverySnapshotPath(), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return undefined
      throw error
    }
  })

  ipcMain.handle('recovery:write', async (_event, snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.savedAt !== 'string' || !Array.isArray(snapshot.project?.elements)) {
      throw new Error('自动恢复数据无效。')
    }
    const serialized = JSON.stringify(snapshot)
    if (Buffer.byteLength(serialized, 'utf8') > maxIpcTextBytes) {
      throw new Error('自动恢复数据过大，已停止写入。')
    }
    recoveryWriteQueue = recoveryWriteQueue
      .catch(() => undefined)
      .then(async () => {
        const filePath = getRecoverySnapshotPath()
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await atomicWriteFile(filePath, serialized, 'utf8')
        return true
      })
    return recoveryWriteQueue
  })
}

function normalizeDesktopLocale(value) {
  return value === 'en-US' || value === 'zh-TW' ? value : 'zh-CN'
}

function showOpenDialogFor(event, options) {
  const owner = BrowserWindow.fromWebContents(event.sender)
  return owner && !owner.isDestroyed()
    ? dialog.showOpenDialog(owner, options)
    : dialog.showOpenDialog(options)
}

function showSaveDialogFor(event, options) {
  const owner = BrowserWindow.fromWebContents(event.sender)
  return owner && !owner.isDestroyed()
    ? dialog.showSaveDialog(owner, options)
    : dialog.showSaveDialog(options)
}

function getRecoverySnapshotPath() {
  return path.join(app.getPath('userData'), 'recovery', 'autosave.json')
}

async function readTextFileContent(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const stats = await fs.stat(filePath)
  const maxBytes = getFileByteLimit(extension)
  if (!stats.isFile() || stats.size > maxBytes) {
    throw new Error(`文件过大，此类文件上限为 ${Math.round(maxBytes / 1024 / 1024)} MB。`)
  }

  const buffer = await fs.readFile(filePath)
  if (buffer.length > maxBytes) {
    throw new Error(`文件过大，此类文件上限为 ${Math.round(maxBytes / 1024 / 1024)} MB。`)
  }

  if (extension === '.docx') {
    await inspectDocxArchive(buffer)
    const result = await withTimeout(mammoth.extractRawText({ buffer }), 30_000, 'Word 文档解析超时，请拆分或重新保存文件后再试。')
    return limitExtractedText(result.value, maxImportedTextCharacters)
  }

  if (extension === '.pdf') {
    const PDFParse = loadPdfParser()
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await withTimeout(parser.getText({ pageJoiner: '\n' }), 30_000, 'PDF 文档解析超时，请拆分或重新导出文件后再试。')
      return limitExtractedText(result.text, maxImportedTextCharacters)
    } finally {
      await withTimeout(parser.destroy(), 5_000, 'PDF 解析器清理超时。').catch(() => undefined)
    }
  }

  return limitExtractedText(decodeTextBuffer(buffer), getTextCharacterLimit(extension))
}

function getFileByteLimit(extension) {
  if (extension === '.docx' || extension === '.pdf') return maxDocumentFileBytes
  if (extension === '.ssproj' || extension === '.json') return maxProjectFileBytes
  if (extension === '.fdx') return maxFdxFileBytes
  return maxImportFileBytes
}

function getTextCharacterLimit(extension) {
  if (extension === '.ssproj' || extension === '.json') return maxProjectFileBytes
  if (extension === '.fdx') return maxFdxFileBytes
  return maxImportedTextCharacters
}

function limitExtractedText(value, maxCharacters) {
  if (value.length > maxCharacters) {
    throw new Error('文档解压后的文字过多，已停止导入以防止软件卡死。')
  }
  return value
}

function assertTextPayload(value, maxBytes, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label}无效。`)
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new Error(`${label}过大，已停止处理。`)
  }
}

async function atomicWriteFile(filePath, content, encoding) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  )
  try {
    await fs.writeFile(tempPath, content, encoding)
    await fs.rename(tempPath, filePath)
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
  }
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
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const regularFontPath = app.isPackaged
    ? path.join(process.resourcesPath, 'fonts', 'ScreenplayCJK-Regular.otf')
    : path.join(__dirname, '..', 'src', 'assets', 'fonts', 'ScreenplayCJK-Regular.otf')
  const boldFontPath = app.isPackaged
    ? path.join(process.resourcesPath, 'fonts', 'ScreenplayCJK-Bold.otf')
    : path.join(__dirname, '..', 'src', 'assets', 'fonts', 'ScreenplayCJK-Bold.otf')
  const printableHtml = html
    .replaceAll('{{SCREENPLAY_CJK_REGULAR_FONT_URL}}', pathToFileURL(regularFontPath).href)
    .replaceAll('{{SCREENPLAY_CJK_BOLD_FONT_URL}}', pathToFileURL(boldFontPath).href)
  const tempHtmlPath = path.join(app.getPath('temp'), `screenplay-studio-print-${process.pid}-${Date.now()}-${randomUUID()}.html`)

  try {
    await fs.writeFile(tempHtmlPath, printableHtml, 'utf8')
    await withTimeout(printWindow.loadFile(tempHtmlPath), 30_000, 'PDF 页面加载超时。')
    await withTimeout(
      printWindow.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true'),
      30_000,
      'PDF 字体加载超时。',
    )
    return await withTimeout(printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' },
    }), 60_000, 'PDF 生成超时。')
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
    await fs.unlink(tempHtmlPath).catch(() => {})
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
    timeout.unref?.()
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
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
Add-Type -AssemblyName System.Drawing
$collection = New-Object System.Drawing.Text.InstalledFontCollection
$collection.Families |
  ForEach-Object { $_.Name } |
  Sort-Object -Unique |
  ConvertTo-Json
`

  try {
    const stdout = await execFileOutput('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      timeout: 20000,
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
    execFile(command, args, { maxBuffer: 16 * 1024 * 1024, ...options }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout.trim().replace(/^\uFEFF/u, ''))
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
