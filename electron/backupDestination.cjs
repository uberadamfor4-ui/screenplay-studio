const fs = require('node:fs/promises')
const path = require('node:path')
async function assertBackupDestination(destination, original) {
  if (!original) return
  const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
  if (normalized(destination) === normalized(original)) throw new Error('独立备份不能覆盖当前原项目文件。请选择新的文件名。')
  try {
    const [source, target] = await Promise.all([fs.realpath(original), fs.realpath(destination)])
    if (normalized(source) === normalized(target)) throw new Error('独立备份不能覆盖当前原项目文件。')
    const [a, b] = await Promise.all([fs.stat(original), fs.stat(destination)])
    if (a.ino && a.dev === b.dev && a.ino === b.ino) throw new Error('独立备份不能覆盖原项目的链接文件。')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
module.exports = { assertBackupDestination }
