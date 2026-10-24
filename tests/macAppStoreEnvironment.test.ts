import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { summarizeIdentities, collectEnvironment } = require('../scripts/mac-app-store-environment.cjs')
const teamId = 'ABCDE12345'
const identities = [
  '1) synthetic "Apple Development: Synthetic Test (ABCDE12345)"',
  '2) synthetic "3rd Party Mac Developer Application: Synthetic Test (ABCDE12345)"',
  '3) synthetic "3rd Party Mac Developer Installer: Synthetic Test (ABCDE12345)"',
  '4) synthetic "Apple Distribution: Other Team (OTHER12345)"',
].join('\n')
const certificateTeams = new Map([
  ['Apple Development: Synthetic Test (ABCDE12345)', teamId],
  ['3rd Party Mac Developer Application: Synthetic Test (ABCDE12345)', teamId],
  ['3rd Party Mac Developer Installer: Synthetic Test (ABCDE12345)', teamId],
  ['Apple Distribution: Other Team (OTHER12345)', 'OTHER12345'],
])

test('only recognizes matching-team signing identities without returning raw certificate data', () => {
  assert.deepEqual(summarizeIdentities(identities, teamId, certificateTeams), {
    development: true, applicationDistribution: true, installerDistribution: true,
  })
  assert.deepEqual(summarizeIdentities(identities, 'ZZZZZ99999', certificateTeams), {
    development: false, applicationDistribution: false, installerDistribution: false,
  })
  for (const invalid of [undefined, '', '-', 'abcde12345']) assert.throws(() => summarizeIdentities('', invalid))
})

test('rejects non-Mac checks before executing any native command', () => {
  for (const platform of ['win32', 'linux']) {
    assert.throws(() => collectEnvironment({ teamId, platform, run: () => assert.fail('must not execute') }))
  }
})

test('uses only read-only tools and does not confuse environment checks with acceptance', () => {
  const commands: string[][] = []
  const report = collectEnvironment({ teamId, platform: 'darwin', arch: 'arm64', parseCertificateSubject: (pem: string) => JSON.parse(Buffer.from(pem.split('\n')[1], 'base64').toString()), run: (command: string, args: string[], options: { timeout: number }) => {
    commands.push([command, ...args])
    assert.equal(options.timeout, 30_000)
    const stdout = args[0] === 'find-certificate'
      ? `-----BEGIN CERTIFICATE-----\n${Buffer.from(JSON.stringify({ CN: args[3], OU: certificateTeams.get(args[3]) })).toString('base64')}\n-----END CERTIFICATE-----`
      : command.endsWith('/security') ? identities : command.endsWith('/uname') ? 'arm64\n' : command.endsWith('/sw_vers') ? 'synthetic-os\n' : 'synthetic-xcode\n'
    return { status: 0, stdout }
  } })
  assert.deepEqual(commands, [
    ['/usr/bin/sw_vers', '-productVersion'],
    ['/usr/bin/uname', '-m'],
    ['/usr/bin/xcodebuild', '-version'],
    ['/usr/bin/security', 'find-identity', '-v', '-p', 'codesigning'],
    ['/usr/bin/security', 'find-identity', '-v'],
    ...[...certificateTeams.keys()].map(name => ['/usr/bin/security', 'find-certificate', '-a', '-c', name, '-p']),
  ])
  assert.equal(report.hardwareArch, 'arm64')
  assert.equal(report.submissionReady, false)
  assert.equal(report.sandboxRuntimeTested, false)
  assert.equal(report.privateKeysExported, false)
  assert.ok(!JSON.stringify(report).includes('Synthetic Test'))
})

test('certificate OU supplies the team; a person ID suffix never stands in for it', () => {
  const name = 'Apple Development: Synthetic Test (PERSON1234)'
  assert.equal(summarizeIdentities(`1) synthetic "${name}"`, teamId, new Map([[name, teamId]])).development, true)
  assert.equal(summarizeIdentities(`1) synthetic "${name}"`, teamId).development, null)
  assert.equal(summarizeIdentities(`1) synthetic "${name}"`, teamId, new Map([[name, null]])).development, null)
  assert.equal(summarizeIdentities(`1) synthetic "${name}"`, teamId, new Map([[name, 'OTHER12345']])).development, false)
})

test('failed keychain queries are unknown, never misreported as valid or no-certificate', () => {
  const report = collectEnvironment({ teamId, platform: 'darwin', run: () => ({ status: 1, stderr: 'private diagnostic text', stdout: identities }) })
  assert.deepEqual(report.matchingSigningIdentities, {
    development: null, applicationDistribution: null, installerDistribution: null,
  })
  assert.equal(report.xcode, null)
  assert.ok(!JSON.stringify(report).includes('private diagnostic'))
})
