const pngExportManifestFileName = '.screenplay-studio-png-exports.json'
const maxManifestExports = 100
const maxManifestFilesPerExport = 5000

function getExportPrefix(fileName) {
  const match = typeof fileName === 'string'
    ? fileName.match(/^(.+)_(?:title|\d+)\.png$/iu)
    : null
  return match?.[1]
}

function createEmptyPngExportManifest() {
  return { version: 1, exports: [] }
}

function parsePngExportManifest(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.exports)) {
      return createEmptyPngExportManifest()
    }

    const exports = []
    const usedPrefixes = new Set()
    for (const entry of parsed.exports.slice(0, maxManifestExports)) {
      if (!entry || typeof entry !== 'object' || typeof entry.prefix !== 'string' || !Array.isArray(entry.files)) continue
      const prefix = entry.prefix.trim().slice(0, 256)
      if (!prefix || usedPrefixes.has(prefix)) continue
      const files = [...new Set(entry.files
        .slice(0, maxManifestFilesPerExport)
        .filter((fileName) => typeof fileName === 'string' && fileName === fileName.split(/[\\/]/u).at(-1))
        .filter((fileName) => getExportPrefix(fileName) === prefix))]
      if (files.length === 0) continue
      usedPrefixes.add(prefix)
      exports.push({ prefix, files })
    }
    return { version: 1, exports }
  } catch {
    return createEmptyPngExportManifest()
  }
}

function findStalePngFiles(directoryEntries, writtenFileNames, manifest = createEmptyPngExportManifest()) {
  const written = new Set(writtenFileNames)
  const prefixes = new Set([...written].map(getExportPrefix).filter(Boolean))
  if (prefixes.size === 0) return []
  const owned = new Set(
    parsePngExportManifest(manifest).exports
      .filter((entry) => prefixes.has(entry.prefix))
      .flatMap((entry) => entry.files),
  )

  return directoryEntries.filter((fileName) => {
    const prefix = getExportPrefix(fileName)
    return Boolean(prefix && prefixes.has(prefix) && owned.has(fileName) && !written.has(fileName))
  })
}

function updatePngExportManifest(manifest, writtenFileNames) {
  const normalized = parsePngExportManifest(manifest)
  const writtenByPrefix = new Map()
  for (const fileName of writtenFileNames) {
    const prefix = getExportPrefix(fileName)
    if (!prefix || fileName !== fileName.split(/[\\/]/u).at(-1)) continue
    const files = writtenByPrefix.get(prefix) ?? []
    if (files.length < maxManifestFilesPerExport && !files.includes(fileName)) files.push(fileName)
    writtenByPrefix.set(prefix, files)
  }

  const retained = normalized.exports.filter((entry) => !writtenByPrefix.has(entry.prefix))
  const next = [
    ...[...writtenByPrefix].map(([prefix, files]) => ({ prefix, files })),
    ...retained,
  ].slice(0, maxManifestExports)
  return { version: 1, exports: next }
}

module.exports = {
  createEmptyPngExportManifest,
  findStalePngFiles,
  getExportPrefix,
  parsePngExportManifest,
  pngExportManifestFileName,
  updatePngExportManifest,
}
