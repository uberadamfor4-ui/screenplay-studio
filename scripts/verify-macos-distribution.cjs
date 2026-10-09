const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { assertBundleSignature, assessGatekeeper } = require('./mac-release-policy.cjs')

const root = path.resolve(__dirname, '..')
const packageJson = require('../package.json')
const development = process.argv.includes('--development')
const archIndex = process.argv.indexOf('--arch')
const architectures = archIndex < 0 ? [process.arch] : [process.argv[archIndex + 1]]
assert.ok(architectures.every((arch) => arch === 'x64' || arch === 'arm64'), 'Expected --arch x64 or --arch arm64')
if (process.platform !== 'darwin') throw new Error('macOS distribution acceptance requires macOS; it cannot be skipped on a release.')
assert.ok(architectures.every((arch) => arch === process.arch), 'Installed-app smoke acceptance must run on the matching native architecture')

const productName = `${packageJson.build.productName}${development ? ' Development' : ''}`
const expectedId = `${packageJson.build.appId}${development ? '.development' : ''}`
const output = path.join(root, 'release', ...(development ? ['mac-development'] : []))
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'screenplay-mac-distribution-'))
const results = []

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, LC_ALL: 'C' },
    ...options,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`)
  }
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim()
}

function verifyApp(app, arch, source) {
  const plist = path.join(app, 'Contents', 'Info.plist')
  for (const [key, expected] of [['CFBundleIdentifier', expectedId], ['CFBundleShortVersionString', packageJson.version]]) {
    assert.equal(run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist]), expected)
  }

  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  assert.ok(fs.statSync(path.join(app, 'Contents', '_CodeSignature', 'CodeResources')).size > 0, 'App resource seal is missing')
  assertBundleSignature(run('/usr/bin/codesign', ['--display', '--verbose=4', app]), expectedId)

  const executable = path.join(app, 'Contents', 'MacOS', productName)
  const native = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', '@napi-rs', `canvas-darwin-${arch}`, `skia.darwin-${arch}.node`)
  for (const binary of [executable, native]) {
    assert.ok(fs.existsSync(binary), `Packaged binary is missing: ${binary}`)
    assert.ok(run('/usr/bin/lipo', ['-archs', binary]).split(/\s+/).includes(arch === 'x64' ? 'x86_64' : 'arm64'), 'Packaged native architecture is incorrect')
    run('/usr/bin/codesign', ['--verify', '--strict', binary])
  }

  const resources = path.join(app, 'Contents', 'Resources', 'app.asar')
  run(executable, ['-e', `const {createRequire} = require('node:module'); const canvas = createRequire(${JSON.stringify(path.join(resources, 'package.json'))})('@napi-rs/canvas'); if (typeof canvas.DOMMatrix !== 'function' || canvas.createCanvas(40, 40).getContext('2d').measureText('Hello').width <= 0) process.exit(1); console.log('Packaged native PDF canvas ready');`], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  run(process.execPath, [path.join(root, 'scripts', 'packaged-input-smoke.cjs')], {
    env: { ...process.env, SCREENPLAY_ACCEPTANCE_EXECUTABLE: executable },
  })

  // Assess only the disposable copy, after the separate runtime test. Never
  // remove quarantine or change system policy, and never equate signing with trust.
  run('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};ScreenplayDistributionAcceptance;`, app])
  const gatekeeper = assessGatekeeper(spawnSync('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', app], {
    encoding: 'utf8', timeout: 120_000, env: { ...process.env, LC_ALL: 'C' },
  }))
  return { source, signatureIntegrity: true, nativeCanvas: true, inputSmoke: true, notarized: false, trustedDeveloperIdentity: false, gatekeeper }
}

try {
  for (const arch of architectures) {
    const suffix = development ? '-development' : ''
    const name = `Screenplay-Studio-${packageJson.version}-${arch}${suffix}`
    const zip = path.join(output, `${name}.zip`)
    const dmg = path.join(output, `${name}.dmg`)
    assert.ok(fs.existsSync(zip) && fs.existsSync(dmg), `DMG and ZIP are both required for ${arch}`)

    const zipDir = path.join(temporaryRoot, `${arch}-zip`)
    fs.mkdirSync(zipDir)
    run('/usr/bin/ditto', ['-x', '-k', zip, zipDir])
    const zipAcceptance = verifyApp(path.join(zipDir, `${productName}.app`), arch, 'zip')

    run('/usr/bin/hdiutil', ['verify', dmg])
    const mount = path.join(temporaryRoot, `${arch}-volume`)
    fs.mkdirSync(mount)
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
    let dmgAcceptance
    try {
      const installedApp = path.join(temporaryRoot, `${arch}-dmg`, `${productName}.app`)
      fs.mkdirSync(path.dirname(installedApp))
      run('/usr/bin/ditto', [path.join(mount, `${productName}.app`), installedApp])
      dmgAcceptance = verifyApp(installedApp, arch, 'dmg-installed-copy')
    } finally {
      run('/usr/bin/hdiutil', ['detach', mount])
    }
    results.push({ arch, version: packageJson.version, mode: development ? 'development-ad-hoc' : 'ad-hoc-unnotarized', zipVerified: true, dmgVerified: true, applications: [zipAcceptance, dmgAcceptance], gatekeeperApprovalGuaranteed: false })
  }
  fs.mkdirSync(path.join(root, 'acceptance-results'), { recursive: true })
  fs.writeFileSync(path.join(root, 'acceptance-results', `mac-distribution-${development ? 'development' : 'release'}-${architectures.join('-')}.json`), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  const relative = path.relative(os.tmpdir(), temporaryRoot)
  assert.ok(relative.startsWith('screenplay-mac-distribution-') && !relative.includes(path.sep), 'Refusing unsafe temporary-directory cleanup')
  // Leave a still-mounted volume intact if detach failed.
  if (!fs.readdirSync(temporaryRoot).some((name) => name.endsWith('-volume') && fs.readdirSync(path.join(temporaryRoot, name)).length)) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}
