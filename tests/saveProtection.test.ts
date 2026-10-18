import test from 'node:test'
import assert from 'node:assert/strict'
import { protectionState, compareRecoveryElements } from '../src/saveProtection'
import { buildDiagnosticReport, recordDiagnostic } from '../src/diagnostics'

test('a stale recovery timestamp cannot mark newly typed text saved', () => {
  const old = {}, current = {}
  assert.equal(protectionState(current, false, { project: old, state: 'saved', savedAt: '2026-10-18' }), 'pending')
  assert.equal(protectionState(current, false, { project: current, state: 'saved' }), 'recovery')
  assert.equal(protectionState(current, true, { project: old, state: 'failed' }), 'file')
  assert.equal(protectionState(current, false, { project: current, state: 'failed' }), 'failed')
  assert.equal(protectionState(current, false, { project: current, state: 'writing' }), 'writing')
})
test('recovery comparison counts textual and type changes without mutating either draft', () => {
  const before = [{ id: 'a', type: 'action', text: '省略号……' }, { id: 'b', type: 'action', text: '原稿' }]
  const after = [{ id: 'a', type: 'shot', text: '省略号……' }, { id: 'c', type: 'action', text: '新段' }]
  assert.deepEqual(compareRecoveryElements(after, before), { added: 1, removed: 1, changed: 1 })
  assert.equal(before[0].type, 'action')
})
test('diagnostics only serialize allowlisted metadata and codes', () => {
  for (let i = 0; i < 60; i++) recordDiagnostic('project-save', 'failed')
  recordDiagnostic('C:/Users/private' as never, 'secret' as never)
  const report = buildDiagnosticReport({ platform: 'private', systemVersion: 'C:/Users/secret', locale: 'zh-CN', protection: 'file-name', recovery: 'secret' })
  const json = JSON.stringify(report)
  assert.equal(report.events.length, 50)
  assert.equal(report.platform, 'browser')
  assert.ok(!json.includes('secret') && !json.includes('C:/'))
  assert.equal(report.privacy.automaticallyUploaded, false)
})
