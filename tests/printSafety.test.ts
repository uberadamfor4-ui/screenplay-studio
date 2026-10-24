import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import printSafety from '../electron/printSafety.cjs'
import { CoverOverflowError, coverOverflowCode, exportFailureStatus } from '../src/exportErrors'

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }
const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom, width: right - left, height: bottom - top })
const element = (bounds: Box, fragments = [bounds]) => ({ getBoundingClientRect: () => bounds, fragments })
function inspect(content = element(box(144, 359, 720, 500)), furniture: ReturnType<typeof element>[] = [], margin = '96') {
  const page = { getBoundingClientRect: () => box(0, 0, 816, 1056), getAttribute: () => margin, querySelector: () => content, querySelectorAll: () => furniture }
  let selected = content
  return runInNewContext(printSafety.coverBoundsScript, { document: { querySelectorAll: () => [page], createRange: () => ({ selectNodeContents: (value: typeof content) => { selected = value }, getClientRects: () => selected.fragments }) } })
}

test('PDF cover preflight accepts normal content and separate footer columns', () => {
  assert.equal(inspect(), true)
  assert.equal(inspect(undefined, [element(box(144, 910, 420, 960)), element(box(444, 940, 720, 960))]), true)
  assert.equal(runInNewContext(printSafety.coverBoundsScript, { document: { querySelectorAll: () => [] } }), true)
})

test('PDF cover preflight rejects clipped titles, excessive height and footer collisions', () => {
  assert.equal(inspect(element(box(144, 359, 720, 500), [box(-300, 359, 1200, 375)])), false)
  assert.equal(inspect(element(box(144, 359, 720, 1700))), false)
  assert.equal(inspect(undefined, [element(box(144, 490, 420, 960))]), false)
  assert.equal(inspect(undefined, [element(box(144, -900, 420, 960))]), false)
  assert.equal(inspect(undefined, [], 'invalid'), false)
})

test('cover overflow transport code maps to a localized actionable status only for the known error', () => {
  assert.equal(printSafety.coverOverflowCode, coverOverflowCode)
  assert.equal(exportFailureStatus(new CoverOverflowError()), 'exportCoverOverflow')
  assert.equal(exportFailureStatus(new Error(`Error invoking remote method 'export:pdf': Error: ${coverOverflowCode}: Cover text does not fit on one page.`)), 'exportCoverOverflow')
  assert.equal(exportFailureStatus(new Error('Disk full')), 'exportFailed')
  assert.equal(exportFailureStatus(undefined), 'exportFailed')
})
