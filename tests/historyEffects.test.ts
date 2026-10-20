import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createDefaultProject } from '../src/sample'
import type { ScriptProject } from '../src/types'
import { beginCompositionHistory, resolveCompositionHistory, type CompositionHistory } from '../src/compositionHistory'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const refNames = ['lastProjectRef', 'saveNormalizationRef', 'applyingHistoryRef', 'documentGenerationRef', 'compositionHistoryRef', 'composingElementIdsRef', 'compositionEndAtRef', 'undoStackRef', 'redoStackRef', 'historyGroupRef', 'recoveredMediaBaseRef', 'lastAutoSavePayloadRef', 'savedProjectRef']
const refs = new Map<string, string>(), functions: string[] = []
let effect = ''
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && refNames.includes(node.name.text) && node.initializer) refs.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(parsed)}`)
  if (ts.isFunctionDeclaration(node) && ['saveProject', 'undoProject', 'redoProject', 'resetHistory'].includes(node.name?.text ?? '')) functions.push(node.getText(parsed))
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect' && node.arguments[0]?.getText(parsed).includes('const previous = lastProjectRef.current')) effect = node.arguments[0].getText(parsed)
  ts.forEachChild(node, visit)
}
visit(parsed)
assert.equal(refs.size, refNames.length)
assert.equal(functions.length, 4)
assert.ok(effect)
const compiled = ts.transpile([...refs.values(), ...functions, `const runHistoryEffect = ${effect}`].join('\n'), { target: ts.ScriptTarget.ES2022 })

function harness(first = createDefaultProject()) {
  const queued: ScriptProject[] = []
  let projection = 0
  const state = {
    project: first, filePath: 'qa.ssproj', historyDocumentGeneration: 0,
    autoSavePayloadRef: { current: { project: first, filePath: 'qa.ssproj' } },
    useRef: (current: unknown) => ({ current }),
    window: { screenplay: { saveTextFile: async () => ({ canceled: false, filePath: 'qa.ssproj' }) } },
    synchronizeProductionData: () => ({ qaProjection: ++projection }),
    serializeProjectForSave: JSON.stringify,
    safeFileName: (value: string) => value,
    beginFileOperation: () => true,
    endFileOperation: () => {},
    recordDiagnostic: () => {},
    persistAutoSaveSnapshot: () => {},
    publishAutoSaveTimestamp: () => {},
    setPrimarySaveState: () => {}, setWritingTools: () => {}, setHistoryVersion: () => {},
    setSelectedElementIds: () => {}, setSelectedId: () => {}, setFilePath: () => {}, setStatusKey: () => {},
    resolveCompositionHistory,
    detectTypingElementChange: () => undefined,
    setProject: (next: ScriptProject | ((current: ScriptProject) => ScriptProject)) => { queued.push(typeof next === 'function' ? next(queued.at(-1) ?? state.project) : next) },
  }
  const api = runInNewContext(`${compiled}\n({effect:runHistoryEffect,save:saveProject,undo:undoProject,redo:redoProject,reset:resetHistory,refs:{undo:undoStackRef,redo:redoStackRef,last:lastProjectRef,generation:documentGenerationRef,composition:compositionHistoryRef}})`, state) as {
    effect: () => void; save: () => Promise<void>; undo: () => void; redo: () => void; reset: (project: ScriptProject) => void
    refs: { undo: {current: ScriptProject[]}; redo: {current: ScriptProject[]}; last: {current: ScriptProject}; generation: {current: number}; composition: {current: CompositionHistory | undefined} }
  }
  const take = () => { const next = queued.shift(); assert.ok(next); return next }
  const render = (next: ScriptProject) => { state.project = next; state.autoSavePayloadRef.current.project = next }
  const flush = (captured: ScriptProject, generation = api.refs.generation.current) => {
    const current = state.project
    state.project = captured; state.historyDocumentGeneration = generation
    api.effect(); state.project = current
  }
  return { ...api, state, take, render, flush }
}

test('overlapping save projections preserve redo and do not add invisible undo entries', async () => {
  const run = harness(), redo = createDefaultProject()
  run.refs.redo.current = [redo]
  await run.save(); const first = run.take(); run.render(first)
  await run.save(); const second = run.take()
  run.flush(first); run.render(second); run.flush(second)
  assert.equal(run.refs.undo.current.length, 0)
  assert.equal(run.refs.redo.current[0], redo)
})

test('a pending save effect cannot consume the identity of an incoming undo', async () => {
  const original = createDefaultProject(), edited = { ...original, title: 'Edited' }, run = harness(edited)
  run.refs.undo.current = [original]
  await run.save(); const saved = run.take(); run.render(saved)
  run.undo(); const undone = run.take()
  run.flush(saved); run.render(undone); run.flush(undone)
  assert.equal(run.refs.undo.current.length, 0)
  assert.equal(run.refs.redo.current[0], saved)
})

test('a pending save effect cannot turn redo into another editing transaction', async () => {
  const original = createDefaultProject(), edited = { ...original, title: 'Edited' }, run = harness(original)
  run.refs.redo.current = [edited]
  await run.save(); const saved = run.take(); run.render(saved)
  run.redo(); const redone = run.take()
  run.flush(saved); run.render(redone); run.flush(redone)
  assert.equal(run.refs.undo.current.length, 1)
  assert.equal(run.refs.undo.current[0], saved)
  assert.equal(run.refs.redo.current.length, 0)
})

test('a previous document passive effect cannot enter the newly opened document history', async () => {
  const run = harness(), next = { ...createDefaultProject(), title: 'Independent next document' }
  await run.save(); const saved = run.take(); run.render(saved)
  run.reset(next); run.render(next)
  run.flush(saved, 0); run.flush(next, 1)
  assert.equal(run.refs.undo.current.length, 0)
  assert.equal(run.refs.redo.current.length, 0)
  assert.equal(run.refs.last.current, next)
})

test('a real edit after a skipped normalization still creates exactly one ordinary undo step', async () => {
  const run = harness()
  await run.save(); const saved = run.take(); run.render(saved); run.flush(saved)
  const edited = { ...saved, title: 'Real title edit' }
  run.render(edited); run.flush(edited)
  assert.equal(run.refs.undo.current.length, 1)
  assert.equal(run.refs.undo.current[0], saved)
  assert.equal(run.refs.redo.current.length, 0)
})

test('a save projection rebases a composition that began from its exact source snapshot', async () => {
  const original = createDefaultProject(), run = harness(original)
  await run.save(); const saved = run.take()
  run.refs.composition.current = beginCompositionHistory(original, original.elements[0].id, [], [])
  run.render(saved); run.flush(saved)
  assert.equal(run.refs.composition.current?.before, saved)
  const typed = { ...saved, elements: saved.elements.map((element, index) => index ? element : { ...element, text: '中文候选词……' }) }
  run.render(typed); run.flush(typed)
  assert.equal(run.refs.undo.current.length, 1)
  assert.equal(run.refs.undo.current[0], saved)
})

test('a late save effect leaves a newer composition started from the saved snapshot intact', async () => {
  const run = harness()
  await run.save(); const saved = run.take(); run.render(saved)
  const transaction = beginCompositionHistory(saved, saved.elements[0].id, [], [])
  run.refs.composition.current = transaction; run.flush(saved)
  assert.equal(run.refs.composition.current, transaction)
})

test('old save and undo effects cannot clear a composition started after the undo is visible', async () => {
  const original = createDefaultProject(), edited = { ...original, title: 'Edited' }, run = harness(edited)
  run.refs.undo.current = [original]
  await run.save(); const saved = run.take(); run.render(saved)
  run.undo(); const undone = run.take(); run.render(undone)
  const transaction = beginCompositionHistory(undone, undone.elements[0].id, [], [...run.refs.redo.current])
  run.refs.composition.current = transaction
  run.flush(saved); run.flush(undone)
  assert.equal(run.refs.composition.current, transaction)
})

test('revisiting the same immutable history snapshot before passive effects settle does not consume redo', () => {
  const original = createDefaultProject(), edited = { ...original, title: 'Edited' }, run = harness(edited)
  run.refs.undo.current = [original]
  run.undo(); const first = run.take(); run.render(first)
  run.redo(); const second = run.take(); run.render(second)
  run.undo(); const third = run.take(); run.render(third)
  run.flush(first); run.flush(second); run.flush(third)
  assert.equal(run.refs.undo.current.length, 0)
  assert.equal(run.refs.redo.current.length, 1)
  assert.equal(run.refs.redo.current[0], edited)
})
