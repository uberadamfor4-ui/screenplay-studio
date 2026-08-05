import { projectDataLimits } from './dataLimits'
import type { ScriptProject, VersionSnapshot } from './types'

const encoder = new TextEncoder()
const historySafetyReserveBytes = 256 * 1024
const maxPrettySerializationBytes = 8 * 1024 * 1024

export function serializeProjectForSave(
  project: ScriptProject,
  maxBytes = projectDataLimits.maxProjectFileBytes,
) {
  const compactBytes = measureJsonByteLength(project, maxBytes)
  if (compactBytes > maxBytes) {
    throw new Error('项目内容超过 32 MB，无法生成可重新打开的项目文件；请删除部分历史版本或拆分项目。')
  }

  if (compactBytes <= Math.min(maxBytes, maxPrettySerializationBytes)) {
    const pretty = JSON.stringify(project, null, 2)
    if (encodedBytes(pretty) <= maxBytes) return pretty
  }

  const compact = JSON.stringify(project)
  if (encodedBytes(compact) <= maxBytes) return compact
  throw new Error('项目内容超过 32 MB，无法生成可重新打开的项目文件；请删除部分历史版本或拆分项目。')
}

export function limitVersionHistoryForProject(
  project: ScriptProject,
  snapshots: VersionSnapshot[],
  maxSnapshots = 40,
  maxBytes = projectDataLimits.maxProjectFileBytes,
) {
  const candidates = snapshots.slice(0, maxSnapshots)
  const effectiveLimit = Math.max(0, maxBytes - Math.min(historySafetyReserveBytes, Math.floor(maxBytes * 0.05)))
  const emptyHistoryBytes = measureJsonByteLength({ ...project, versionHistory: [] }, effectiveLimit)
  if (emptyHistoryBytes > effectiveLimit) return []

  const retained: VersionSnapshot[] = []
  let totalBytes = emptyHistoryBytes
  for (const snapshot of candidates) {
    const separatorBytes = retained.length > 0 ? 1 : 0
    const remainingBytes = effectiveLimit - totalBytes - separatorBytes
    const snapshotBytes = measureJsonByteLength(snapshot, Math.max(0, remainingBytes))
    if (totalBytes + snapshotBytes + separatorBytes > effectiveLimit) break
    retained.push(snapshot)
    totalBytes += snapshotBytes + separatorBytes
  }
  return retained
}

export function limitStandaloneVersionSnapshots(
  snapshots: VersionSnapshot[],
  maxSnapshots = 30,
  maxBytes = 4 * 1024 * 1024,
) {
  const retained: VersionSnapshot[] = []
  let totalBytes = 2
  for (const snapshot of snapshots.slice(0, maxSnapshots)) {
    const separatorBytes = retained.length > 0 ? 1 : 0
    const remainingBytes = maxBytes - totalBytes - separatorBytes
    const snapshotBytes = measureJsonByteLength(snapshot, Math.max(0, remainingBytes))
    if (totalBytes + snapshotBytes + separatorBytes > maxBytes) break
    retained.push(snapshot)
    totalBytes += snapshotBytes + separatorBytes
  }
  return retained
}

export function measureJsonByteLength(value: unknown, maxBytes = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error('JSON 字节上限无效。')
  }

  const activeObjects = new WeakSet<object>()
  let bytes = 0
  const add = (count: number) => {
    bytes = Math.min(maxBytes + 1, bytes + count)
  }

  const visit = (current: unknown, arrayValue: boolean, depth: number): boolean => {
    if (bytes > maxBytes) return true
    if (depth > 1000) throw new TypeError('项目数据嵌套过深。')
    if (current === null) {
      add(4)
      return true
    }

    const kind = typeof current
    if (kind === 'string') {
      add(jsonStringByteLength(current as string))
      return true
    }
    if (kind === 'number') {
      add(Number.isFinite(current) ? String(current).length : 4)
      return true
    }
    if (kind === 'boolean') {
      add(current ? 4 : 5)
      return true
    }
    if (kind === 'bigint') throw new TypeError('项目数据不能包含 BigInt。')
    if (kind === 'undefined' || kind === 'function' || kind === 'symbol') {
      if (arrayValue) add(4)
      return arrayValue
    }

    const object = current as Record<string, unknown>
    if (activeObjects.has(object)) throw new TypeError('项目数据包含循环引用。')
    activeObjects.add(object)
    try {
      if (Array.isArray(object)) {
        add(1)
        for (let index = 0; index < object.length; index += 1) {
          if (index > 0) add(1)
          visit(object[index], true, depth + 1)
          if (bytes > maxBytes) break
        }
        add(1)
        return true
      }

      add(1)
      let writtenProperties = 0
      for (const key of Object.keys(object)) {
        const item = object[key]
        const itemKind = typeof item
        if (itemKind === 'undefined' || itemKind === 'function' || itemKind === 'symbol') continue
        if (writtenProperties > 0) add(1)
        add(jsonStringByteLength(key) + 1)
        visit(item, false, depth + 1)
        writtenProperties += 1
        if (bytes > maxBytes) break
      }
      add(1)
      return true
    } finally {
      activeObjects.delete(object)
    }
  }

  visit(value, false, 0)
  return bytes
}

function jsonStringByteLength(value: string) {
  let bytes = 2
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 34 || code === 92) {
      bytes += 2
    } else if (code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
      bytes += 2
    } else if (code <= 31) {
      bytes += 6
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 6
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6
    } else if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else {
      bytes += 3
    }
  }
  return bytes
}

function encodedBytes(value: string) {
  return encoder.encode(value).byteLength
}
