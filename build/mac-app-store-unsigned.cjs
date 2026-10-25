const packageJson = require('../package.json')
const { MAS_ICON, prepareMasArtifacts } = require('./mac-app-store-artifacts.cjs')

function createConfig(environment) {
  if (environment.SCREENPLAY_MAS_UNSIGNED_QA !== '1') throw new Error('Unsigned MAS packaging requires an explicit QA-only opt-in.')
  const base = structuredClone(packageJson.build)
  const options = {
    icon: MAS_ICON,
    identity: null,
    forceCodeSigning: false,
    type: 'development',
    hardenedRuntime: false,
    notarize: false,
    entitlements: 'build/entitlements.mas.plist',
    entitlementsInherit: 'build/entitlements.mas.inherit.plist',
  }
  return {
    ...base,
    extends: null,
    directories: { ...base.directories, output: 'release/mac-app-store/unsigned-arm64' },
    forceCodeSigning: false,
    publish: null,
    afterPack: context => prepareMasArtifacts(context),
    mac: { ...base.mac, ...options, target: [{ target: 'mas-dev', arch: ['arm64'] }] },
    mas: { ...options },
    masDev: { ...options },
  }
}

module.exports = () => createConfig(process.env)
module.exports.createConfig = createConfig
