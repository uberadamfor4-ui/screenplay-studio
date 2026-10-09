const { spawnSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const development = process.argv.includes('--development')
const arch = process.arch
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
for (const name of Object.keys(environment)) {
  if (name.startsWith('CSC_') && name !== 'CSC_IDENTITY_AUTO_DISCOVERY') delete environment[name]
  if (name.startsWith('APPLE_')) delete environment[name]
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: environment,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(script)} failed (${result.status}): ${result.error?.message || 'see output above'}`)
  }
}

try {
  if (process.platform !== 'darwin' || !['x64', 'arm64'].includes(arch)) {
    throw new Error('Build and verify Mac packages on a native x64 or arm64 Mac. Use the two native CI jobs to build both architectures.')
  }
  run(path.join(__dirname, 'mac-release-preflight.cjs'))
  run(require.resolve('electron-builder/cli.js'), [
    '--mac', 'dmg', 'zip', `--${arch}`, '--publish', 'never',
    ...(development ? ['--config', 'build/mac-development.cjs'] : []),
  ])
  run(path.join(__dirname, 'verify-macos-distribution.cjs'), [
    '--arch', arch, ...(development ? ['--development'] : []),
  ])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
