const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { sourceInventory } = require('./release-gate.cjs')
const root = path.resolve(__dirname, '..')
const coverage = [
  { id:'chinese-input', checks:['unit','input-focus','composition'], scope:'Synthetic IME composition events, atomic undo across candidate pauses, cancellation, ellipsis edits, paragraph changes, shortcuts and focus recovery; not a physical IME certification.' },
  { id:'long-project', checks:['long-project'], scope:'2,500-row bilingual draft, recovery and responsive editing.' },
  { id:'failed-save', checks:['unit','save-protection','recovery'], scope:'Injected persistence failures, continued editing, conflict refusal and independent copies; not a physical full-disk test.' },
  { id:'project-switch-undo', checks:['unit','workflow-compatibility','input-focus'], scope:'Delayed saves, document ownership, undo/redo, project handoff and original-preserving workflows.' },
  { id:'continuous-export', checks:['input-focus','workflow-compatibility','pdf'], scope:'PDF preview return, submission export round-trips, typography and reusable export readiness.' },
  { id:'overlay-upgrade-contract', checks:['unit'], scope:'Installer preservation and identity policy tests; native overlay installation requires a clean disposable Windows environment.' },
]
function validateStability(report) {
  if (!report || !['win32','darwin'].includes(report.platform) || report.sourceUnchanged !== true || !Array.isArray(report.checks)) return false
  const ids = new Set()
  for (const check of report.checks) {
    if (!check || ids.has(check.id) || check.passed !== true || check.exitCode !== 0) return false
    ids.add(check.id)
  }
  return ['unit','build','save-protection','recovery','input-focus','composition','long-project','workflow-compatibility','pdf'].every(id=>ids.has(id))
}
async function main() {
  if (!['win32','darwin'].includes(process.platform)) throw Error('Run desktop stability checks on Windows or macOS.')
  const version = require('../package.json').version
  const out = process.env.SCREENPLAY_STABILITY_OUTPUT || path.join(root,'acceptance-results','stability-'+Date.now())
  await fs.mkdir(out,{recursive:true})
  for (const name of ['input-focus-acceptance','long-project-acceptance','recovery-acceptance']) {
    const target = path.resolve(root,'tmp',name)
    if (!target.startsWith(path.resolve(root,'tmp')+path.sep)) throw Error('Unsafe isolated test profile')
  }
  const before=await sourceInventory(),npm=process.platform==='win32'?'npm.cmd':'npm',checks=[]
  const commands=[
    ['unit',npm,['test']],['build',npm,['run','build']],
    ...[['save-protection','protection-acceptance.cjs'],['recovery','recovery-acceptance.cjs'],['input-focus','input-focus-acceptance.cjs'],['composition','composition-acceptance.cjs'],['long-project','long-project-acceptance.cjs']].map(([id,file])=>[id,process.execPath,[require.resolve('electron/cli.js'),'scripts/'+file]]),
    ['workflow-compatibility',process.execPath,['scripts/compatibility-acceptance.cjs']],['pdf',npm,['run','test:pdf']],
  ]
  for (const [id,command,args] of commands) {
    const start=Date.now(),result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,shell:command===npm&&process.platform==='win32',timeout:600000,maxBuffer:16*1024*1024,env:{...process.env,SCREENPLAY_GATE_OUTPUT:out,SCREENPLAY_STRESS_ELEMENTS:'2500'}})
    await fs.writeFile(path.join(out,id+'.log'),(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:''))
    const check={id,passed:!result.error&&result.status===0,exitCode:result.status,durationMs:Date.now()-start};checks.push(check);console.log(JSON.stringify(check))
    if(!check.passed)break
  }
  const report={schema:1,version,platform:process.platform,arch:process.arch,checks,sourceUnchanged:JSON.stringify(before)===JSON.stringify(await sourceInventory()),coverage,completedAt:new Date().toISOString(),scope:'desktop-source-regression',nativeInstallerVerified:false,physicalImeVerified:false,physicalAndroidVerified:false,otherDesktopPlatformVerified:false,identity:'Source size and modification time comparison only; no cryptographic hashing.'}
  report.passed=validateStability(report)
  await fs.writeFile(path.join(out,'stability-gate.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,output:out,nativeInstallerVerified:false}))
  if(!report.passed)process.exitCode=1
}
module.exports={coverage,validateStability}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1})
