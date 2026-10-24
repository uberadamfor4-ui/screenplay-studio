import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { mock } from 'node:test'

const require = createRequire(import.meta.url)
const { createConfig } = require('../build/mac-app-store-unsigned.cjs')
const signed = require('../build/mac-app-store.template.cjs')

test('unsigned MAS handoff is opt-in, arm64-only and does not change the signed template', () => {
  assert.throws(() => createConfig({}))
  assert.throws(() => createConfig({ SCREENPLAY_MAS_UNSIGNED_QA: 'true' }))
  const config = createConfig({ SCREENPLAY_MAS_UNSIGNED_QA: '1' })
  assert.equal(config.publish, null)
  assert.equal(config.forceCodeSigning, false)
  assert.equal(config.extends, null)
  assert.equal(config.directories.output, 'release/mac-app-store/unsigned-arm64')
  assert.deepEqual(config.mac.target, [{ target: 'mas-dev', arch: ['arm64'] }])
  for (const target of [config.mac, config.mas, config.masDev]) {
    assert.equal(target.identity, null)
    assert.equal(target.notarize, false)
    assert.equal(target.provisioningProfile, undefined)
  }
  const release = signed.createConfig({ SCREENPLAY_MAS_MODE: 'distribution', SCREENPLAY_MAS_TEAM_ID: 'ABCDE12345', SCREENPLAY_MAS_PROFILE: '/synthetic/profile', SCREENPLAY_MAS_BUILD_NUMBER: '1' })
  assert.equal(release.forceCodeSigning, true)
  assert.equal(release.mac.identity, 'ABCDE12345')
})

test('builder schema accepts the isolated unsigned QA configuration', async () => {
  const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js')
  const { DebugLogger, log } = require('builder-util')
  const progress = mock.method(log, 'info', () => {})
  try { await validateConfiguration(createConfig({ SCREENPLAY_MAS_UNSIGNED_QA: '1' }), new DebugLogger()) }
  finally { progress.mock.restore() }
})
