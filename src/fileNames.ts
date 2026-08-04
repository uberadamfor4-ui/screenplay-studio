const reservedWindowsName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu

export function safeFileName(value: string, maxLength = 64) {
  const clean = Array.from((value || 'screenplay').normalize('NFC'))
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char))
    .slice(0, maxLength)
    .join('')
    .replace(/[. ]+$/u, '')
    .trim()
  if (!clean) return 'screenplay'
  return reservedWindowsName.test(clean) ? `_${clean}`.slice(0, maxLength) : clean
}
