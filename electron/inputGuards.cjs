function isNativePrintShortcut(input, platform = process.platform) {
  if (!input || input.type !== 'keyDown' || String(input.key).toLowerCase() !== 'p') {
    return false
  }

  const commandOrControl = platform === 'darwin' ? input.meta === true : input.control === true
  return commandOrControl && input.shift !== true && input.alt !== true
}

function installInputGuards(browserWindow) {
  browserWindow.webContents.on('before-input-event', (event, input) => {
    if (!isNativePrintShortcut(input)) return
    event.preventDefault()
    if (input.isAutoRepeat) return
    browserWindow.webContents.send('menu:command', 'restoreEditorFocus')
  })
}

module.exports = {
  installInputGuards,
  isNativePrintShortcut,
}
