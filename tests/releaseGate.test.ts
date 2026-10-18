import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { validateEvidence, desktopChecks } = createRequire(import.meta.url)('../scripts/release-gate.cjs')
test('release evidence cannot pass with missing, failed, stale or other-platform checks', () => {
  const report = { platform: 'win32', version: '0.7.3', sourceUnchanged: true, checks: desktopChecks.map((id: string) => ({ id, passed: true, exitCode: 0 })) }
  assert.equal(validateEvidence(report,'win32','0.7.3'),true)
  assert.equal(validateEvidence(report,'darwin','0.7.3'),false)
  assert.equal(validateEvidence(report,'win32','0.7.4'),false)
  assert.equal(validateEvidence({...report,sourceUnchanged:false},'win32','0.7.3'),false)
  assert.equal(validateEvidence({...report,checks:report.checks.slice(1)},'win32','0.7.3'),false)
  assert.equal(validateEvidence({...report,checks:report.checks.map((c: {id: string})=>({...c,passed:false,exitCode:1}))},'win32','0.7.3'),false)
})
