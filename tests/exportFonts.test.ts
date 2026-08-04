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
