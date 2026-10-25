const path = require('node:path')
const packageJson = require('../package.json')
const { MAS_ICON, prepareMasArtifacts } = require('./mac-app-store-artifacts.cjs')

// Preparation only: runtime sandbox acceptance is still required before submission.
function createConfig(environment) {
  const mode = environment.SCREENPLAY_MAS_MODE
  if (!['development', 'distribution'].includes(mode)) {
    throw new Error('Set SCREENPLAY_MAS_MODE to development or distribution explicitly.')
  }
  const teamId = environment.SCREENPLAY_MAS_TEAM_ID
  if (typeof teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error('SCREENPLAY_MAS_TEAM_ID must be the Apple Developer Team ID.')
  }
  const identity = environment.SCREENPLAY_MAS_SIGNING_IDENTITY
  const prefixes = mode === 'development'
    ? ['Apple Development:', 'Mac Developer:']
    : ['Apple Distribution:', '3rd Party Mac Developer Application:', 'Mac App Distribution:']
  if (typeof identity !== 'string' || identity.trim() !== identity || ['\r', '\n', '\0'].some(character => identity.includes(character))
    || !prefixes.some(prefix => identity.startsWith(prefix) && identity.slice(prefix.length).trim())) {
    throw new Error('SCREENPLAY_MAS_SIGNING_IDENTITY must be the actual matching certificate name, not its Team ID.')
  }
  const profile = environment.SCREENPLAY_MAS_PROFILE
  if (typeof profile !== 'string' || !path.posix.isAbsolute(profile) || profile.includes('\0')) {
    throw new Error('SCREENPLAY_MAS_PROFILE must be an absolute path on the build Mac.')
  }
  const buildNumber = environment.SCREENPLAY_MAS_BUILD_NUMBER
  if (typeof buildNumber !== 'string' || !/^[1-9][0-9]{0,3}(?:\.[0-9]{1,2}){0,2}$/.test(buildNumber)) {
    throw new Error('Set an explicit Apple-compatible SCREENPLAY_MAS_BUILD_NUMBER.')
  }
  const development = mode === 'development'
  const sandbox = {
    icon: MAS_ICON,
    // A development certificate CN can end in a person ID, not the Team ID.
    identity,
    provisioningProfile: profile,
    entitlements: 'build/entitlements.mas.plist',
    entitlementsInherit: 'build/entitlements.mas.inherit.plist',
    hardenedRuntime: false,
    notarize: false,
    preAutoEntitlements: true,
    strictVerify: true,
    type: development ? 'development' : 'distribution',
    bundleVersion: buildNumber,
    extendInfo: {
      ElectronTeamID: teamId,
      NSHumanReadableCopyright: `Copyright (c) 2026 ${packageJson.author}`,
    },
  }
  const build = structuredClone(packageJson.build)
  return {
    ...build,
    // Do not merge this file with the default package.json build configuration.
    extends: null,
    directories: { ...build.directories, output: `release/mac-app-store/${mode}` },
    forceCodeSigning: true,
    publish: null,
    afterPack: context => prepareMasArtifacts(context, profile),
    mac: {
      ...build.mac,
      ...sandbox,
      target: [{ target: development ? 'mas-dev' : 'mas', arch: ['universal'] }],
      artifactName: 'Screenplay-Studio-${version}-AppStore-${arch}.${ext}',
    },
    mas: { ...sandbox },
    masDev: { ...sandbox, type: 'development' },
  }
}

module.exports = () => createConfig(process.env)
module.exports.createConfig = createConfig
