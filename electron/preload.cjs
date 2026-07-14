const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('screenplay', {
  listFonts: () => ipcRenderer.invoke('system:listFonts'),
  openTextFile: (filters) => ipcRenderer.invoke('file:openText', filters),
  openTextFiles: (filters) => ipcRenderer.invoke('file:openTexts', filters),
  saveTextFile: (payload) => ipcRenderer.invoke('file:saveText', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  exportPngPages: (payload) => ipcRenderer.invoke('export:pngPages', payload),
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
})
