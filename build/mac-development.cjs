const { build } = require('../package.json')

module.exports = {
  ...build,
  appId: `${build.appId}.development`,
  productName: `${build.productName} Development`,
  directories: { ...build.directories, output: 'release/mac-development' },
  mac: {
    ...build.mac,
    identity: '-',
    notarize: false,
    artifactName: 'Screenplay-Studio-${version}-${arch}-development.${ext}',
  },
  dmg: {
    ...build.dmg,
    title: 'Screenplay Studio ${version} Development',
    artifactName: 'Screenplay-Studio-${version}-${arch}-development.${ext}',
  },
}
