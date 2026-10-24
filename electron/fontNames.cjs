function cleanFontName(value) {
  if (typeof value !== 'string') return ''
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')
    .normalize('NFC')
    .replace(/\s*\((TrueType|OpenType|Type 1|Raster)\)/gi, '')
    .replace(/\s+(Regular|Normal)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 128)
}

function uniqueFontNames(values) {
  return Array.from(new Set(values.map(cleanFontName).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function collectFontNames(value, names) {
  if (Array.isArray(value)) { value.forEach(item => collectFontNames(item, names)); return }
  if (!value || typeof value !== 'object') return
  Object.entries(value).forEach(([key, item]) => {
    if (key === 'family' && typeof item === 'string') names.push(item)
    else if (typeof item === 'object') collectFontNames(item, names)
  })
}

module.exports = {
  cleanFontName,
  uniqueFontNames,
  collectFontNames,
}
