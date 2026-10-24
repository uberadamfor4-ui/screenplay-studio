import { bundledFonts, fontFallbacks } from './fontFamilies'

const exportFontTimeoutMs = 5000

export async function waitForExportFonts(fontSize: number, timeoutMs = exportFontTimeoutMs, families: string[] = []) {
  if (typeof document === 'undefined' || !document.fonts) return

  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, timeoutMs)
  })
  const fonts = [...new Set([...bundledFonts, ...families.flatMap(fontFallbacks)])]
  const fontTasks = [document.fonts.ready, ...fonts.flatMap(font => ['400', '700', 'italic 400', 'italic 700'].map(variant =>
    Promise.resolve().then(() => document.fonts.load(`${variant} ${fontSize}pt ${JSON.stringify(font)}`, 'Aa中文繁體日本語한국어𠮷')),
  ))]

  try {
    await Promise.race([
      Promise.allSettled(fontTasks).then(() => undefined),
      deadline,
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
