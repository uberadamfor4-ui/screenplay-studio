import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { Script } from 'node:vm'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml')
const source = readFileSync(new URL('../.github/workflows/mac-app-store-preflight.yml', import.meta.url), 'utf8')
const workflow = load(source)

test('isolated preflight only triggers on its branch and cannot publish or use secrets', () => {
  assert.deepEqual(workflow.on.push.branches, ['mac-app-store-preflight-20261024'])
  assert.deepEqual(workflow.on.push.paths, ['.github/workflows/mac-app-store-preflight.yml'])
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(workflow.jobs.environment['timeout-minutes'], 10)
  assert.ok(!source.includes('secrets.'))
  assert.ok(!source.includes('checkout@'))
  assert.ok(!source.includes('upload-artifact@'))
  assert.ok(!source.includes('security import'))
  assert.ok(!source.includes('GITHUB_TOKEN'))
})

test('preflight checks matching native architectures and does not claim app acceptance', () => {
  assert.deepEqual(workflow.jobs.environment.strategy.matrix.include, [
    { runner: 'macos-26-intel', arch: 'x64' },
    { runner: 'macos-26', arch: 'arm64' },
  ])
  const script = workflow.jobs.environment.steps[1].run
  assert.match(script, /process\.platform !== 'darwin'/)
  assert.match(script, /process\.arch !== process\.env\.EXPECTED_ARCH/)
  assert.match(script, /sandboxRuntimeTested: false/)
  assert.match(script, /uploadedToAppStore: false/)
  assert.match(script, /requires Xcode 26\+ and macOS SDK 26\+/)
  const javascript = script.slice(script.indexOf('\n') + 1, script.lastIndexOf('\nNODE'))
  assert.doesNotThrow(() => new Script(javascript))
})

test('embedded runner script rejects old, unknown or failed tool versions', () => {
  const shell = workflow.jobs.environment.steps[1].run
  const javascript = shell.slice(shell.indexOf('\n') + 1, shell.lastIndexOf('\nNODE'))
  const run = (xcode: string, sdk: string, status = 0) => {
    const reports: unknown[] = []
    new Script(javascript).runInNewContext({
      process: { platform: 'darwin', arch: 'x64', env: { EXPECTED_ARCH: 'x64', GITHUB_STEP_SUMMARY: '/synthetic/summary' } },
      console: { log: (text: string) => reports.push(JSON.parse(text)) },
      require: (name: string) => {
        if (name === 'node:fs') return { accessSync: () => {}, constants: { X_OK: 1 }, appendFileSync: () => {} }
        assert.equal(name, 'node:child_process')
        return { spawnSync: (command: string) => ({ status, stdout: command.endsWith('xcodebuild') ? xcode : command.endsWith('xcrun') ? sdk : '26.0' }) }
      },
    })
    return reports
  }
  assert.equal(run('Xcode 26.2\nBuild version Synthetic', '26.2').length, 1)
  for (const [xcode, sdk] of [['Xcode 16.4', '26.0'], ['Xcode 26.2', '15.5'], ['unknown', '26.0'], ['Xcode 26.2', 'unknown']]) {
    assert.throws(() => run(xcode, sdk))
  }
  assert.throws(() => run('Xcode 26.2', '26.2', 1))
})
