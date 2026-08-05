const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

if (process.platform !== 'win32') {
  console.log('Windows installer upgrade acceptance skipped on non-Windows host.')
  process.exit(0)
}

const root = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const productName = packageJson.build.productName
const shortcutName = packageJson.build.nsis.shortcutName
const guid = packageJson.build.nsis.guid
const installerPath = path.resolve(
  process.env.SCREENPLAY_INSTALLER_PATH
    || path.join(root, 'release', `Screenplay-Studio-${packageJson.version}-Setup.exe`),
)
const installDir = path.resolve(
  process.env.SCREENPLAY_UPGRADE_TEST_INSTALL_DIR
    || path.join(os.tmpdir(), `screenplay-studio-upgrade-acceptance-${process.pid}`, productName),
)
const appExe = path.join(installDir, `${productName}.exe`)
const uninstaller = path.join(installDir, `Uninstall ${productName}.exe`)
const installKeys = [
  `HKCU\\Software\\${guid}`,
  `HKLM\\Software\\${guid}`,
]
const uninstallKeys = [
  `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`,
  `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`,
]
const userDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), packageJson.name)
const sentinelDir = path.join(userDataDir, 'upgrade-acceptance')
const sentinelPath = path.join(sentinelDir, `preserve-${process.pid}.json`)
const staleInstallFile = path.join(installDir, 'upgrade-acceptance-stale-file.txt')

assert.match(guid, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
assert.ok(fs.existsSync(installerPath), `Installer not found: ${installerPath}`)
assertSafeTemporaryPath(installDir)

const existingInstallations = [...installKeys, ...uninstallKeys].filter(registryKeyExists)
if (existingInstallations.length > 0) {
  throw new Error(
    `Refusing to replace an existing Screenplay Studio installation during acceptance: ${existingInstallations.join(', ')}`,
  )
}

let installationRemoved = false

try {
  runInstaller(['/S', '/currentuser', `/D=${installDir}`])
  verifyInstallation('fresh install')

  fs.mkdirSync(sentinelDir, { recursive: true })
  fs.writeFileSync(sentinelPath, JSON.stringify({
    marker: 'screenplay-studio-upgrade-preservation',
    createdAt: new Date().toISOString(),
  }), 'utf8')
  fs.writeFileSync(staleInstallFile, 'This file must be removed by the overlay upgrade.', 'utf8')

  runInstaller(['/S', '/currentuser'])
  verifyInstallation('overlay reinstall')

  assert.ok(fs.existsSync(sentinelPath), 'Overlay reinstall removed user data')
  assert.equal(
    JSON.parse(fs.readFileSync(sentinelPath, 'utf8')).marker,
    'screenplay-studio-upgrade-preservation',
    'Overlay reinstall changed user data',
  )
  assert.equal(fs.existsSync(staleInstallFile), false, 'Overlay reinstall left stale application files behind')

  const registrations = uninstallKeys.filter(registryKeyExists)
  assert.deepEqual(registrations, [uninstallKeys[0]], 'Overlay reinstall created duplicate uninstall registrations')

  const desktopShortcut = path.join(getSpecialFolder('Desktop'), `${shortcutName}.lnk`)
  const startMenuShortcut = path.join(getSpecialFolder('StartMenu'), 'Programs', `${shortcutName}.lnk`)
  assertShortcutTarget(desktopShortcut, appExe)
  assertShortcutTarget(startMenuShortcut, appExe)

  runExecutable(uninstaller, ['/S', '/currentuser'], 'uninstaller')
  installationRemoved = true

  assert.ok(waitUntil(() => !fs.existsSync(appExe)), 'Uninstaller left application files behind')
  assert.ok(waitUntil(() => !registryKeyExists(installKeys[0])), 'Uninstaller left the install registry key behind')
  assert.ok(waitUntil(() => !registryKeyExists(uninstallKeys[0])), 'Uninstaller left the uninstall registry key behind')
  assert.ok(fs.existsSync(sentinelPath), 'Normal uninstall removed user data despite the preservation contract')

  console.log(JSON.stringify({
    installerPath,
    version: packageJson.version,
    installDir,
    installLocationPreserved: true,
    userDataPreserved: true,
    staleFilesRemoved: true,
    uniqueRegistration: true,
    shortcutsRetargeted: true,
    cleanupVerified: true,
  }, null, 2))
} finally {
  if (!installationRemoved && fs.existsSync(uninstaller)) {
    runExecutable(uninstaller, ['/S', '/currentuser'], 'cleanup uninstaller', false)
  }
  removeTemporaryInstallDirectory()
  fs.rmSync(sentinelPath, { force: true })
  if (fs.existsSync(sentinelDir) && fs.readdirSync(sentinelDir).length === 0) {
    fs.rmdirSync(sentinelDir)
  }
}

function runInstaller(args) {
  runExecutable(installerPath, args, 'installer')
}

function runExecutable(executable, args, label, throwOnFailure = true) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    windowsHide: true,
  })

  if (result.error && throwOnFailure) {
    throw result.error
  }
  if (result.status !== 0 && throwOnFailure) {
    throw new Error(`${label} exited with ${result.status}: ${result.stderr || result.stdout}`)
  }
}

