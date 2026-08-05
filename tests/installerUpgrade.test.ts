import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const installerInclude = readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8')

test('Windows installer keeps a stable upgrade identity and preserves user data', () => {
  assert.equal(packageJson.build.appId, 'studio.screenplay.writer')
  assert.equal(packageJson.build.nsis.guid, 'e3b5c511-87ee-5430-a4ae-e55b92f80f55')
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh')
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false)
  assert.equal(packageJson.build.nsis.oneClick, false)
  assert.equal(packageJson.build.nsis.perMachine, false)
})

test('existing single-scope installations skip install-mode selection without guessing through duplicates', () => {
  assert.match(installerInclude, /\$hasPerUserInstallation == "1"[\s\S]*\$hasPerMachineInstallation == "0"/)
  assert.match(installerInclude, /StrCpy \$isForceCurrentInstall "1"/)
  assert.match(installerInclude, /\$hasPerMachineInstallation == "1"[\s\S]*\$hasPerUserInstallation == "0"/)
  assert.match(installerInclude, /StrCpy \$isForceMachineInstall "1"/)
  assert.doesNotMatch(installerInclude, /RMDir|DeleteRegKey|--delete-app-data/)
})

test('upgrade keeps shortcut names and lets the builder preserve the user shortcut choice', () => {
  assert.equal(packageJson.build.nsis.shortcutName, 'Screenplay Studio')
  assert.equal(packageJson.build.nsis.uninstallDisplayName, 'Screenplay Studio')
  assert.equal(packageJson.build.nsis.createDesktopShortcut, true)
  assert.equal(packageJson.build.nsis.createStartMenuShortcut, true)
  assert.notEqual(packageJson.build.nsis.createDesktopShortcut, 'always')
})
