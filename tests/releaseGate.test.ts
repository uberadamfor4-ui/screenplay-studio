import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
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

test('Windows checkout line endings do not invalidate matching release documents', async () => {
  const root = path.resolve('tmp')
  await fs.mkdir(root, { recursive: true })
  const folder = await fs.mkdtemp(path.join(root, 'release-eol-'))
  try {
    const files = ['scripts/check-release-consistency.cjs','package.json','package-lock.json','mobile/package.json','mobile/package-lock.json','release-catalog.json','src/sample.ts','mobile/android/app/build.gradle','mobile/android/app/src/androidTest/java/studio/screenplay/writer/mobile/MobileAcceptanceTest.java','CURRENT_RELEASE.md']
    for (const file of files) {
      const target = path.join(folder, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      const text = await fs.readFile(file, 'utf8')
      await fs.writeFile(target, file === 'CURRENT_RELEASE.md' ? text.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n') : text)
    }
    const script = path.join(folder, 'scripts/check-release-consistency.cjs')
    assert.equal(spawnSync(process.execPath,[script]).status,0)
    await fs.appendFile(path.join(folder,'CURRENT_RELEASE.md'),'unexpected change')
    assert.notEqual(spawnSync(process.execPath,[script]).status,0)
  } finally {
    assert.ok(path.resolve(folder).startsWith(root + path.sep))
    await fs.rm(folder, { recursive: true, force: true })
  }
})