function verifyInstallation(stage) {
  assert.ok(fs.existsSync(appExe), `${stage}: application executable is missing`)
  assert.ok(fs.existsSync(uninstaller), `${stage}: uninstaller is missing`)
  assert.equal(
    normalizeWindowsPath(readRegistryValue(installKeys[0], 'InstallLocation')),
    normalizeWindowsPath(installDir),
    `${stage}: installation directory changed`,
  )
  assert.equal(
    readRegistryValue(uninstallKeys[0], 'DisplayVersion'),
    packageJson.version,
    `${stage}: uninstall registration version is stale`,
  )
}

function registryKeyExists(key) {
  return spawnSync('reg.exe', ['query', key], {
    encoding: 'utf8',
    windowsHide: true,
  }).status === 0
}

function readRegistryValue(key, valueName) {
  const result = spawnSync('reg.exe', ['query', key, '/v', valueName], {
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, `Registry value is missing: ${key} ${valueName}`)

  const line = result.stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.trimStart().startsWith(valueName))
  assert.ok(line, `Registry output did not contain ${valueName}`)
  return line.trim().split(/\s{2,}/).at(-1)
}

function getSpecialFolder(name) {
  return runPowerShell(`[Environment]::GetFolderPath('${name}')`).trim()
}

function assertShortcutTarget(shortcutPath, expectedTarget) {
  assert.ok(fs.existsSync(shortcutPath), `Shortcut is missing: ${shortcutPath}`)
  const escapedPath = shortcutPath.replaceAll("'", "''")
  const target = runPowerShell(
    `$shell = New-Object -ComObject WScript.Shell; `
    + `$shortcut = $shell.CreateShortcut('${escapedPath}'); `
    + 'Write-Output $shortcut.TargetPath',
  ).trim()
  assert.equal(normalizeWindowsPath(target), normalizeWindowsPath(expectedTarget), `Shortcut target is stale: ${shortcutPath}`)
}

function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encoded,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

function normalizeWindowsPath(value) {
  return path.resolve(value).replaceAll('/', '\\').toLocaleLowerCase('en-US')
}

function assertSafeTemporaryPath(target) {
  const resolvedTarget = path.resolve(target)
  const resolvedTemp = `${path.resolve(os.tmpdir())}${path.sep}`.toLocaleLowerCase('en-US')
  assert.ok(
    resolvedTarget.toLocaleLowerCase('en-US').startsWith(resolvedTemp),
    `Acceptance install directory must stay inside the system temporary directory: ${resolvedTarget}`,
  )
}

function removeTemporaryInstallDirectory() {
  if (!fs.existsSync(installDir)) return
  assertSafeTemporaryPath(installDir)
  try {
    fs.rmSync(installDir, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    })
  } catch (error) {
    // Hosted Windows runners can hold the already-uninstalled directory for a
    // few extra seconds. The runner is ephemeral, so do not mask test results.
    console.warn(`Temporary installer directory is still locked: ${error.message}`)
  }
}

function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  return predicate()
}
