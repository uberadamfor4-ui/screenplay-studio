import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createConfig } = require('../build/mac-app-store.template.cjs')
const packageJson = require('../package.json')
const environment = {
  SCREENPLAY_MAS_MODE: 'development',
  SCREENPLAY_MAS_TEAM_ID: 'ABCDE12345',
  SCREENPLAY_MAS_PROFILE: '/synthetic/profiles/development.provisionprofile',
  SCREENPLAY_MAS_BUILD_NUMBER: '1',
}

test('store template requires an explicit mode, team, profile and build number', () => {
  for (const key of Object.keys(environment)) {
    assert.throws(() => createConfig({ ...environment, [key]: undefined }))
  }
  for (const [key, values] of Object.entries({
    SCREENPLAY_MAS_MODE: ['release', '', 'mas'],
    SCREENPLAY_MAS_TEAM_ID: ['-', 'abcdef1234', 'ABCDE12345\n'],
    SCREENPLAY_MAS_PROFILE: ['relative.provisionprofile', 'C:\\profile.provisionprofile', '/bad\0profile'],
    SCREENPLAY_MAS_BUILD_NUMBER: ['0', '1.2.3.4', '2026102401', '1\n'],
  })) {
    for (const value of values) assert.throws(() => createConfig({ ...environment, [key]: value }))
  }
})

test('development and distribution use MAS runtime targets without changing DMG defaults', () => {
  const before = JSON.stringify(packageJson.build)
  for (const mode of ['development', 'distribution']) {
    const config = createConfig({ ...environment, SCREENPLAY_MAS_MODE: mode })
    assert.equal(config.extends, null)
    assert.equal(config.forceCodeSigning, true)
    assert.equal(config.publish, null)
    assert.equal(config.appId, packageJson.build.appId)
    assert.equal(config.directories.output, `release/mac-app-store/${mode}`)
    assert.deepEqual(config.mac.target, [{ target: mode === 'development' ? 'mas-dev' : 'mas', arch: ['universal'] }])
    for (const options of [config.mac, config.mas, config.masDev]) {
      assert.equal(options.identity, environment.SCREENPLAY_MAS_TEAM_ID)
      assert.equal(options.provisioningProfile, environment.SCREENPLAY_MAS_PROFILE)
      assert.equal(options.notarize, false)
      assert.equal(options.preAutoEntitlements, true)
      assert.equal(options.strictVerify, true)
      assert.equal(options.extendInfo.ElectronTeamID, environment.SCREENPLAY_MAS_TEAM_ID)
    }
    assert.equal(config.mas.type, mode)
  }
  assert.equal(JSON.stringify(packageJson.build), before)
  assert.equal(packageJson.build.mac.identity, '-')
})

test('store entitlements request selected-file access without network or broad folder access', () => {
  const plist = require('plist')
  const main = plist.parse(readFileSync(new URL('../build/entitlements.mas.plist', import.meta.url), 'utf8'))
  const inherit = plist.parse(readFileSync(new URL('../build/entitlements.mas.inherit.plist', import.meta.url), 'utf8'))
  assert.deepEqual(main, {
    'com.apple.security.app-sandbox': true,
    'com.apple.security.cs.allow-jit': true,
    'com.apple.security.files.user-selected.read-write': true,
    'com.apple.security.files.bookmarks.app-scope': true,
    'com.apple.security.print': true,
  })
  assert.deepEqual(inherit, {
    'com.apple.security.app-sandbox': true,
    'com.apple.security.inherit': true,
  })
})

test('builder accepts both store configurations and their file-loading entry point', async () => {
  const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config.js')
  const { DebugLogger } = require('builder-util')
  const before = JSON.stringify(packageJson.build)
  const original = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
  try {
    Object.assign(process.env, environment)
    const loaded = await getConfig(process.cwd(), 'build/mac-app-store.template.cjs', undefined)
    await validateConfiguration(loaded, new DebugLogger())
    assert.equal(loaded.mac.identity, environment.SCREENPLAY_MAS_TEAM_ID)
    for (const mode of ['development', 'distribution']) {
      await validateConfiguration(createConfig({ ...environment, SCREENPLAY_MAS_MODE: mode }), new DebugLogger())
    }
    assert.equal(JSON.stringify(packageJson.build), before)
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
