import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const workflow = require('js-yaml').load(readFileSync(new URL('../.github/workflows/mac-app-store-signing-readiness.yml', import.meta.url), 'utf8'))
const step = workflow.jobs.presence.steps[0]

test('signing presence check exposes only boolean expressions, never signing values', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(workflow.on.push.branches, ['mac-app-store-preflight-20261024'])
  for (const expression of Object.values(step.env)) {
    assert.match(String(expression), /^\$\{\{ secrets\.\w+ != '' \|\| secrets\.\w+ != '' \}\}$/)
  }
  assert.equal(workflow.jobs.presence.steps.length, 1)
  assert.ok(!step.run.includes('writeFile'))
  assert.ok(!step.run.includes('process.env)'))
})

test('unknown presence flags fail instead of claiming credentials ready', () => {
  const javascript = step.run.slice(step.run.indexOf('\n') + 1, step.run.lastIndexOf('\nNODE'))
  const env = Object.fromEntries(Object.keys(step.env).map(key => [key, 'false']))
  const run = (environment: Record<string, string>) => {
    let report: { signingReady: boolean; configured: Record<string, boolean> } | undefined
    new Script(javascript).runInNewContext({ process: { env: environment }, console: { log: (value: string) => { report = JSON.parse(value) } } })
    return report!
  }
  assert.equal(run(env).signingReady, false)
  assert.ok(Object.values(run(env).configured).every(value => value === false))
  assert.throws(() => run({ ...env, APPLICATION_CERTIFICATE: 'opaque-secret-must-not-be-accepted' }))
  assert.equal(run({ ...env, APPLICATION_CERTIFICATE: 'true' }).signingReady, false)
})
