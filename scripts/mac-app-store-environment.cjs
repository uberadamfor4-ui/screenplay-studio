const { spawnSync } = require('node:child_process')

const certificateKinds = {
  development: ['Apple Development:', 'Mac Developer:'],
  applicationDistribution: ['Apple Distribution:', '3rd Party Mac Developer Application:', 'Mac App Distribution:'],
  installerDistribution: ['3rd Party Mac Developer Installer:', 'Mac Installer Distribution:'],
}

function summarizeIdentities(output, teamId) {
  if (typeof teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error('An explicit Apple Developer Team ID is required.')
  }
  const names = String(output).split(/\r?\n/).flatMap(line => {
    const match = line.match(/"([^"\r\n]+)"/)
    return match && match[1].endsWith(`(${teamId})`) ? [match[1]] : []
  })
  return Object.fromEntries(Object.entries(certificateKinds).map(([kind, prefixes]) => [
    kind,
    names.some(name => prefixes.some(prefix => name.startsWith(prefix))),
  ]))
}

function collectEnvironment({ teamId, platform = process.platform, arch = process.arch, run = spawnSync }) {
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
  const code = summarizeIdentities(codeSigning.output, teamId)
  const installer = summarizeIdentities(basic.output, teamId)
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
