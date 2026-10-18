const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const desktopChecks = ['release-consistency', 'lint', 'unit', 'build', 'save-protection', 'recovery', 'writing-tools', 'input-focus', 'long-project', 'pdf']
function validateEvidence(report, platform, version) {
  return report.platform === platform && report.version === version && report.sourceUnchanged === true
    && desktopChecks.every(id => report.checks.some(check => check.id === id && check.exitCode === 0 && check.passed === true))
}
async function sourceInventory() {
  const entries = []
  for (const dir of ['src', 'electron', 'scripts', 'tests', 'build', 'mobile/src', 'mobile/android/app/src', '.github/workflows']) {
    for (const relative of await fs.readdir(path.join(root, dir), { recursive: true })) {
      const file = path.join(root, dir, relative), stat = await fs.stat(file)
      if (stat.isFile()) entries.push({ file: path.relative(root, file).replaceAll('\\', '/'), bytes: stat.size, modified: stat.mtimeMs })
    }
  }
  for (const file of ['package.json', 'package-lock.json', 'mobile/package.json', 'mobile/package-lock.json', 'mobile/android/app/build.gradle', 'release-catalog.json', 'CURRENT_RELEASE.md']) {
    const stat = await fs.stat(path.join(root, file)); entries.push({ file, bytes: stat.size, modified: stat.mtimeMs })
  }
  return entries.sort((a,b)=>a.file.localeCompare(b.file))
}
async function main() {
  if (!['win32', 'darwin'].includes(process.platform)) throw Error('Desktop release gate must run on Windows or macOS; Android requires its native instrumented workflow.')
  const version = require('../package.json').version
  const out = process.env.SCREENPLAY_GATE_OUTPUT || path.join(process.platform === 'win32' ? 'D:/ScreenplayStudio-QA' : path.join(root,'acceptance-results'), `release-gate-${version}-${process.platform}-${process.arch}-${Date.now()}`)
  await fs.mkdir(out, { recursive: true })
  const before = await sourceInventory(), checks = []
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const commands = [
    ['release-consistency',process.execPath,['scripts/check-release-consistency.cjs']],
    ['lint', npm, ['run','lint']], ['unit', npm, ['test']], ['build', npm, ['run','build']],
    ...[['save-protection','protection-acceptance.cjs'],['recovery','recovery-acceptance.cjs'],['writing-tools','writing-tools-acceptance.cjs'],['input-focus','input-focus-acceptance.cjs'],['long-project','long-project-acceptance.cjs']].map(([id,script])=>[id,process.execPath,[require.resolve('electron/cli.js'),path.join('scripts',script)]]),
    ['pdf',npm,['run','test:pdf']],
  ]
  for (const [id, command, args] of commands) {
    const started = Date.now()
    const result = spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,shell:command===npm&&process.platform==='win32',timeout:600000,maxBuffer:16*1024*1024,env:{...process.env,SCREENPLAY_GATE_OUTPUT:out}})
    await fs.writeFile(path.join(out,id+'.log'),(result.stdout||'')+(result.stderr||''))
    const check={id,passed:!result.error&&result.status===0,exitCode:result.status,durationMs:Date.now()-started}
    checks.push(check);console.log(JSON.stringify(check))
    if(!check.passed)break
  }
  const sourceUnchanged = JSON.stringify(before) === JSON.stringify(await sourceInventory())
  const report = {schema:1,version,platform:process.platform,arch:process.arch,scope:'desktop-source-regression',checks,sourceUnchanged,source:before,installerVerified:false,identityMethod:'Byte sizes and modification times only; no cryptographic identity guarantee.',completedAt:new Date().toISOString()}
  report.passed=validateEvidence(report,process.platform,version)
  await fs.writeFile(path.join(out,'release-gate.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:report.passed,output:out,installerVerified:false}))
  if(!report.passed)process.exitCode=1
}
module.exports={validateEvidence,desktopChecks}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1})
