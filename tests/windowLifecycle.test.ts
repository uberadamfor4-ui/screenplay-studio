import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const mainFile = path.resolve('electron/main.cjs')
const source = await fs.readFile(process.env.SCREENPLAY_WINDOW_TEST_SOURCE || mainFile, 'utf8')
type Item = { id?: string; label?: string; role?: string | null; enabled?: boolean; click?: () => void; submenu?: Item[] }

function fixture(platform = 'darwin') {
  let ready = false, hidden = false, quitCalls = 0, template: Item[] = []
  const callbacks: (() => void)[] = [], windows: MockWindow[] = []
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const registrations = new Map<string, number>()
  const aboutCalls: unknown[][] = []
  const app = Object.assign(new EventEmitter(), {
    setName() {}, requestSingleInstanceLock: () => true, isPackaged: false,
    isReady: () => ready, whenReady: () => ({ then: (callback: () => void) => callbacks.push(callback) }),
    isHidden: () => hidden, show: () => { hidden = false }, quit: () => { quitCalls++ },
  })
  class MockWindow extends EventEmitter {
    static getAllWindows() { return windows.filter(window => !window.dead) }
    static fromWebContents(contents: unknown) { return windows.find(window => window.webContents === contents && !window.dead) }
    dead = false
    visible = true
    minimized = false
    focused = false
    closeBlocked = false
    loaded = 0
    draft = ''
    primary: boolean
    sent: unknown[][] = []
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler() {}, send: (...args: unknown[]) => this.sent.push(args),
    })
    constructor(options: { show?: boolean; webPreferences?: { preload?: string } }) {
      super()
      this.visible = options.show !== false
      this.primary = Boolean(options.webPreferences?.preload)
      windows.push(this)
    }
    isDestroyed() { return this.dead }
    isMinimized() { return this.minimized }
    restore() { this.minimized = false }
    show() { this.visible = true }
    focus() { this.focused = true }
    setTitle() {}
    loadFile() { this.loaded++; return Promise.resolve() }
    loadURL() { this.loaded++; return Promise.resolve() }
    close() {
      if (this.closeBlocked) return
      this.dead = true
      this.emit('closed')
      if (!MockWindow.getAllWindows().length) app.emit('window-all-closed')
    }
  }
  const nativeItems = (items: Item[]): Item[] => items.map(item => ({ ...item, role: item.role ?? null, ...(item.submenu ? { submenu: nativeItems(item.submenu) } : {}) }))
  const electron = {
    app, BrowserWindow: MockWindow,
    Menu: { buildFromTemplate: nativeItems, setApplicationMenu: (value: Item[]) => { template = value } },
    dialog: { showErrorBox() {}, showMessageBox: (...args: unknown[]) => { aboutCalls.push(args); return Promise.resolve({ response: 0 }) } }, shell: {},
    ipcMain: { handle: (key: string, handler: (...args: unknown[]) => unknown) => {
      registrations.set(key, (registrations.get(key) || 0) + 1)
      assert.ok(!handlers.has(key), `Duplicate IPC: ${key}`)
      handlers.set(key, handler)
    } },
  }
  runInNewContext(source, {
    require: (name: string) => name === 'electron' ? electron : require(name.startsWith('./') ? path.resolve(path.dirname(mainFile), name) : name),
    __dirname: path.dirname(mainFile), process: { platform, env: {}, argv: ['synthetic', 'app'], cwd: () => process.cwd() },
    setTimeout, clearTimeout, Buffer, console,
  })
  const flatten = (items: Item[]): Item[] => items.flatMap(item => [item, ...flatten(item.submenu || [])])
  const item = () => flatten(template).find(item => item.id === 'show-main-window')
  return {
    app, windows, handlers, registrations, item, aboutCalls,
    items: () => flatten(template),
    main: () => windows.findLast(window => window.primary && !window.dead)!,
    primaryCount: () => windows.filter(window => window.primary).length,
    auxiliary: () => new MockWindow({ show: false }),
    start: () => { ready = true; callbacks.forEach(callback => callback()) },
    hideApp: () => { hidden = true }, isAppHidden: () => hidden,
    quitCalls: () => quitCalls,
  }
}

test('Mac Window menu reopens the editor in all three locales without forcing quit', () => {
  for (const [locale, label] of [['zh-CN', '显示主窗口'], ['en-US', 'Show Main Window'], ['zh-TW', '顯示主視窗']]) {
    const f = fixture(); f.start()
    const original = f.main()
    f.handlers.get('system:setUiLocale')!({ sender: original.webContents }, locale)
    assert.equal(f.item()?.label, label)
    assert.ok(f.item()?.click)
    assert.equal(f.item()?.role, null, 'The native empty-role value must not become an action role')
    original.close()
    const menu = f.item()!
    assert.notEqual(menu.enabled, false, 'Reopening must remain available without a focused window')
    menu.click!()
    assert.equal(f.primaryCount(), 2)
    assert.equal(f.main().visible, true)
    assert.equal(f.main().focused, true)
    assert.equal(f.item()?.label, label)
    assert.equal(f.quitCalls(), 0)
  }
})

