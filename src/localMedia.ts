export function resolveLocalMediaSource(value: string) {
  const source = value.trim()
  if (!source || /^(?:https?|data|blob|file):/iu.test(source)) {
    return source
  }

  const normalized = source.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//u.test(normalized)) {
    return `file:///${encodeAbsolutePath(normalized)}`
  }
  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return `file://${encodeAbsolutePath(normalized)}`
  }
  return source
}

function encodeAbsolutePath(value: string) {
  return value
    .split('/')
    .map((segment, index) => index === 0 && /^[A-Za-z]:$/u.test(segment) ? segment : encodeURIComponent(segment))
    .join('/')
}
