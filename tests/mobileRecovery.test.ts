import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultProject } from '../src/sample'
import type { MobileRecord } from '../mobile/src/storage'
import { parseRecoveryRecord, recoveryDisposition } from '../mobile/src/recovery'

const record = (): MobileRecord => ({ project: createDefaultProject(), id: 'same-project', revision: 4, updatedAt: '2026-10-16T00:00:00.000Z' })
test('mobile recovery rejects malformed records without synthesizing a blank project', () => {
  for (const value of [null, [], {}, { ...record(), revision: -1 }, { ...record(), updatedAt: 'invalid' }, { ...record(), project: {} }, { ...record(), recoveryPending: 'yes' }]) assert.throws(() => parseRecoveryRecord(JSON.stringify(value)))
  assert.throws(() => parseRecoveryRecord('{'))
})
test('committed older recovery cannot replace a newer revision even with a future clock', () => {
  const existing = record(), recovery = parseRecoveryRecord(JSON.stringify({ ...existing, revision: 3, updatedAt: '2099-01-01T00:00:00.000Z' }))
  assert.equal(recoveryDisposition(recovery, existing), 'ignore')
})
test('committed matching revision does not overwrite the primary library on timestamp alone', () => {
  const existing = record(), recovery = parseRecoveryRecord(JSON.stringify({ ...existing, recoveryPending: false, updatedAt: '2099-01-01T00:00:00.000Z', project: { ...existing.project, title: 'another title' } }))
  assert.equal(recoveryDisposition(recovery, existing), 'ignore')
})
test('a newer committed revision can repair a rolled-back primary library', () => {
  const existing = record(), recovery = parseRecoveryRecord(JSON.stringify({ ...existing, revision: 5, recoveryPending: false, updatedAt: '2025-01-01T00:00:00.000Z' }))
  assert.equal(recoveryDisposition(recovery, existing), 'restore')
})
test('pending rescue restores a matching base revision regardless of clock adjustment', () => {
  const existing = record(), recovery = parseRecoveryRecord(JSON.stringify({ ...existing, recoveryPending: true, updatedAt: '2025-01-01T00:00:00.000Z' }))
  assert.equal(recoveryDisposition(recovery, existing), 'restore')
})
test('pending rescue with a different primary revision preserves both as separate projects', () => {
  const existing = record(), recovery = parseRecoveryRecord(JSON.stringify({ ...existing, revision: 3, recoveryPending: true }))
  assert.equal(recoveryDisposition(recovery, existing), 'copy')
})
test('recovery never automatically resurrects an explicitly deleted project', () => {
  const existing = { ...record(), deletedAt: '2026-10-16T01:00:00.000Z' }, recovery = parseRecoveryRecord(JSON.stringify({ ...record(), revision: 5, recoveryPending: true }))
  assert.equal(recoveryDisposition(recovery, existing), 'ignore')
})
test('legacy ambiguous rescue becomes a separate copy instead of replacing the primary', () => {
  const existing = record(), recovery = parseRecoveryRecord(JSON.stringify({ ...existing, updatedAt: '2026-10-16T01:00:00.000Z', project: { ...existing.project, title: 'unsaved rescue' } }))
  assert.equal(recoveryDisposition(recovery, existing), 'copy')
})
