import assert from 'node:assert/strict'
import test from 'node:test'
import { limitStandaloneVersionSnapshots, limitVersionHistoryForProject, measureJsonByteLength, serializeProjectForSave } from '../src/projectSerialization'
import type { ScriptProject, VersionSnapshot } from '../src/types'

const project: ScriptProject = {
  appVersion: '0.6.5',
  title: 'Serialization Test',
  author: 'Writer',
  language: 'en-US',
  formatId: 'hollywood',
  fontFamily: 'Courier Prime',
  fontSize: 12,
  pageSize: 'letter',
  elements: [{ id: 'element', type: 'action', text: 'A'.repeat(200) }],
}

function snapshot(id: string, textLength: number): VersionSnapshot {
  return {
    id,
    title: project.title,
    note: id,
    createdAt: '2026-08-05T00:00:00.000Z',
    elements: [{ id: `${id}-element`, type: 'action', text: 'B'.repeat(textLength) }],
  }
}

test('project serializer falls back to compact JSON before rejecting a reopen-incompatible file', () => {
  const prettyBytes = new TextEncoder().encode(JSON.stringify(project, null, 2)).byteLength
  const compactBytes = new TextEncoder().encode(JSON.stringify(project)).byteLength
  const compact = serializeProjectForSave(project, Math.floor((prettyBytes + compactBytes) / 2))
  assert.equal(compact, JSON.stringify(project))
  assert.throws(() => serializeProjectForSave(project, compactBytes - 1), /无法生成可重新打开/u)
})

test('version history keeps newest snapshots while dropping older entries before project overflow', () => {
  const snapshots = [snapshot('newest', 500), snapshot('middle', 500), snapshot('oldest', 500)]
  const oneSnapshotBytes = new TextEncoder().encode(JSON.stringify({ ...project, versionHistory: snapshots.slice(0, 1) })).byteLength
  const limited = limitVersionHistoryForProject(project, snapshots, 40, oneSnapshotBytes + 120)
  assert.deepEqual(limited.map((item) => item.id), ['newest'])
})

test('version history rejects a new snapshot when the current project leaves no safe room', () => {
  const limited = limitVersionHistoryForProject(project, [snapshot('too-large', 10_000)], 40, 1000)
  assert.deepEqual(limited, [])
})

test('local recovery history is bounded before localStorage serialization', () => {
  const snapshots = [snapshot('newest', 500), snapshot('middle', 500), snapshot('oldest', 500)]
  const oneSnapshotBytes = new TextEncoder().encode(JSON.stringify(snapshots.slice(0, 1))).byteLength
  const limited = limitStandaloneVersionSnapshots(snapshots, 30, oneSnapshotBytes + 100)
  assert.deepEqual(limited.map((item) => item.id), ['newest'])
})

test('bounded JSON measurement matches serialization for multilingual and escaped text', () => {
  const value = {
    text: '中文\n"quoted"\\path\u0000😀',
    values: [true, false, null, Number.NaN, undefined],
    omitted: undefined,
  }
  const actual = new TextEncoder().encode(JSON.stringify(value)).byteLength
  assert.equal(measureJsonByteLength(value), actual)
  assert.equal(measureJsonByteLength(value, actual - 1), actual)
})
