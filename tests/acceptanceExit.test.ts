import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import vm from 'node:vm'

test('long-project acceptance exits nonzero when setup fails', async () => {
  const exits: number[] = []
  const errors: unknown[] = []
  const failure = new Error('Intentional acceptance setup failure')
  const app = {
    setPath() {},
    quit: () => exits.push(0),
    exit: (code: number) => exits.push(code),
  }
  vm.runInNewContext(fs.readFileSync(new URL('../scripts/long-project-acceptance.cjs', import.meta.url), 'utf8'), {
    __dirname: path.resolve('scripts'),
    process: { env: {} },
    console: { error: (error: unknown) => errors.push(error) },
    require: (id: string) => {
      if (id === 'electron') return { app }
      if (id === 'node:fs/promises') return { rm: async () => { throw failure } }
      if (id === 'node:path') return path
      if (id === 'node:perf_hooks') return { performance }
      if (id === '../electron/inputGuards.cjs') return { installInputGuards() {} }
      throw new Error(`Unexpected acceptance dependency: ${id}`)
    },
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(errors, [failure])
  assert.deepEqual(exits, [1])
})
