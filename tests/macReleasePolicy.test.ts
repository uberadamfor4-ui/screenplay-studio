import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DOMParser } from '@xmldom/xmldom'

const require = createRequire(import.meta.url)
const { assertBundleSignature, assessGatekeeper } = require('../scripts/mac-release-policy.cjs')

const identifier = 'studio.screenplay.writer'
const completeSignature = `Identifier=${identifier}\nSignature=adhoc\nTeamIdentifier=not set\nCodeDirectory v=20500 size=812 flags=0x10002(adhoc,runtime)\nSealed Resources version=2 rules=13 files=42`

test('Mac acceptance permits full ad-hoc signing without an Apple identity', () => {
  assert.doesNotThrow(() => assertBundleSignature(completeSignature, identifier))
  assert.doesNotThrow(() => assertBundleSignature(completeSignature.replaceAll('\n', '\r\n'), identifier))
})

test('Mac acceptance rejects missing resource seals and linker-only ad-hoc signatures', () => {
  for (const signature of [
    'code object is not signed at all',
    'Identifier=Electron\nSignature=adhoc\nCodeDirectory flags=0x20002(adhoc,linker-signed)\nSealed Resources=none',
    completeSignature.replace('files=42', 'files=0'),
    completeSignature.replace('Sealed Resources version=2 rules=13 files=42', 'Sealed Resources=none'),
    completeSignature.replace(identifier, 'another.app'),
    completeSignature.replace('0x10002(adhoc,runtime)', '0x2(adhoc)'),
  ]) assert.throws(() => assertBundleSignature(signature, identifier), /complete ad-hoc bundle signature/)
})

test('Gatekeeper rejection is reported separately from bundle integrity', () => {
  assert.equal(assessGatekeeper({ status: 3, stderr: 'rejected\nsource=no usable signature' }).status, 'rejected')
  assert.equal(assessGatekeeper({ status: 0, stderr: 'accepted' }).status, 'accepted-on-test-machine')
  assert.equal(assessGatekeeper({ status: 1, stderr: 'internal error' }).status, 'inconclusive')
  assert.equal(assessGatekeeper({ status: null, error: new Error('timeout') }).status, 'inconclusive')
})

test('ad-hoc hardened runtime provides only the required Electron entitlements', () => {
  const { build } = require('../package.json')
  assert.equal(build.mac.entitlementsInherit, build.mac.entitlements)
  const xml = new DOMParser().parseFromString(readFileSync(new URL(`../${build.mac.entitlements}`, import.meta.url), 'utf8'), 'text/xml')
  const keys = [...Array.from(xml.getElementsByTagName('key'))].map((key) => key.textContent)
  assert.deepEqual(keys.sort(), ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.disable-library-validation'])
  for (const key of Array.from(xml.getElementsByTagName('key'))) {
    let value = key.nextSibling
    while (value && value.nodeType !== 1) value = value.nextSibling
    assert.equal(value?.nodeName, 'true')
  }
})

test('Mac defaults never skip signing or attempt notarization; development remains separate', () => {
  const { build } = require('../package.json')
  const development = require('../build/mac-development.cjs')
  assert.equal(build.mac.forceCodeSigning, true)
  assert.equal(build.mac.hardenedRuntime, true)
  assert.equal(build.mac.strictVerify, true)
  assert.equal(build.mac.notarize, false)
  assert.equal(build.mac.identity, '-')
  assert.equal(development.mac.identity, '-')
  assert.equal(development.mac.notarize, false)
  assert.equal(development.mac.hardenedRuntime, true)
  assert.equal(development.mac.forceCodeSigning, true)
  assert.equal(development.appId, `${build.appId}.development`)
  assert.equal(development.productName, `${build.productName} Development`)
  assert.notEqual(development.directories.output, build.directories.output)
  assert.match(development.mac.artifactName, /-development\./)
  assert.match(development.dmg.artifactName, /-development\./)
})
