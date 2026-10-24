const { spawnSync } = require('node:child_process')
const { X509Certificate } = require('node:crypto')

const certificateKinds = {
  development: ['Apple Development:', 'Mac Developer:'],
  applicationDistribution: ['Apple Distribution:', '3rd Party Mac Developer Application:', 'Mac App Distribution:'],
  installerDistribution: ['3rd Party Mac Developer Installer:', 'Mac Installer Distribution:'],
}

function identityNames(output) {
  return String(output).split(/\r?\n/).flatMap(line => {
    const match = line.match(/"([^"\r\n]+)"/)
    return match ? [match[1]] : []
  })
}

function summarizeIdentities(output, teamId, certificateTeams = new Map()) {
  if (typeof teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error('An explicit Apple Developer Team ID is required.')
  }
  const names = identityNames(output)
  return Object.fromEntries(Object.entries(certificateKinds).map(([kind, prefixes]) => [
    kind,
    (() => {
      const candidates = names.filter(name => prefixes.some(prefix => name.startsWith(prefix)))
      if (candidates.some(name => certificateTeams.get(name) === teamId)) return true
      return candidates.some(name => !certificateTeams.get(name)) ? null : false
    })(),
  ]))
}

function collectEnvironment({ teamId, platform = process.platform, arch = process.arch, run = spawnSync, parseCertificateSubject = pem => new X509Certificate(pem).toLegacyObject().subject }) {
  if (platform !== 'darwin') throw new Error('Run this read-only check on the build Mac, not Windows or CI emulation.')
  summarizeIdentities('', teamId)
  const check = (command, args) => {
    const result = run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
    return { ok: !result.error && result.status === 0, output: !result.error && result.status === 0 ? String(result.stdout ?? '') : '' }
  }
  const os = check('/usr/bin/sw_vers', ['-productVersion'])
  const hardware = check('/usr/bin/uname', ['-m'])
  const xcode = check('/usr/bin/xcodebuild', ['-version'])
  const codeSigning = check('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'])
  const basic = check('/usr/bin/security', ['find-identity', '-v'])
  const certificateTeams = new Map()
  const prefixes = Object.values(certificateKinds).flat()
  const names = [...new Set([...identityNames(codeSigning.output), ...identityNames(basic.output)])]
    .filter(name => prefixes.some(prefix => name.startsWith(prefix)))
  for (const name of names) {
    if (certificateTeams.size >= 32) break
    const certificates = check('/usr/bin/security', ['find-certificate', '-a', '-c', name, '-p'])
    const teams = new Set()
    let uncertain = !certificates.ok
    for (const pem of certificates.output.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []) {
      try {
        const subject = parseCertificateSubject(pem)
        if (subject.CN === name && typeof subject.OU === 'string') teams.add(subject.OU)
        else uncertain = true
      } catch { uncertain = true }
    }
    // Names shared by multiple teams cannot identify one paired key without
    // additional native evidence; do not guess from the CN's trailing ID.
    certificateTeams.set(name, !uncertain && teams.size === 1 ? [...teams][0] : null)
  }
  const code = summarizeIdentities(codeSigning.output, teamId, certificateTeams)
  const installer = summarizeIdentities(basic.output, teamId, certificateTeams)
  return {
    schemaVersion: 1,
    platform,
    nodeArch: arch,
    hardwareArch: hardware.ok ? hardware.output.trim() : null,
    macOS: os.ok ? os.output.trim() : null,
    nodeVersion: process.version,
    xcode: xcode.ok ? xcode.output.trim() : null,
    signingKeychainChecks: { codesigningQuerySucceeded: codeSigning.ok, basicQuerySucceeded: basic.ok },
    matchingSigningIdentities: {
      development: codeSigning.ok ? code.development : null,
      applicationDistribution: codeSigning.ok ? code.applicationDistribution : null,
      installerDistribution: basic.ok ? installer.installerDistribution : null,
    },
    privateKeysExported: false,
    profilesVerified: false,
    sandboxRuntimeTested: false,
    submissionReady: false,
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 2 || args[0] !== '--team') throw new Error('Usage: node scripts/mac-app-store-environment.cjs --team TEAMID')
    console.log(JSON.stringify(collectEnvironment({ teamId: args[1] }), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { summarizeIdentities, collectEnvironment }