test('activate restores minimized and hidden editor windows without reloading their draft', () => {
  const f = fixture(); f.start()
  const original = f.main(); original.draft = 'Synthetic unsaved draft'; original.minimized = true; original.visible = false
  f.hideApp(); f.app.emit('activate')
  assert.equal(f.main(), original)
  assert.equal(original.minimized, false)
  assert.equal(original.visible, true)
  assert.equal(original.focused, true)
  assert.equal(f.isAppHidden(), false)
  assert.equal(original.loaded, 1)
  assert.equal(original.draft, 'Synthetic unsaved draft')
})

test('an auxiliary PDF window cannot block main-window creation on activate', () => {
  const f = fixture(); f.start()
  const auxiliary = f.auxiliary(); f.main().close()
  f.app.emit('activate')
  assert.equal(f.primaryCount(), 2)
  assert.equal(f.main().visible, true)
  assert.equal(auxiliary.visible, false)
  assert.equal(auxiliary.focused, false)
})

test('second-instance restoration never promotes an auxiliary PDF window to the editor', () => {
  const f = fixture(); f.start()
  const auxiliary = f.auxiliary(); f.main().close()
  f.app.emit('second-instance', {}, [], process.cwd())
  assert.equal(f.primaryCount(), 2)
  assert.equal(f.main().focused, true)
  assert.equal(auxiliary.visible, false)
})

test('a canceled close retains the original window and unsaved draft on repeated reopen', () => {
  const f = fixture(); f.start()
  const original = f.main(); original.closeBlocked = true; original.draft = 'Keep pending edits'
  assert.ok(f.item()?.click)
  original.close()
  for (let i = 0; i < 20; i++) { f.item()!.click!(); f.app.emit('activate') }
  assert.equal(f.main(), original)
  assert.equal(f.primaryCount(), 1)
  assert.equal(original.draft, 'Keep pending edits')
  assert.equal(original.loaded, 1)
  assert.equal(original.listenerCount('close'), 0, 'Main-process reopen logic must not bypass the normal close path')
})

test('twenty close/reopen cycles do not register IPC or application events again', () => {
  const f = fixture(); f.start()
  const registered = f.handlers.size
  assert.ok(f.item()?.click)
  for (let i = 0; i < 20; i++) {
    f.main().close()
    f.item()!.click!()
    f.app.emit('activate')
    f.app.emit('second-instance', {}, [], process.cwd())
    assert.equal(f.windows.filter(window => window.primary && !window.dead).length, 1)
    assert.equal(f.main().webContents.listenerCount('before-input-event'), 1)
    assert.equal(f.main().webContents.listenerCount('will-navigate'), 1)
  }
  assert.equal(f.handlers.size, registered)
  assert.ok([...f.registrations.values()].every(count => count === 1))
  assert.equal(f.app.listenerCount('activate'), 1)
  assert.equal(f.app.listenerCount('second-instance'), 1)
  assert.equal(f.app.listenerCount('open-file'), 1)
  assert.equal(f.quitCalls(), 0)
})

test('Finder open-file restores a closed editor but early open events do not create before ready', () => {
  const f = fixture(); let prevented = false
  const event = { preventDefault: () => { prevented = true } }
  f.app.emit('open-file', event, path.resolve('tmp/synthetic-first.ssproj'))
  assert.equal(prevented, true)
  assert.equal(f.primaryCount(), 0)
  f.start(); f.main().close()
  f.app.emit('open-file', event, path.resolve('tmp/synthetic-next.ssproj'))
  assert.equal(f.primaryCount(), 2)
  assert.equal(f.main().focused, true)
})

test('Windows keeps its existing last-window quit behavior and menu surface', () => {
  const f = fixture('win32'); f.start()
  assert.equal(f.item(), undefined)
  f.main().close()
  assert.equal(f.quitCalls(), 1)
})

test('About uses the live parent, then a parentless dialog after the primary window closes', () => {
  const f = fixture(); f.start()
  const window = f.main()
  f.items().find(item => item.label === '关于剧本工坊')!.click!()
  assert.equal(f.aboutCalls[0][0], window)
  window.close()
  f.items().find(item => item.label === '关于剧本工坊')!.click!()
  assert.equal(f.aboutCalls[1].length, 1)
  assert.equal((f.aboutCalls[1][0] as { message: string }).message, '剧本工坊')
  assert.equal(f.primaryCount(), 1, 'About without a window must not create an unrelated editor')
})

test('renderer-only menu commands disable without a primary window and reenable on reopening', () => {
  const f = fixture(); f.start()
  const labels = ['新建剧本', '打开剧本...', '保存', '偏好设置...', '隐私政策']
  for (const label of labels) assert.equal(f.items().find(item => item.label === label)?.enabled, true)
  const original = f.main(); original.close()
  for (const label of labels) {
    const item = f.items().find(item => item.label === label)!
    assert.equal(item.enabled, false)
    item.click!()
  }
  assert.equal(original.sent.length, 0)
  assert.notEqual(f.item()?.enabled, false)
  f.item()!.click!()
  for (const label of labels) assert.equal(f.items().find(item => item.label === label)?.enabled, true)
  f.items().find(item => item.label === '保存')!.click!()
  assert.deepEqual(f.main().sent, [['menu:command', 'saveProject']])
})
