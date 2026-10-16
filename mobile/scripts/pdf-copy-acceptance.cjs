const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.2';
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
 await page.getByRole('button',{name:'本地剧本',exact:true}).click();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'导入文件',exact:true}).click();await(await chooser).setFiles(path.resolve(__dirname,'../android/app/src/androidTest/assets/unicode-copy.ssproj'));await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'导出 PDF',exact:true}).click();const frame=page.locator('iframe');await frame.waitFor();
 const html=await frame.getAttribute('srcdoc');assert(html.includes('COPY-REGULAR'));const print=await browser.newPage();print.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.error(m.text())});await print.goto('http://127.0.0.1:5205/');await print.setContent(html,{waitUntil:'networkidle'});await print.evaluate(()=>document.fonts.ready);
 console.log(JSON.stringify(await print.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status})))));
 assert(await print.evaluate(()=>document.fonts.check('12px "Screenplay CJK"')));await print.pdf({path:out+'/unicode-copy-browser.pdf',preferCSSPageSize:true,printBackground:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,pdf:out+'/unicode-copy-browser.pdf',pageSections:await print.locator('.page').count(),consoleErrors:0}));
}finally{await browser.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
