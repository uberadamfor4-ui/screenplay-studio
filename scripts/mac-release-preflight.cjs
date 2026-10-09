const { execFileSync } = require('node:child_process')
const { accessSync, constants } = require('node:fs')
const { build } = require('../package.json')

try {
  if (process.platform !== 'darwin') throw new Error('macOS release packages must be built on macOS.')
  if (build.mac.identity !== '-' || build.mac.notarize !== false) {
    throw new Error('Mac packages must use explicit ad-hoc signing without notarization.')
  }
  for (const tool of ['/usr/bin/codesign', '/usr/bin/ditto', '/usr/bin/hdiutil', '/usr/bin/lipo', '/usr/sbin/spctl', '/usr/libexec/PlistBuddy']) {
    accessSync(tool, constants.X_OK)
  }
  execFileSync('/usr/bin/xcrun', ['--find', 'clang'], { encoding: 'utf8' })
  console.log('Native Mac build tools ready. Complete ad-hoc signing is required; no Apple account, certificate, or notarization is used. Gatekeeper approval is not guaranteed.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
