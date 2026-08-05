import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as ts from 'typescript'

const cssPath = new URL('../src/App.css', import.meta.url)
const appPath = new URL('../src/App.tsx', import.meta.url)
const productionCssPath = new URL('../src/ProductionWorkspace.css', import.meta.url)
const productionPath = new URL('../src/ProductionWorkspace.tsx', import.meta.url)

test('scaled screenplay previews keep real layout space', async () => {
  const css = await readFile(cssPath, 'utf8')

  assert.match(css, /\.script-page\s*\{[^}]*zoom:\s*0\.34/s)
  assert.match(css, /\.format-preview-dialog \.script-page\s*\{[^}]*zoom:\s*0\.28/s)
  assert.doesNotMatch(css, /\.script-page\s*\{[^}]*margin-bottom:\s*-/s)
})

test('tutorial center uses one bounded content layout', async () => {
  const css = await readFile(cssPath, 'utf8')

  assert.match(css, /\.tutorial-dialog \.tool-dialog-body\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.tutorial-center\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s)
  assert.match(css, /\.tutorial-nav\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s)
  assert.match(css, /\.tutorial-article\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s)
})

test('modal backdrops stay above floating menus', async () => {
  const css = await readFile(cssPath, 'utf8')
  const toolbarLayer = Number(css.match(/\.advanced-toolbar\s*\{[^}]*z-index:\s*(\d+)/s)?.[1])
  const modalLayer = Number(css.match(/\.preferences-backdrop\s*\{[^}]*z-index:\s*(\d+)/s)?.[1])

  assert.ok(modalLayer > toolbarLayer)
})

test('long dialogs keep their headers visible and suspend background shortcuts', async () => {
  const [css, app] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(appPath, 'utf8'),
  ])

  assert.match(css, /\.assistive-dialog > header,[\s\S]*position:\s*sticky/)
  assert.match(app, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/)
  assert.match(app, /event\.key === 'Tab'/)
})

test('collapsed production navigation and tables remain usable', async () => {
  const [css, source] = await Promise.all([
    readFile(productionCssPath, 'utf8'),
    readFile(productionPath, 'utf8'),
  ])

  assert.match(source, /aria-label=\{item\.label\} title=\{item\.label\}/)
  assert.match(source, /这个场次还没有镜头/)
  assert.match(css, /\.data-table\s*\{[^}]*overflow-x:\s*auto/s)
  assert.match(css, /\.data-table > \.table-head,[\s\S]*min-width:\s*720px/)
})

test('long-script editing avoids repeated baseline parsing and quadratic row numbering', async () => {
  const app = await readFile(appPath, 'utf8')

  assert.match(app, /revisionCompareOpen \? buildRevisionDiffs\(project, revisionSnapshot\) : \[\]/)
  assert.match(app, /revisionMode \? getRevisionStates\(project, revisionSnapshot\)/)
  assert.doesNotMatch(app, /project\.elements\.indexOf\(element\)/)
  assert.match(app, /onChange=\{props\.onChange\}/)
  assert.doesNotMatch(app, /onChange=\{\(event\) => \{\s*resizeEditorTextarea\(event\.currentTarget\)/)
  assert.match(app, /supportsNativeTextareaFieldSizing\(\)/)
  assert.match(app, /function AutoSaveStatus/)
  assert.doesNotMatch(app, /const \[lastAutoSavedAt, setLastAutoSavedAt\]/)
})

test('live text fields use current state and bound oversized editor input before layout', async () => {
  const app = await readFile(appPath, 'utf8')

  assert.match(app, /productionStage && project\.production\s*\?\s*project\.production/s)
  assert.match(app, /maxLength=\{projectDataLimits\.maxElementTextCharacters\}/)
  assert.match(app, /performNativeEdit\(nativeCommand\)/)
  assert.match(app, /current\.elements\.filter\(\(element\) => element\.id !== elementId\)/)
})

test('clearing the project font-size field cannot create a zero-line-height layout', async () => {
  const app = await readFile(appPath, 'utf8')

  assert.match(app, /function updateProjectFontSize\(value: string\)/u)
  assert.match(app, /if \(!value\.trim\(\)\) return/u)
  assert.match(app, /Math\.min\(24, Math\.max\(8, Math\.round\(size\)\)\)/u)
  assert.doesNotMatch(app, /updateProject\(\{ fontSize: Number\(event\.target\.value\) \}\)/u)
})

test('project state updaters remain replay-safe and file dialogs share one operation gate', async () => {
  const app = await readFile(appPath, 'utf8')
  const sourceFile = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings: Array<{ line: number; operation: string }> = []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'setProject') {
      const updater = node.arguments[0]
      if (updater && (ts.isArrowFunction(updater) || ts.isFunctionExpression(updater))) {
        const inspectUpdater = (child: ts.Node) => {
          if (child !== updater && ts.isCallExpression(child)) {
            const operation = child.expression.getText(sourceFile)
            if (/^set[A-Z]/u.test(operation) || ['createElement', 'createLocalId', 'removeIdsFromSelection'].includes(operation)) {
              const position = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile))
              findings.push({ line: position.line + 1, operation })
            }
          }
          if (
            child !== updater
            && ts.isBinaryExpression(child)
            && child.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && child.left.getText(sourceFile).includes('.current')
          ) {
            const position = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile))
            findings.push({ line: position.line + 1, operation: child.left.getText(sourceFile) })
          }
          ts.forEachChild(child, inspectUpdater)
        }
        inspectUpdater(updater.body)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  assert.deepEqual(findings, [])
  assert.match(app, /const fileOperationInProgressRef = useRef\(false\)/)
  assert.match(app, /function beginFileOperation\(\)/)
  assert.doesNotMatch(app, /saveInProgressRef|exportInProgressRef/)
})

test('closing dialogs and returning to the app restore the selected screenplay editor', async () => {
  const app = await readFile(appPath, 'utf8')

  assert.match(app, /if \(!returnFocus\) return/)
  assert.match(app, /buildDataElementSelector\('textarea', selectedId\)/)
  assert.match(app, /window\.addEventListener\('focus', restoreEditorAfterWindowFocus\)/)
  assert.match(app, /composingElementIdsRef\.current\.clear\(\)/)
  assert.match(app, /if \(isEditableShortcutTarget\(active\)\) return/)
  assert.doesNotMatch(app, /\.more-command, \.editor-row textarea/)
})

test('closing with unsaved edits leaves the newest recovery snapshot discoverable', async () => {
  const app = await readFile(appPath, 'utf8')

  assert.match(app, /const savedProjectRef = useRef<ScriptProject \| undefined>\(project\)/)
  assert.match(app, /window\.addEventListener\('beforeunload', flush\)/)
  assert.doesNotMatch(app, /beforeunload', flushAndAcknowledge/)
  assert.match(app, /if \(projectIsClean\) acknowledgeAutoSave\(snapshot\.savedAt\)/)
  assert.match(app, /clearAutoSaveAcknowledgement\(\)\s*persistAutoSaveSnapshot\(\)/)
  assert.match(app, /return parsed\s*\.slice\(0, 30\)\s*\.filter\(/u)
})
