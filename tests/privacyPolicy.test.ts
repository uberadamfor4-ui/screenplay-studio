import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { policyText, privacyPolicyIntro, privacyPolicySections, privacyPolicyUrl, publicSupportEmail } from '../src/privacyPolicy'

const source = await fs.readFile('electron/main.cjs', 'utf8')
const tree = ts.createSourceFile('main.cjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const functions = ['registerIpc', 'installApplicationMenu']
  .map(name => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)?.getText(tree)).join('\n')
const labelsNode = tree.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(tree) === 'desktopMenuLabels')
assert.ok(labelsNode?.initializer)
const labels = runInNewContext(`(${labelsNode.initializer.getText(tree)})`)

function bridge(open: (url: string) => Promise<void>) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<void>>()
  let template: { label: string; submenu: { label: string; click?: () => void }[] }[] = []
  const api = runInNewContext(`${functions}\n({registerIpc,installApplicationMenu})`, {
    ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<void>) => handlers.set(key, handler) },
    shell: { openExternal: open }, desktopMenuLabels: labels, normalizeDesktopLocale: (locale: string) => locale,
    isMac: true, isDev: false, DEVELOPER_CREDIT: 'Synthetic credit',
    Menu: { buildFromTemplate: (value: typeof template) => { template = value; return value }, setApplicationMenu() {} },
  })
  api.registerIpc()
  return { handlers, api, template: () => template }
}

test('all policy languages have complete sections, contact and finite feedback retention', () => {
  assert.equal(privacyPolicySections.length, 9)
  assert.equal(new Set(privacyPolicySections.map(section => section.id)).size, 9)
  for (const locale of ['zh-CN', 'en-US', 'zh-TW'] as const) {
    const paragraphs = privacyPolicySections.flatMap(section => section.paragraphs.map(p => policyText(locale, p)))
    assert.equal(paragraphs.length, 23)
    assert.ok(paragraphs.every(p => p.trim().length > 0))
    assert.ok(paragraphs.some(p => p.includes(publicSupportEmail)))
    assert.ok(paragraphs.some(p => /90/.test(p)))
    assert.ok(policyText(locale, privacyPolicyIntro).includes('Mac'))
    assert.doesNotMatch(paragraphs.join('\n'), /(?:[A-Z]:\\|\/Users\/)/)
  }
})

test('privacy browser IPC ignores renderer-provided URLs and opens only the approved policy', async () => {
  const opened: string[] = []
  const b = bridge(async url => { opened.push(url) })
  assert.deepEqual(opened, [], 'registering the app must not launch a browser')
  for (const input of ['https://example.com', 'file:///private/test', 'javascript:alert(1)', { url: 'https://example.com' }]) {
    await b.handlers.get('help:openPrivacyPolicy')!({}, input)
  }
  assert.deepEqual(opened, Array(4).fill(privacyPolicyUrl))
})

test('browser failure propagates so the interface cannot report a successful open', async () => {
  const b = bridge(async () => { throw new Error('Synthetic browser failure') })
  await assert.rejects(b.handlers.get('help:openPrivacyPolicy')!({}), /Synthetic browser failure/)
})

test('preload policy method forwards no URL, project, or other renderer argument', async () => {
  const calls: unknown[][] = []
  let exposed: { openPrivacyPolicy: (...args: unknown[]) => Promise<void> } | undefined
  runInNewContext(await fs.readFile('electron/preload.cjs', 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_key: string, value: typeof exposed) => { exposed = value } }, ipcRenderer: { invoke: async (...args: unknown[]) => { calls.push(args) } } }),
  })
  await exposed!.openPrivacyPolicy('https://example.com', 'synthetic script')
  assert.deepEqual(calls, [['help:openPrivacyPolicy']])
})

test('the real native Help menu exposes the localized offline policy command', () => {
  for (const [locale, title] of [['zh-CN', '隐私政策'], ['en-US', 'Privacy Policy'], ['zh-TW', '隱私政策']]) {
    const sent: unknown[][] = []
    const b = bridge(async () => { assert.fail('Native policy command must not open the browser automatically') })
    b.api.installApplicationMenu({ isDestroyed: () => false, webContents: { send: (...args: unknown[]) => sent.push(args) } }, locale)
    const item = b.template().flatMap(menu => menu.submenu).find(item => item.label === title)
    assert.ok(item?.click)
    item.click()
    assert.deepEqual(sent, [['menu:command', 'openPrivacyPolicy']])
  }
})
