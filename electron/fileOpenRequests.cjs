const path = require('node:path')

function projectPathsFromArguments(argv, workingDirectory, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (!Array.isArray(argv) || typeof workingDirectory !== 'string') return []
  return argv.flatMap(value => {
    if (typeof value !== 'string' || value.startsWith('-') || value.includes('\0') || value.includes('\r') || value.includes('\n')) return []
    const file = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
    if (!['.ssproj', '.fdx', '.json'].includes(paths.extname(file).toLowerCase()) || /^[a-z]+:\/\//i.test(file)) return []
    return [paths.resolve(workingDirectory, file)]
  })
}

function createFileOpenQueue(platform = process.platform) {
  const pending = []
  let sequence = 0
  const key = file => platform === 'win32' ? file.toLowerCase() : file
  return {
    add(files) {
      let rejected = 0
      for (const filePath of files) {
        if (pending.some(item => key(item.filePath) === key(filePath))) continue
        if (pending.length >= 16) { rejected++; continue }
        pending.push({ requestId: ++sequence, filePath })
      }
      return rejected
    },
    peek: () => pending[0],
    acknowledge(requestId) {
      if (!Number.isSafeInteger(requestId) || pending[0]?.requestId !== requestId) return false
      pending.shift()
      return true
    },
  }
}

module.exports = { projectPathsFromArguments, createFileOpenQueue }
