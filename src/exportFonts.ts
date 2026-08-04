const exportFontTimeoutMs = 5000

export async function waitForExportFonts(fontSize: number, timeoutMs = exportFontTimeoutMs) {
  if (typeof document === 'undefined' || !document.fonts) return

  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, timeoutMs)
  })
  const fontTasks = [
    document.fonts.ready,
    document.fonts.load(`${fontSize}pt "Courier Prime"`),
    document.fonts.load(`${fontSize}pt "Screenplay CJK"`),
    document.fonts.load(`700 ${fontSize}pt "Screenplay CJK"`),
  ]

  try {
    await Promise.race([
      Promise.allSettled(fontTasks).then(() => undefined),
      deadline,
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
