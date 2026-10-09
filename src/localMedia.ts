import { createContext } from 'react'

export const LocalMediaBaseContext = createContext<string | undefined>(undefined)

export function resolveLocalMediaSource(value: string, projectPath?: string) {
  const source = value.trim()
  if (!source || source.length > 8192) return ''
  if (/^file:/iu.test(source)) {
    try { const url = new URL(source); return url.protocol === 'file:' && !url.hostname ? url.href : '' } catch { return '' }
  }

  const normalized = source.replace(/\\/g, '/')
  if (normalized.startsWith('//')) return ''
  if (/^[A-Za-z]:\//u.test(normalized)) {
    return `file:///${encodeAbsolutePath(normalized)}`
  }
  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return `file://${encodeAbsolutePath(normalized)}`
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(normalized) || normalized.split('/').includes('..')) return ''
  if (projectPath) {
    const base = projectPath.replace(/\\/gu, '/').replace(/\/[^/]*$/u, '/')
    if (base.startsWith('//')) return ''
    if (/^[A-Za-z]:\//u.test(base) || base.startsWith('/')) {
      const url = base.startsWith('/') ? `file://${encodeAbsolutePath(base)}` : `file:///${encodeAbsolutePath(base)}`
      return new URL(normalized.split('/').map(encodeURIComponent).join('/'), url).href
    }
  }
  return ''
}

function encodeAbsolutePath(value: string) {
  return value
    .split('/')
    .map((segment, index) => index === 0 && /^[A-Za-z]:$/u.test(segment) ? segment : encodeURIComponent(segment))
    .join('/')
}
