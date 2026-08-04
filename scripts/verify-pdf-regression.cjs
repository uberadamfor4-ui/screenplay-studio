const fs = require('node:fs/promises')
const path = require('node:path')

const pdfPath = process.env.SCREENPLAY_PDF_OUTPUT ?? process.argv[2]
if (!pdfPath) {
  console.error('Usage: node scripts/verify-pdf-regression.cjs <output.pdf>')
  process.exitCode = 1
} else {
  verifyPdf(path.resolve(pdfPath)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

async function verifyPdf(filePath) {
  installPdfGraphicsGlobals()
  const pdfBytes = await fs.readFile(filePath)
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: pdfBytes })
  try {
    const result = await parser.getText({ pageJoiner: '\n' })
    const text = result.text ?? ''
    const radicalAliases = Array.from(text).filter((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint >= 0x2e80 && codePoint <= 0x2fdf
    })
    const requiredText = [
      '中文常规字重：灯光照亮桌面。',
      '中文粗体字重：这一行必须明显更粗。',
      '中文、繁體中文、日本語と한국어',
    ]
    const missingText = requiredText.filter((value) => !text.includes(value))
    if (radicalAliases.length > 0 || missingText.length > 0) {
      throw new Error(`PDF Unicode regression failed: ${radicalAliases.length} radical aliases, missing ${missingText.join(', ') || 'none'}`)
    }
    const geometry = await verifyProfessionalGeometry(pdfBytes)
    console.log(JSON.stringify({
      filePath,
      bytes: (await fs.stat(filePath)).size,
      pages: result.pages?.length,
      radicalAliases: 0,
      multilingualText: 'preserved',
      ...geometry,
    }, null, 2))
  } finally {
    await parser.destroy()
  }
}

async function verifyProfessionalGeometry(pdfBytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({
    data: Uint8Array.from(pdfBytes),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise
  try {
    const page = await document.getPage(2)
    const viewport = page.getViewport({ scale: 1 })
    if (Math.abs(viewport.width - 612) > 0.1 || Math.abs(viewport.height - 792) > 0.1) {
      throw new Error(`PDF page size regression: ${viewport.width} x ${viewport.height} pt`)
    }

    const content = await page.getTextContent()
    const items = content.items.filter((item) => typeof item.str === 'string' && item.str)
    const pitchLine = items.find((item) => item.str.startsWith('ABCDEFGHIJKLMNOPQRSTUVWXYZ'))
    if (!pitchLine) throw new Error('PDF pitch reference line is missing.')
    const glyphCount = Array.from(pitchLine.str).length
    const pitch = pitchLine.width / glyphCount
    if (Math.abs(pitch - 7.2) > 0.06) {
      throw new Error(`PDF character pitch regression: ${pitch.toFixed(4)} pt, expected 7.2 pt.`)
    }

    const dialogueLines = ['Every baseline', 'one sixth', 'previous line']
      .map((prefix) => items.find((item) => item.str.startsWith(prefix)))
    if (dialogueLines.some((item) => !item)) throw new Error('PDF baseline reference lines are missing.')
    const baselines = dialogueLines.map((item) => item.transform[5])
    const baselineDeltas = baselines.slice(1).map((baseline, index) => Math.abs(baseline - baselines[index]))
    if (baselineDeltas.some((delta) => Math.abs(delta - 12) > 0.05)) {
      throw new Error(`PDF line-grid regression: ${baselineDeltas.map((value) => value.toFixed(4)).join(', ')} pt.`)
    }

    const cjkGlyphs = items.filter((item) => Math.abs(item.transform[5] - 507) < 0.05 && /[\u3400-\u9fff]/u.test(item.str))
    if (cjkGlyphs.length < 8 || cjkGlyphs.some((item) => Math.abs(item.width / Array.from(item.str).length - 12) > 0.05)) {
      throw new Error('PDF CJK full-width metric regression.')
    }

    return {
      pageSizePoints: [viewport.width, viewport.height],
      characterPitchPoints: Number(pitch.toFixed(4)),
      baselineDeltasPoints: baselineDeltas.map((value) => Number(value.toFixed(4))),
      cjkGlyphWidthPoints: 12,
    }
  } finally {
    await document.destroy()
  }
}

function installPdfGraphicsGlobals() {
  const canvas = require('@napi-rs/canvas')
  for (const name of ['DOMMatrix', 'DOMPoint', 'DOMRect', 'ImageData', 'Path2D']) {
    if (typeof globalThis[name] === 'undefined' && typeof canvas[name] !== 'undefined') {
      globalThis[name] = canvas[name]
    }
  }
}
