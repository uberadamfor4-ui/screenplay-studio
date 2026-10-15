import { openDB, type DBSchema } from 'idb'
import type { ScriptProject } from '../../src/types'

export type MobileRecord = { id: string; project: ScriptProject; updatedAt: string; revision: number; deletedAt?: string }
interface Library extends DBSchema {
  projects: { key: string; value: MobileRecord }
  settings: { key: string; value: unknown }
}
const database = () => openDB<Library>('screenplay-mobile-library', 1, {
  upgrade(db) { db.createObjectStore('projects', { keyPath: 'id' }); db.createObjectStore('settings') },
})
const revisions = new Map<string, number>()
let queue: Promise<unknown> = Promise.resolve()

function ordered<T>(action: () => Promise<T>): Promise<T> {
  const task = queue.then(action, action)
  queue = task.catch(() => undefined)
  return task
}

export async function listRecords() {
  const db = await database()
  try { return (await db.getAll('projects')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  finally { db.close() }
}

export async function loadRecord(id: string) {
  const db = await database()
  try { const record = await db.get('projects', id); if (record) revisions.set(id, record.revision); return record }
  finally { db.close() }
}

export function saveRecord(record: MobileRecord) {
  return ordered(async () => {
    const db = await database()
    try {
      const tx = db.transaction(['projects', 'settings'], 'readwrite')
      const existing = await tx.objectStore('projects').get(record.id)
      const expected = revisions.get(record.id)
      if (existing && expected !== existing.revision) { tx.abort(); await tx.done.catch(() => undefined); throw new Error('此项目已被另一窗口修改。请先导出当前副本，再重新打开。') }
      const revision = (existing?.revision ?? 0) + 1
      const next = { ...record, revision }
      await tx.objectStore('projects').put(next)
      if (!next.deletedAt) await tx.objectStore('settings').put(next.id, 'active')
      await tx.done
      revisions.set(next.id, revision)
      return next
    } finally { db.close() }
  })
}

export async function readSetting<T>(key: string): Promise<T | undefined> {
  const db = await database()
  try { return await db.get('settings', key) as T | undefined } finally { db.close() }
}

export async function writeSetting(key: string, value: unknown) {
  const db = await database()
  try { await db.put('settings', value, key) } finally { db.close() }
}

export const newRecord = (project: ScriptProject): MobileRecord => ({ id: crypto.randomUUID(), project, updatedAt: new Date().toISOString(), revision: 0 })
