const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { build, Platform, Arch } = require('electron-builder')
const { createConfig } = require('../build/mac-app-store-unsigned.cjs')
const packageJson = require('../package.json')

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Build this QA-only MAS artifact on a native arm64 Mac.')
  const root = path.resolve(__dirname, '..')
  const config = createConfig(process.env)
  const artifactGate = config.afterPack
  let packed
  config.afterPack = async context => {
    await artifactGate(context)
    if (context.electronPlatformName !== 'mas' || context.arch !== Arch.arm64) throw new Error('Expected the actual MAS arm64 Electron distribution, not a normal darwin build.')
    packed = { appPath: path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`), runtimeTarget: context.electronPlatformName }
  }
  await build({ config, targets: Platform.MAC.createTarget('mas-dev', Arch.arm64), publish: 'never' })
  if (!packed) throw new Error('No verified MAS packing context was recorded.')
  const resources = path.join(packed.appPath, 'Contents', 'Resources')
  const plist = path.join(packed.appPath, 'Contents', 'Info.plist')
  const readPlist = key => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { encoding: 'utf8' }).trim()
  if (readPlist('CFBundleIdentifier') !== packageJson.build.appId || readPlist('CFBundleShortVersionString') !== packageJson.version) throw new Error('Packaged identity or version does not match the candidate.')
  const native = path.join(resources, 'app.asar.unpacked', 'node_modules', '@napi-rs', 'canvas-darwin-arm64', 'skia.darwin-arm64.node')
  for (const binary of [path.join(packed.appPath, 'Contents', 'MacOS', packageJson.build.productName), native]) {
    const arches = execFileSync('/usr/bin/lipo', ['-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/)
    if (!arches.includes('arm64')) throw new Error('Packaged binary lacks the expected native architecture.')
  }
  const asar = require('@electron/asar')
  for (const file of ['electron/main.cjs', 'electron/renderPdf.cjs', 'electron/securityScopedFiles.cjs']) {
    if (!asar.extractFile(path.join(resources, 'app.asar'), file).equals(await fs.readFile(path.join(root, file)))) throw new Error('Packaged source differs from the candidate.')
  }
  for (const name of ['ScreenplayCJK-Regular.otf', 'ScreenplayCJK-Bold.otf']) {
    if (!(await fs.stat(path.join(resources, 'fonts', name))).size) throw new Error('Required packaged CJK font is missing.')
  }
  const output = path.resolve(root, config.directories.output)
  const zip = path.join(output, `Screenplay-Studio-${packageJson.version}-UNSIGNED-MAS-arm64.zip`)
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', packed.appPath, zip], { timeout: 180_000 })
  const report = {
    version: packageJson.version,
    sourceRevision: process.env.GITHUB_SHA || null,
    runtimeDistributionSelectedByBuilder: packed.runtimeTarget,
    architecture: 'arm64',
    appId: packageJson.build.appId,
    artifact: path.basename(zip),
    artifactBytes: (await fs.stat(zip)).size,
    command: 'SCREENPLAY_MAS_UNSIGNED_QA=1 CSC_IDENTITY_AUTO_DISCOVERY=false node scripts/build-unsigned-mas.cjs',
    teamSigningPerformed: false,
    privateSigningMaterialIncluded: false,
    provisioningProfileIncluded: false,
    sandboxRuntimeLaunched: false,
    nativeCanvasArchitectureVerified: true,
    sourceComparedByBytes: true,
    submissionReady: false,
    intendedUse: 'Transfer to the owner Mac for development signing and real sandbox acceptance; not a distributable installer.',
  }
  await fs.writeFile(path.join(output, 'UNSIGNED-MAS-ARTIFACT.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
