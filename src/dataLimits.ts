export const projectDataLimits = Object.freeze({
  maxProjectFileBytes: 32 * 1024 * 1024,
  maxScriptElements: 5000,
  maxElementTextCharacters: 250_000,
  maxImportLines: 100_000,
  maxProductionRecordsPerCollection: 10_000,
  maxStringArrayItems: 20_000,
  maxMetadataTextCharacters: 250_000,
  maxIdentifierCharacters: 256,
})

export function limitElementText(value: string) {
  if (value.length <= projectDataLimits.maxElementTextCharacters) {
    return { text: value, truncated: false }
  }
  let end = projectDataLimits.maxElementTextCharacters
  const previous = value.charCodeAt(end - 1)
  const next = value.charCodeAt(end)
  if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
    end -= 1
  }
  return { text: value.slice(0, end), truncated: true }
}

export function stripControlCharacters(value: string) {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')
}
