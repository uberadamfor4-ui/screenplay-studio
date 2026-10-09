import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const persistenceSources: string[] = []
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && ['persistAutoSaveSnapshot', 'canReplaceCurrentProject', 'checkpointCurrentProject'].includes(node.name?.text ?? '')) persistenceSources.push(node.getText(parsed))
  ts.forEachChild(node, visit)
}
visit(parsed)
assert.equal(persistenceSources.length, 3)
const compiled = ts.transpile(persistenceSources.join('\n'), { target: ts.ScriptTarget.ES2022 })

function deferred() {
  let resolve!: (value: boolean) => void
  let reject!: (error: Error) => void
  const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness(localSuccess = false) {
  const firstProject = { elements: [{ id: 'one', type: 'action', text: 'Unsaved screenplay' }] }
  const writes: ReturnType<typeof deferred>[] = []
  const published: string[] = []
  const acknowledgements: string[] = []
  const state = {
    project: firstProject,
    autoSavePayloadRef: { current: { project: firstProject, filePath: undefined as string | undefined } },
    lastAutoSavePayloadRef: { current: undefined as { persisted: boolean; project: unknown } | undefined },
    savedProjectRef: { current: undefined as unknown },
    recoveryReadCompleteRef: { current: true },
    autoSaveNoticeRef: { current: undefined as unknown },
    status: 'ready',
    window: { screenplay: { writeRecoverySnapshot: () => { const pending = deferred(); writes.push(pending); return pending.promise } } },
    writeLocalAutoSaveSnapshot: () => localSuccess,
    synchronizeProductionData: () => ({}),
    acknowledgeAutoSave: (timestamp: string) => acknowledgements.push(timestamp),
    publishAutoSaveTimestamp: (timestamp: string) => published.push(timestamp),
    setStatusKey: (value: string | ((current: string) => string)) => { state.status = typeof value === 'function' ? value(state.status) : value },
    setRecoverySnapshots: () => {},
  }
  const functions = runInNewContext(`${compiled}\n({ persist: persistAutoSaveSnapshot, checkpoint: checkpointCurrentProject })`, state) as { persist: () => string | undefined; checkpoint: (note?: string, preservePending?: boolean) => boolean }
  return { state, ...functions, writes, published, acknowledgements, firstProject }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('a fully failed autosave does not publish success and retries unchanged text', async () => {
  const run = harness()
  assert.equal(run.persist(), undefined)
  run.writes[0].reject(new Error('Disk unavailable'))
  await settle()
  assert.equal(run.state.lastAutoSavePayloadRef.current, undefined)
  assert.equal(run.state.status, 'autoSaveFailed')
  assert.equal(run.published.length, 0)
  run.persist()
  assert.equal(run.writes.length, 2)
  run.writes[1].resolve(true)
  await settle()
  assert.equal(run.published.length, 1)
  assert.equal(run.state.status, 'ready')
})

test('local fallback success still retries a failed disk copy', async () => {
  const run = harness(true)
  assert.ok(run.persist())
  run.writes[0].reject(new Error('Disk unavailable'))
  await settle()
  assert.equal(run.state.status, 'ready')
  run.persist()
  assert.equal(run.writes.length, 2)
  run.writes[1].resolve(true)
  await settle()
})

test('a disk write returning false is treated as a failure rather than a success', async () => {
  const run = harness()
  run.persist()
  run.writes[0].resolve(false)
  await settle()
  assert.equal(run.published.length, 0)
  assert.equal(run.state.lastAutoSavePayloadRef.current, undefined)
  assert.equal(run.state.status, 'autoSaveFailed')
})

test('an older failed write cannot invalidate a newer autosave attempt', async () => {
  const run = harness()
  run.persist()
  run.state.autoSavePayloadRef.current = { project: { elements: [{ id: 'two', type: 'action', text: 'New text' }] }, filePath: undefined }
  run.persist()
  const latestAttempt = run.state.lastAutoSavePayloadRef.current
  run.writes[0].reject(new Error('Older failure'))
  await settle()
  assert.equal(run.state.lastAutoSavePayloadRef.current, latestAttempt)
  assert.equal(run.state.status, 'ready')
  run.writes[1].resolve(true)
  await settle()
  assert.equal(run.published.length, 1)
})

test('a pending disk write is neither duplicated nor acknowledged before success', async () => {
  const run = harness()
  run.state.savedProjectRef.current = run.firstProject
  run.state.autoSavePayloadRef.current.filePath = 'D:/virtual/saved.ssproj'
  run.persist()
  run.persist()
  assert.equal(run.writes.length, 1)
  assert.equal(run.acknowledgements.length, 0)
  run.writes[0].resolve(true)
  await settle()
  assert.equal(run.acknowledgements.length, 1)
})

test('a delayed success from a previous document cannot publish or acknowledge the current document', async () => {
  const run = harness()
  run.persist()
  run.state.lastAutoSavePayloadRef.current = undefined
  run.writes[0].resolve(true)
  await settle()
  assert.equal(run.published.length, 0)
  assert.equal(run.acknowledgements.length, 0)
})

test('the untouched template and incomplete initial recovery read never overwrite recovery', () => {
  const run = harness()
  run.state.savedProjectRef.current = run.firstProject
  run.persist()
  assert.equal(run.writes.length, 0)
  run.state.savedProjectRef.current = undefined
  run.state.recoveryReadCompleteRef.current = false
  run.persist()
  assert.equal(run.writes.length, 0)
})

test('unclaimed recovery pauses writes with an actionable status until explicitly resolved', () => {
  const run = harness()
  run.state.autoSaveNoticeRef.current = { project: 'Unclaimed recovery' }
  run.persist()
  assert.equal(run.writes.length, 0)
  assert.equal(run.state.status, 'recoveryPending')
  run.state.autoSaveNoticeRef.current = undefined
  run.persist()
  assert.equal(run.writes.length, 1)
  run.writes[0].resolve(true)
})

test('switching an unsaved project waits for confirmed persistence instead of abandoning a pending write', async () => {
  const run = harness()
  assert.equal(run.checkpoint(), false)
  assert.equal(run.state.status, 'recoveryWritePending')
  run.writes[0].resolve(true)
  await settle()
  assert.equal(run.state.status, 'ready')
  assert.equal(run.checkpoint(), true)
})

test('recovering an older snapshot cannot discard new unsaved edits while autosave is paused', () => {
  const run = harness()
  run.state.autoSaveNoticeRef.current = { project: 'Older snapshot' }
  assert.equal(run.checkpoint('Before recovery', false), false)
  assert.equal(run.state.status, 'recoveryUnsavedCurrent')
  assert.equal(run.writes.length, 0)
})

test('switching a clean startup template does not require an unnecessary recovery write', () => {
  const run = harness()
  run.state.savedProjectRef.current = run.firstProject
  assert.equal(run.checkpoint(), true)
  assert.equal(run.writes.length, 0)
})
