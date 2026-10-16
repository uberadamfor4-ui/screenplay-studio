import { normalizeScriptProject } from '../../src/projectMigration'
import type { MobileRecord } from './storage'

export type RecoveryRecord = MobileRecord & { recoveryPending?: boolean }

export function parseRecoveryRecord(content: string): RecoveryRecord {
  const value: unknown = JSON.parse(content)
  if (!value || typeof value !== 'object') throw new Error('恢复副本格式无效。本地项目库仍保留。')
  const raw = value as Partial<RecoveryRecord>
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt)) || !Number.isSafeInteger(raw.revision) || raw.revision! < 0 || raw.deletedAt) throw new Error('恢复副本记录无效。本地项目库仍保留。')
  if (raw.recoveryPending !== undefined && typeof raw.recoveryPending !== 'boolean') throw new Error('恢复副本状态无效。本地项目库仍保留。')
  return { id: raw.id, updatedAt: raw.updatedAt, revision: raw.revision!, project: normalizeScriptProject(raw.project), recoveryPending: raw.recoveryPending }
}

export function recoveryDisposition(recovery: RecoveryRecord, existing?: MobileRecord): 'ignore' | 'restore' | 'copy' {
  if (!existing) return 'restore'
  if (existing.deletedAt) return 'ignore'
  if (recovery.recoveryPending) return recovery.revision === existing.revision ? 'restore' : 'copy'
  if (recovery.revision > existing.revision) return 'restore'
  if (recovery.revision < existing.revision || recovery.recoveryPending === false) return 'ignore'
  // Legacy rescue files have no pending marker. Keep both versions when their origins are ambiguous.
  return recovery.updatedAt > existing.updatedAt && JSON.stringify(recovery.project) !== JSON.stringify(normalizeScriptProject(existing.project)) ? 'copy' : 'ignore'
}
