import { openDB, unwrap, type DBSchema } from 'idb'
import type { ScriptProject } from '../../src/types'

export type MobileRecord = { id: string; project: ScriptProject; updatedAt: string; revision: number; deletedAt?: string }
interface Library extends DBSchema {
  projects: { key: string; value: MobileRecord }
  settings: { key: string; value: unknown }
}
const storageTimeoutMs = 10_000
function bounded<T>(task: Promise<T>, cancel: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cancel(); reject(new Error('本机存储响应超时，原稿仍保留。请稍后重试或导出 SSProj 备份。')) }, storageTimeoutMs)
    task.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
function database() {
  let expired = false
  const pending = openDB<Library>('screenplay-mobile-library', 1, {
    upgrade(db) { db.createObjectStore('projects', { keyPath: 'id' }); db.createObjectStore('settings') },
  })
  // An expired open must never start a stale write when the platform eventually resumes it.
  void pending.then(db => { if (expired) db.close() }, () => undefined)
  return bounded(pending, () => {
    expired = true
    const request = unwrap(pending)
    if (request.readyState === 'done' && !request.error) request.result.close()
  })
}
function transaction<T>(tx: { done: Promise<void>; abort(): void }, action: () => Promise<T>, uncertain?: () => void) {
  const done = tx.done
  void done.catch(() => undefined)
  return bounded((async () => { const result = await action(); await done; return result })(), () => { try { tx.abort() } catch { uncertain?.() } })
}
// Only this writer's acknowledged commits may advance an older in-flight snapshot.
// Reading another version must never grant a stale editor permission to overwrite it.
const committedRevisions = new Map<string, number>()
let uncertainWrite: MobileRecord | undefined
let queue: Promise<unknown> = Promise.resolve()

function ordered<T>(action: () => Promise<T>): Promise<T> {
  const task = queue.then(action, action)
  queue = task.catch(() => undefined)
  return task
}

export async function listRecords() {
  const db = await database()
  try { const tx = db.transaction('projects'); return (await transaction(tx, () => tx.store.getAll())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  finally { db.close() }
}

export async function loadRecord(id: string) {
  const db = await database()
  try { const tx = db.transaction('projects'); return await transaction(tx, () => tx.store.get(id)) }
  finally { db.close() }
}

export function saveRecord(record: MobileRecord) {
  return ordered(async () => {
    const db = await database()
    try {
      const tx = db.transaction(['projects', 'settings'], 'readwrite')
      let attempted: MobileRecord | undefined
      const next = await transaction(tx, async () => {
        const existing = await tx.objectStore('projects').get(record.id)
        const expected = Math.max(record.revision, committedRevisions.get(record.id) ?? 0)
        if (existing && expected !== existing.revision) {
          const uncertain = uncertainWrite
          // A committed write can lose its completion callback. Read back the exact attempted snapshot before retrying.
          if (!uncertain || uncertain.id !== existing.id || uncertain.revision !== existing.revision || uncertain.updatedAt !== existing.updatedAt || uncertain.deletedAt !== existing.deletedAt || JSON.stringify(uncertain.project) !== JSON.stringify(existing.project)) { tx.abort(); throw new Error('此项目已被另一窗口修改。请先导出当前副本，再重新打开。') }
        }
        const next = { ...record, revision: (existing?.revision ?? 0) + 1 }
        attempted = next
        await tx.objectStore('projects').put(next)
        if (!next.deletedAt) await tx.objectStore('settings').put(next.id, 'active')
        return next
      }, () => { if (attempted) uncertainWrite = attempted })
      committedRevisions.set(next.id, next.revision)
      if (uncertainWrite?.id === next.id) uncertainWrite = undefined
      return next
    } finally { db.close() }
  })
}

export async function readSetting<T>(key: string): Promise<T | undefined> {
  const db = await database()
  try { const tx = db.transaction('settings'); return await transaction(tx, () => tx.store.get(key)) as T | undefined } finally { db.close() }
}

export async function writeSetting(key: string, value: unknown) {
  const db = await database()
  try { const tx = db.transaction('settings', 'readwrite'); await transaction(tx, () => tx.store.put(value, key)) } finally { db.close() }
}

export const newRecord = (project: ScriptProject): MobileRecord => ({ id: globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`, project, updatedAt: new Date().toISOString(), revision: 0 })
