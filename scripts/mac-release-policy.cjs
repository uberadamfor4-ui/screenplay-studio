function assertBundleSignature(details, expectedIdentifier) {
  const identifier = /^Identifier=(.+)\r?$/m.exec(details)?.[1].trim()
  const sealedFiles = Number(/^Sealed Resources version=2 rules=\d+ files=(\d+)\r?$/m.exec(details)?.[1] || 0)
  if (!/^Signature=adhoc\r?$/m.test(details)
    || identifier !== expectedIdentifier
    || sealedFiles < 1
    || !/\bflags=0x[\da-f]+\([^)]*\bruntime\b[^)]*\)/i.test(details)) {
    throw new Error('Mac app requires a complete ad-hoc bundle signature, the expected bundle identifier, sealed resources, and Hardened Runtime. Linker-only signatures are insufficient.')
  }
}

function assessGatekeeper(result) {
  if (result.error || ![0, 3].includes(result.status)) {
    return { status: 'inconclusive', exitCode: result.status, diagnostic: result.error?.message || result.stderr || result.stdout || '' }
  }
  return { status: result.status === 0 ? 'accepted-on-test-machine' : 'rejected', exitCode: result.status, diagnostic: `${result.stdout || ''}\n${result.stderr || ''}`.trim() }
}

module.exports = { assertBundleSignature, assessGatekeeper }
