import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
type Timer = { at: number; callback: () => void; delay: number; active: boolean; refresh: () => void; unref: () => void }
type Result = { canceled: boolean; exportToken?: string }
async function sessionHarness(canceled = false) {
  const source = await fs.readFile('electron/main.cjs', 'utf8')
  const start = source.indexOf('function registerIpc() {'), end = source.indexOf('\nfunction normalizeDesktopLocale(', start)
  assert.ok(start >= 0 && end > start)
  const handlers = new Map<string, (event: { sender: { id: number } }, payload: unknown) => Promise<Result>>()
  const timers: Timer[] = [], sessions = new Map(), writes: string[] = []
  let now = 0
  const register = runInNewContext(`(${source.slice(start, end)})`, {
    ipcMain: { handle: (name: string, fn: (event: { sender: { id: number } }, payload: unknown) => Promise<Result>) => handlers.set(name, fn) },
    ...require('../electron/pngExportSafety.cjs'), path, Buffer,
    showOpenDialogFor: async () => ({ canceled, filePaths: canceled ? [] : [path.resolve('tmp', 'synthetic-png-folder')] }),
    readPngExportManifest: async () => ({ version: 1, exports: [] }),
    randomUUID: () => 'synthetic-token', pngExportSessions: sessions, maxPngDataUrlCharacters: 1024,
    atomicWriteFile: async (file: string) => { writes.push(file) },
    setTimeout: (callback: () => void, delay: number) => {
      const timer: Timer = { at: now + delay, callback, delay, active: true, refresh: () => { timer.active = true; timer.at = now + delay }, unref: () => {} }
      timers.push(timer); return timer
    },
    clearTimeout: (timer: Timer) => { timer.active = false },
  })
  register()
  const sender = { sender: { id: 42 } }, run = (name: string, payload: unknown, event = sender) => handlers.get(name)!(event, payload)
  const advance = (ms: number) => { now += ms; for (const timer of timers) if (timer.active && timer.at <= now) { timer.active = false; timer.callback() } }
  return { run, advance, sessions, timers, writes }
}

test('active PNG exports refresh inactivity expiry so a long batch can finish', async () => {
  const h = await sessionHarness(), opened = await h.run('export:choosePngFolder', 'synthetic')
  for (let i = 1; i <= 8; i++) {
    h.advance(10 * 60 * 1000)
    await h.run('export:pngPage', { exportToken: opened.exportToken, page: { name: `Synthetic_${i}.png`, dataUrl: 'data:image/png;base64,aA==' } })
  }
  assert.equal(h.writes.length, 8)
  await h.run('export:finishPng', { exportToken: opened.exportToken, completed: false })
  assert.equal(h.sessions.size, 0); assert.ok(h.timers.every(timer => !timer.active))
})

test('idle or foreign PNG sessions stay bounded and canceled selection creates no session', async () => {
  const canceled = await sessionHarness(true)
  assert.equal((await canceled.run('export:choosePngFolder', 'synthetic')).canceled, true)
  assert.equal(canceled.sessions.size, 0); assert.equal(canceled.timers.length, 0)
  const h = await sessionHarness(), opened = await h.run('export:choosePngFolder', 'synthetic')
  const payload = { exportToken: opened.exportToken, page: { name: 'Synthetic_1.png', dataUrl: 'data:image/png;base64,aA==' } }
  h.advance(20 * 60 * 1000)
  await assert.rejects(h.run('export:pngPage', payload, { sender: { id: 99 } }))
  assert.equal(h.writes.length, 0)
  h.advance(11 * 60 * 1000)
  await assert.rejects(h.run('export:pngPage', payload))
  assert.equal(h.sessions.size, 0)
})
