import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../mobile/src/MobileApp.tsx', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('MobileApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function selected(names: string[]) {
  const pieces = new Map<string, string>()
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) pieces.set(node.name.text, node.getText(parsed))
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) pieces.set(node.name.text, 'const ' + node.getText(parsed))
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(pieces.size, names.length)
  return ts.transpile(names.map(name => pieces.get(name)).join('\n'), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React })
}
const record = (id: string) => ({ id, project: { title: id, elements: [{ id: id + '-element', text: id }] }, revision: 1 })

test('mobile activation installs the new project before a native recovery failure and keeps active identity consistent', async () => {
  const original = record('A'), target = record('B'), settings = new Map<string, string>(), live = { current: original }, generation = { current: 0 }
  let selectedId = '', status = '', primarySaves = 0
  const state = {
    live, generation, persist: async () => { primarySaves++ }, saveRecord: async (next: typeof target) => ({ ...next, revision: next.revision + 1 }),
    writeSetting: async (key: string, value: string) => { settings.set(key, value) }, install: (next: typeof target) => { live.current = next; generation.current++ },
    saved: {}, setSelected: (id: string) => { selectedId = id }, undoRef: {}, redoRef: {}, setUndo: () => {}, setRedo: () => {}, setPanel: () => {},
    setStatus: (value: string) => { status = value }, compositionHistory: {}, coalesce: {}, nativeAndroid: true,
    LocalDocuments: { saveRecovery: async () => { throw Error('ENOSPC') } }, rescued: {}, recoverySaved: {}, saveError: {}, errorMessage: String,
  }
  const activate = runInNewContext(selected(['activate']) + '\nactivate', state) as (next: typeof target) => Promise<void>
  await assert.rejects(activate(target), /ENOSPC/)
  assert.equal(live.current.id, 'B'); assert.equal(settings.get('active'), 'B'); assert.equal(selectedId, 'B-element'); assert.equal(status, 'failed'); assert.ok(primarySaves >= 2)
  assert.equal(original.project.elements[0].text, 'A')
})

test('mobile composition ending keeps Enter fenced until the pending final input is captured', () => {
  type Node = { type: string; props: Record<string, unknown> & { children: Node[] } }
  const frames: Array<() => void> = [], edits: string[] = []
  let splits = 0
  const state = {
    React: { createElement: (type: string, props: Record<string, unknown>, ...children: Node[]) => ({ type, props: { ...props, children } }) },
    useRef: (current: unknown) => ({ current }), useLayoutEffect: () => {}, requestAnimationFrame: (callback: () => void) => frames.push(callback),
    getFormat: () => ({ elements: { action: { align: 'left' } } }), resolveElementTextStyle: () => ({}), getScreenplayFontStack: () => '', limitElementText: (text: string) => ({ text }),
  }
  const Paragraph = runInNewContext(selected(['Paragraph']) + '\nParagraph', state) as (props: unknown) => Node
  const tree = Paragraph({ element: { id: 'ime', type: 'action', text: '' }, project: {}, onComposition: () => {}, onEdit: (text: string) => edits.push(text), onSplit: () => { splits++ } })
  const input = tree.props.children.find(node => node.type === 'textarea')!.props as Record<string, (...args: unknown[]) => void>
  const enter = () => input.onKeyDown({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, keyCode: 13, nativeEvent: { isComposing: false }, currentTarget: { selectionStart: 1, selectionEnd: 1 }, preventDefault: () => {} })
  input.onCompositionStart(); input.onCompositionEnd({ currentTarget: { value: '中' } }); enter(); assert.equal(splits, 0)
  input.onChange({ target: { value: '完整中文', style: {}, scrollHeight: 30 } }); assert.equal(edits.at(-1), '完整中文')
  frames.forEach(callback => callback()); enter(); assert.equal(splits, 1)
})

test('a rescued marker refers to the exact generation and cannot confirm later edits after primary-only success', async () => {
  const generation = { current: 0 }, live = { current: record('A') }, saved = { current: undefined as number | undefined }, rescued = { current: undefined as number | undefined }
  let failNative = false, recovery: { project: { title: string } } | undefined
  const state = {
    generation, live, saved, rescued, startupUnsafe: { current: false }, nativeAndroid: true, rescuing: {}, saving: {}, recoverySaved: {}, saveError: {},
    useCallback: (fn: unknown) => fn, LocalDocuments: { saveRecovery: async ({ content }: { content: string }) => { if (failNative) throw Error('ENOSPC'); recovery = JSON.parse(content) } },
    saveRecord: async (next: typeof live.current) => ({ ...next, revision: next.revision + 1 }), setStatus: () => {}, setError: () => {}, recordDiagnostic: () => {}, errorMessage: String,
  }
  const funcs = runInNewContext(selected(['rescueCurrent', 'persist']) + '\n({rescueCurrent,persist})', state) as { rescueCurrent: () => Promise<void>; persist: () => Promise<void> }
  await funcs.rescueCurrent(); assert.equal(rescued.current, 0); assert.equal(recovery!.project.title, 'A')
  failNative = true; await assert.rejects(funcs.persist(), /ENOSPC/); assert.equal(saved.current, 0); assert.equal(rescued.current, generation.current)
  generation.current++; live.current = { ...live.current, project: { ...live.current.project, title: '新稿' } }
  assert.notEqual(rescued.current, generation.current); await assert.rejects(funcs.persist(), /ENOSPC/); assert.equal(saved.current, generation.current); assert.notEqual(rescued.current, generation.current)
  assert.equal(recovery!.project.title, 'A')
})

test('a timed-out committed IDB transaction records uncertainty even when abort throws', async () => {
  const storage = readFileSync(new URL('../mobile/src/storage.ts', import.meta.url), 'utf8'), ast = ts.createSourceFile('storage.ts', storage, ts.ScriptTarget.Latest, true)
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['bounded', 'transaction'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n')
  const timers: Array<() => void> = []; let uncertain = false
  const transaction = runInNewContext(ts.transpile(functions, { target: ts.ScriptTarget.ES2022 }) + '\ntransaction', { storageTimeoutMs: 10000, setTimeout: (callback: () => void) => timers.push(callback), clearTimeout: () => {} }) as (tx: unknown, action: () => Promise<string>, uncertain: () => void) => Promise<string>
  const task = transaction({ done: new Promise(() => {}), abort: () => { throw Error('Already committed') } }, async () => 'result', () => { uncertain = true })
  timers[0](); await assert.rejects(task, /响应超时/); assert.equal(uncertain, true)
})
