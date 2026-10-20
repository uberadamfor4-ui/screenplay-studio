const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('screenplay', {
  runtimeInfo: () => ipcRenderer.invoke('system:runtimeInfo'),
  inspectAssets: (payload) => ipcRenderer.invoke('project:inspectAssets', payload),
  exportPortableProject: (payload) => ipcRenderer.invoke('project:exportPortable', payload),
  importPortableProject: () => ipcRenderer.invoke('project:importPortable'),
  listFonts: () => ipcRenderer.invoke('system:listFonts'),
  setUiLocale: (locale) => ipcRenderer.invoke('system:setUiLocale', locale),
  openTextFile: (filters) => ipcRenderer.invoke('file:openText', filters),
  getPendingExternalOpen: () => ipcRenderer.invoke('project:getPendingOpen'),
  acknowledgeExternalOpen: (requestId) => ipcRenderer.invoke('project:acknowledgeOpen', requestId),
  onExternalOpen: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('project:openAvailable', listener)
    return () => ipcRenderer.removeListener('project:openAvailable', listener)
  },
  openTextFiles: (filters) => ipcRenderer.invoke('file:openTexts', filters),
  saveTextFile: (payload) => ipcRenderer.invoke('file:saveText', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  exportSubmission: (payload) => ipcRenderer.invoke('export:submission', payload),
  choosePngFolder: (suggestedFolderName) => ipcRenderer.invoke('export:choosePngFolder', suggestedFolderName),
  exportPngPage: (payload) => ipcRenderer.invoke('export:pngPage', payload),
  finishPngExport: (payload) => ipcRenderer.invoke('export:finishPng', payload),
  performNativeEdit: (command) => ipcRenderer.invoke('edit:native', command),
  readRecoverySnapshot: () => ipcRenderer.invoke('recovery:read'),
  writeRecoverySnapshot: (snapshot) => ipcRenderer.invoke('recovery:write', snapshot),
  readRevisionSnapshot: () => ipcRenderer.invoke('revision:read'),
  writeRevisionSnapshot: (snapshot) => ipcRenderer.invoke('revision:write', snapshot),
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
})
