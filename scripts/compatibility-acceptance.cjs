const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),version=require('../package.json').version
const scales=process.platform==='win32'?['1','1.25','1.5','2']:['1','2']
const records=[]
for(const scale of scales){
 const result=spawnSync(process.execPath,[path.join(__dirname,'packaged-import-smoke.cjs')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,SCREENPLAY_IMPORT_SOURCE:'1',SCREENPLAY_FORCE_SCALE:scale,SCREENPLAY_IMPORT_PORT:'9361'}})
 if(result.status!==0){process.stderr.write(result.stdout||'');process.stderr.write(result.stderr||'');throw Error('Workflow compatibility failed at scale '+scale)}
 const report=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));if(!report.passed)throw Error('Missing passing workflow evidence')
 records.push({scale:Number(scale),environment:report.environment,display:report.display,output:report.output,passed:true})
 console.log(JSON.stringify({scale,passed:true}))
}
const report={passed:true,version,platform:process.platform,records,physicalDeviceAcceptance:'pending-user-declined-device-connection',brandKeyboardAcceptance:'pending',manualMacFirstLaunch:'pending',limitations:['Forced Chromium render scale is not a change to Windows display settings.','Native runtime automation is not manual acceptance on customer hardware.','No physical Android, third-party keyboard or Safari testing is claimed.']}
const out=process.env.SCREENPLAY_GATE_OUTPUT||path.join(root,'acceptance-results','compatibility-'+Date.now());fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'compatibility.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,version,records:records.length,output:out}))
