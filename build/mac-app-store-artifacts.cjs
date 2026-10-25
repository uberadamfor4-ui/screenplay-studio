const fs = require('node:fs/promises')
const path = require('node:path')
const { constants } = require('node:fs')
const plist = require('plist')

const MAS_ICON = 'assets/brand/app-icon-1024.png'

function verifyRetinaIcns(bytes) {
  if (bytes.length < 8 || bytes.toString('ascii', 0, 4) !== 'icns' || bytes.readUInt32BE(4) !== bytes.length) {
    throw new Error('Invalid MAS ICNS header or length.')
  }
  let retina = false
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error('Truncated MAS ICNS chunk.')
    const size = bytes.readUInt32BE(offset + 4)
    if (size <= 8 || offset + size > bytes.length) throw new Error('Invalid MAS ICNS chunk length.')
    if (bytes.toString('ascii', offset, offset + 4) === 'ic10') retina = true
    offset += size
  }
  if (!retina) throw new Error('MAS icon lacks the 512pt@2x (1024px, ic10) representation.')
}

function isPubliclyReadable(mode, directory = false) {
  const required = directory ? 0o005 : 0o004
  return (mode & required) === required
}

async function regularFile(file) {
  const stat = await fs.lstat(file)
  if (!stat.isFile()) throw new Error('MAS artifact must be a regular file.')
  return stat
}

async function realDirectory(directory) {
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error('MAS artifact directory must not be a symlink.')
}

async function verifyReadableTree(directory) {
  const stat = await fs.lstat(directory)
  if (stat.isSymbolicLink()) return
  if (!stat.isFile() && !stat.isDirectory()) throw new Error('Unsupported MAS bundle entry type.')
  if (!isPubliclyReadable(stat.mode, stat.isDirectory())) {
    throw new Error(`MAS bundle entry is not readable by ordinary users: ${path.basename(directory)}`)
  }
  if (stat.isDirectory()) {
    for (const name of await fs.readdir(directory)) await verifyReadableTree(path.join(directory, name))
  }
}

async function prepareMasArtifacts(context, profilePath) {
  if (context.electronPlatformName !== 'mas') throw new Error('The MAS artifact gate requires the actual MAS Electron runtime.')
  const name = context.packager.appInfo.productFilename
  if (!name || path.basename(name) !== name || name === '.' || name === '..') throw new Error('Invalid MAS product filename.')
  const app = path.join(context.appOutDir, `${name}.app`)
  const contents = path.join(app, 'Contents')
  const resources = path.join(contents, 'Resources')
  for (const directory of [app, contents, resources]) await realDirectory(directory)
  const infoPath = path.join(contents, 'Info.plist')
  await regularFile(infoPath)
  const info = plist.parse(await fs.readFile(infoPath, 'utf8'))
  const iconName = info.CFBundleIconFile
  if (typeof iconName !== 'string' || !iconName || path.basename(iconName) !== iconName || /[\\/]/.test(iconName)) {
    throw new Error('MAS bundle has an invalid icon filename.')
  }
  const iconPath = path.join(resources, iconName.endsWith('.icns') ? iconName : `${iconName}.icns`)
  await regularFile(iconPath)
  verifyRetinaIcns(await fs.readFile(iconPath))

  if (profilePath) {
    const sourceStat = await regularFile(profilePath)
    const source = await fs.readFile(profilePath)
    const embedded = path.join(contents, 'embedded.provisionprofile')
    if (path.resolve(profilePath) === path.resolve(embedded)) throw new Error('The selected source profile must be outside its embedded destination.')
    try {
      await fs.copyFile(profilePath, embedded, constants.COPYFILE_EXCL)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    const stat = await regularFile(embedded)
    if (stat.nlink !== 1 || (stat.dev === sourceStat.dev && stat.ino === sourceStat.ino) || !(await fs.readFile(embedded)).equals(source)) {
      throw new Error('Embedded MAS profile is linked or does not match the selected profile.')
    }
    // osx-sign preserves this existing copy; change only public bundle metadata, never the source profile.
    await fs.chmod(embedded, 0o644)
  }
  await verifyReadableTree(app)
}

module.exports = { MAS_ICON, verifyRetinaIcns, isPubliclyReadable, prepareMasArtifacts }
