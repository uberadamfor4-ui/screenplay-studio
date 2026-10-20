import { normalizeScriptProject } from '../../src/projectMigration'
import type { MobileRecord } from './storage'

export type RecoveryRecord = MobileRecord & { recoveryPending?: boolean }
const sourceProjects = new WeakMap<RecoveryRecord, unknown>()

function sameSavedProject(left: unknown, right: unknown) {
  const ordered = (_key: string, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : value
  return JSON.stringify(left, ordered) === JSON.stringify(right, ordered)
}

export function parseRecoveryRecord(content: string): RecoveryRecord {
  const value: unknown = JSON.parse(content)
  if (!value || typeof value !== 'object') throw new Error('恢复副本格式无效。本地项目库仍保留。')
  const raw = value as Partial<RecoveryRecord>
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt)) || !Number.isSafeInteger(raw.revision) || raw.revision! < 0 || raw.deletedAt) throw new Error('恢复副本记录无效。本地项目库仍保留。')
  if (raw.recoveryPending !== undefined && typeof raw.recoveryPending !== 'boolean') throw new Error('恢复副本状态无效。本地项目库仍保留。')
  const record = { id: raw.id, updatedAt: raw.updatedAt, revision: raw.revision!, project: normalizeScriptProject(raw.project), recoveryPending: raw.recoveryPending }
  // Migration may generate fresh production sync times; compare the actual saved source instead.
  if (raw.recoveryPending === undefined) sourceProjects.set(record, raw.project)
  return record
}

export function recoveryDisposition(recovery: RecoveryRecord, existing?: MobileRecord): 'ignore' | 'restore' | 'copy' {
  if (!existing) return 'restore'
  if (existing.deletedAt) return 'ignore'
  if (recovery.recoveryPending) return recovery.revision === existing.revision ? 'restore' : 'copy'
  if (recovery.revision > existing.revision) return 'restore'
  if (recovery.revision < existing.revision || recovery.recoveryPending === false) return 'ignore'
  // Legacy rescue files have no pending marker. Keep both versions when their origins are ambiguous.
  return sameSavedProject(sourceProjects.get(recovery) ?? recovery.project, existing.project) ? 'ignore' : 'copy'
}
