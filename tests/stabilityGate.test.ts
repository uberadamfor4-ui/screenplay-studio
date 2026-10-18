import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {validateStability,coverage}=createRequire(import.meta.url)('../scripts/stability-gate.cjs')
test('stability gate requires every risk suite and never ignores duplicate or failed evidence',()=>{
  const report={platform:'win32',sourceUnchanged:true,checks:['unit','build','save-protection','recovery','input-focus','composition','long-project','workflow-compatibility','pdf'].map(id=>({id,passed:true,exitCode:0}))}
  assert.equal(validateStability(report),true)
  assert.equal(validateStability({...report,checks:report.checks.slice(1)}),false)
  assert.equal(validateStability({...report,checks:[...report.checks,report.checks[0]]}),false)
  assert.equal(validateStability({...report,checks:[...report.checks,{id:'extra',passed:false,exitCode:1}]}),false)
  assert.equal(validateStability({...report,sourceUnchanged:false}),false)
  assert.equal(validateStability(null),false)
  assert.equal(coverage.length,6)
  assert.ok(coverage.every((risk:{checks:string[]})=>risk.checks.every(id=>report.checks.some(c=>c.id===id))))
})
