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

module.exports = {
  cleanFontName,
  uniqueFontNames,
}
