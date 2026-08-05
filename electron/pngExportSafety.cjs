function getExportPrefix(fileName) {
  const match = typeof fileName === 'string'
    ? fileName.match(/^(.+)_(?:title|\d+)\.png$/iu)
    : null
  return match?.[1]
}

function findStalePngFiles(directoryEntries, writtenFileNames) {
  const written = new Set(writtenFileNames)
  const prefixes = new Set([...written].map(getExportPrefix).filter(Boolean))
  if (prefixes.size === 0) return []

  return directoryEntries.filter((fileName) => {
    const prefix = getExportPrefix(fileName)
    return Boolean(prefix && prefixes.has(prefix) && !written.has(fileName))
  })
}

module.exports = {
  findStalePngFiles,
  getExportPrefix,
}
