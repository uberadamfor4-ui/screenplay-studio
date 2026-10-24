import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForExportFonts } from '../src/exportFonts'

test('export font readiness has a bounded wait', async () => {
  const originalDocument = globalThis.document
  const never = new Promise<FontFaceSet>(() => undefined)
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      fonts: {
        ready: never,
        load: () => new Promise<FontFace[]>(() => undefined),
      },
    },
  })

  const startedAt = performance.now()
  try {
    await waitForExportFonts(12, 20)
  } finally {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
  }
  assert.ok(performance.now() - startedAt < 250)
})

test('readiness requests all four emphasis variants plus paragraph and run font families', async () => {
  const originalDocument = globalThis.document
  const requests: string[] = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { ready: Promise.resolve(), load: (font: string) => { requests.push(font); return Promise.resolve([]) } } } })
  try { await waitForExportFonts(12, 100, ['宋体', 'Some Run Font']) } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  }
  for (const font of ['Courier Prime', 'Screenplay CJK', 'SimSun', 'Songti SC', 'Some Run Font']) {
    for (const variant of ['400', '700', 'italic 400', 'italic 700']) assert.ok(requests.includes(`${variant} 12pt "${font}"`))
  }
  assert.equal(new Set(requests).size, requests.length)
})

test('synchronous font loader failures cannot reject or hang the export', async () => {
  const originalDocument = globalThis.document
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { ready: Promise.resolve(), load: () => { throw new Error('Font unavailable') } } } })
  try { await waitForExportFonts(12, 30) } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  }
})
