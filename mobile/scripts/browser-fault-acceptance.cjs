const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.2',results=[];

async function create(browser,native=true){
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 await context.addInitScript(({native})=>{
  const open=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(...args){if(window.__failStorage)throw new DOMException('Transient storage failure','QuotaExceededError');return open.apply(this,args)};
  window.__qa={recoveryFailures:0,exportMode:'success',exports:[],pngPages:[],finished:[]};
  if(!native)return;
  window.androidBridge={};let queue=Promise.resolve();
  const methods=['openDocument','loadRecovery','saveRecovery','saveDocument','exportPdf','choosePngFolder','writePngPage','finishPngFolder','backgroundApp'];
  window.Capacitor={PluginHeaders:[{name:'LocalDocuments',methods:methods.map(name=>({name,rtype:'promise'}))}],nativePromise:(_plugin,method,payload)=>{
   const task=queue.then(async()=>{
    const state=window.__qa;
    if(method==='openDocument')return state.importDocument||{canceled:true};
    if(method==='loadRecovery')return {content:localStorage.getItem('qa-recovery')||undefined};
    if(method==='saveRecovery'){
     if(state.recoveryFailures-->0)throw new Error('Injected recovery write failure');
     localStorage.setItem('qa-recovery',payload.content);return {};
    }
    if(method==='finishPngFolder'){state.finished.push(payload.token);return {}}
    if(state.exportMode==='fail')throw new Error('Injected export failure');
    if(state.exportMode==='cancel')return {canceled:true};
    if(method==='saveDocument'){state.exports.push(payload);return {canceled:false}}
    if(method==='choosePngFolder')return {canceled:false,token:'folder-'+state.finished.length};
    if(method==='writePngPage'){state.pngPages.push(payload);return {}}
    if(method==='exportPdf')return {canceled:false,openedPrintDialog:true};
    return {};
   });queue=task.catch(()=>undefined);return task;
  }};
 },{native});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
 return {context,page,errors,input:page.locator('textarea').first()};
}
async function saved(page){await page.waitForFunction(()=>document.querySelector('.document-title span').textContent==='已存至本机');await page.waitForTimeout(100)}
async function exporting(page,kind){if(!await page.getByRole('dialog').count()){await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'导出文件',exact:true}).click()}await page.getByRole('button',{name:kind,exact:true}).click();await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false')}
async function check(browser,name,action){if(process.env.ANDROID_FAULT_CASE&&process.env.ANDROID_FAULT_CASE!==name)return;let state;try{state=await create(browser);await action(state);assert.deepEqual(state.errors,[]);results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.log('FAIL '+name+': '+error.message)}finally{await state?.context.close()}}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  await check(browser,'native-import-save-indicator-settles-after-backup-race',async({page,input})=>{
   await input.fill('导入前原稿');await saved(page);
   const bytes=await fs.readFile(path.resolve(__dirname,'../../tests/fixtures/document-import/last-bus-final.ssproj'));
   await page.evaluate(data=>{window.__qa.importDocument={canceled:false,name:'保存状态验证.ssproj',data}},bytes.toString('base64'));
   await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'导入文件',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForTimeout(1600);
   assert.equal(await page.locator('.document-title span').innerText(),'已存至本机');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')).project.elements.length),43);
  });
  await check(browser,'slow-Chinese-composition-is-one-undo',async({page,input})=>{
   await input.fill('原文……');await saved(page);
   await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原文……zhong');x.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.waitForTimeout(1050);
   await input.evaluate(x=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原文……中文');x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}))});
   await page.waitForTimeout(80);await input.focus();await page.keyboard.press('Control+z');assert.equal(await input.inputValue(),'原文……');await page.keyboard.press('Control+Shift+z');assert.equal(await input.inputValue(),'原文……中文');
  });
  await check(browser,'transient-primary-save-retries-without-another-edit',async({page,input})=>{
   await input.fill('原先保存的中文');await saved(page);await page.evaluate(()=>window.__failStorage=true);await input.fill('临时失败后的最新中文……');await page.getByRole('alert').waitFor();
   await page.evaluate(()=>window.__failStorage=false);await page.waitForTimeout(4200);assert.equal(await page.locator('.document-title span').innerText(),'已存至本机');
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'临时失败后的最新中文……');
  });
  await check(browser,'final-input-after-compositionend-is-part-of-the-same-undo',async({page,input})=>{
   await input.fill('原稿');await saved(page);
   await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原稿pinyin');x.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.waitForTimeout(1000);
   await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原稿中文');x.dispatchEvent(new InputEvent('input',{bubbles:true,data:'中文',inputType:'insertFromComposition'}))});
   await page.waitForTimeout(80);await input.focus();await page.keyboard.press('Control+z');assert.equal(await input.inputValue(),'原稿');await page.keyboard.press('Control+Shift+z');assert.equal(await input.inputValue(),'原稿中文');
  });
  await check(browser,'canceled-composition-preserves-undo-and-redo',async({page,input})=>{
   await input.fill('取消选词前的中文');await saved(page);
   await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'取消选词前的中文pinyin');x.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.waitForTimeout(950);
   await input.evaluate(x=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'取消选词前的中文');x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}))});
   await page.waitForTimeout(80);await input.focus();await page.keyboard.press('Control+z');assert.equal(await input.inputValue(),'');await page.keyboard.press('Control+Shift+z');assert.equal(await input.inputValue(),'取消选词前的中文');
  });
  await check(browser,'blur-preserves-visible-composition-as-one-undo',async({page,input})=>{
   await input.fill('原有正文');await saved(page);
   await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原有正文中文候选');x.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.waitForTimeout(1000);await page.getByRole('button',{name:'功能',exact:true}).focus();assert.equal(await input.inputValue(),'原有正文中文候选');
   await input.focus();await page.keyboard.press('Control+z');assert.equal(await input.inputValue(),'原有正文');await page.keyboard.press('Control+Shift+z');assert.equal(await input.inputValue(),'原有正文中文候选');
  });
  await check(browser,'recovery-write-failure-is-retried',async({page,input})=>{
   await input.fill('恢复副本旧稿');await saved(page);await page.evaluate(()=>window.__qa.recoveryFailures=1);await input.fill('恢复副本最新中文……');await page.getByRole('alert').waitFor();await page.waitForTimeout(4200);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')).project.elements[0].text),'恢复副本最新中文……');
  });
  await check(browser,'undo-to-previously-rescued-text-writes-a-fresh-rescue',async({page,input})=>{
   await saved(page);await page.evaluate(()=>window.__failStorage=true);await input.fill('曾经抢救的中文甲');await page.getByRole('alert').waitFor();
   await page.waitForTimeout(900);await page.evaluate(()=>window.__failStorage=false);await input.fill('已正常保存的中文乙');await saved(page);
   await page.evaluate(()=>window.__failStorage=true);await input.focus();await page.keyboard.press('Control+z');assert.equal(await input.inputValue(),'曾经抢救的中文甲');await page.getByRole('alert').waitFor();
   const recovery=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')));assert.equal(recovery.project.elements[0].text,'曾经抢救的中文甲');assert.equal(recovery.recoveryPending,true);
  });
  await check(browser,'invalid-recovery-cannot-hide-valid-library-project',async({page,input})=>{
   await input.fill('有效本地正文，不得变成空白');await saved(page);
   await page.evaluate(()=>{const record=JSON.parse(localStorage.getItem('qa-recovery'));record.updatedAt='2099-01-01T00:00:00.000Z';record.project={title:'损坏的恢复文件'};localStorage.setItem('qa-recovery',JSON.stringify(record))});
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'有效本地正文，不得变成空白');
  });
  await check(browser,'old-recovery-with-future-clock-cannot-replace-newer-revision',async({page,input})=>{
   await input.fill('旧版本正文');await saved(page);const old=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')));
   await input.fill('新版本正文必须保留');await saved(page);old.updatedAt='2099-01-01T00:00:00.000Z';await page.evaluate(record=>localStorage.setItem('qa-recovery',JSON.stringify(record)),old);
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'新版本正文必须保留');
  });
  await check(browser,'canceled-export-does-not-claim-success',async({page,input})=>{
   await input.fill('中文导出取消测试');await saved(page);await exporting(page,'SSPROJ');assert.equal(await page.locator('.document-title span').innerText(),'已导出');await page.evaluate(()=>window.__qa.exportMode='cancel');await exporting(page,'SSPROJ');assert.equal(await page.locator('.document-title span').innerText(),'已取消导出');
  });
  await check(browser,'conflicting-pending-rescue-preserves-both-projects',async({page,input})=>{
   await input.fill('原稿版本一');await saved(page);const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')));
   await input.fill('数据库中较新的原稿');await saved(page);pending.recoveryPending=true;pending.project.elements[0].text='尚未成功入库的抢救正文';await page.evaluate(record=>localStorage.setItem('qa-recovery',JSON.stringify(record)),pending);
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'尚未成功入库的抢救正文');await page.waitForTimeout(1000);
   const records=await page.evaluate(async()=>{const store=await import('/src/storage.ts');return store.listRecords()});
   assert.equal(records.length,2);assert(records.some(x=>x.project.elements[0].text==='数据库中较新的原稿'));assert(records.some(x=>x.project.elements[0].text==='尚未成功入库的抢救正文'));
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'尚未成功入库的抢救正文');
  });
  await check(browser,'large-replacement-preflights-allocation-and-preserves-original',async({page,input})=>{
   await input.fill('甲'.repeat(6000));await saved(page);await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'查找与替换',exact:true}).click();await page.getByLabel('查找文字',{exact:true}).fill('甲');await page.getByLabel('替换为',{exact:true}).fill('乙'.repeat(1000));
   await page.evaluate(()=>{const split=String.prototype.split;String.prototype.split=function(separator,...args){if(separator==='甲'&&this.length>=6000)throw new Error('Unsafe expanded allocation attempted');return split.call(this,separator,...args)}});
   await page.getByRole('button',{name:'全部替换（可撤销）',exact:true}).click();await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('字符'));await page.getByRole('button',{name:'返回写作',exact:true}).click();assert.equal(await input.inputValue(),'甲'.repeat(6000));
  });
  await check(browser,'native-export-failure-and-cancel-release-editor',async({page,input})=>{
   await input.fill('中文失败后继续输入……');await saved(page);await page.evaluate(()=>window.__qa.exportMode='fail');await exporting(page,'PDF');assert.ok((await page.getByRole('alert').innerText()).includes('Injected export failure'));
   await page.getByRole('button',{name:'返回写作',exact:true}).click();await input.fill('失败以后仍可写作');await saved(page);await page.evaluate(()=>window.__qa.exportMode='cancel');await exporting(page,'PNG');await page.getByRole('button',{name:'返回写作',exact:true}).click();await input.fill('取消以后仍可写作');await saved(page);
   await page.evaluate(()=>window.__qa.exportMode='success');await exporting(page,'SSPROJ');const latest=await page.evaluate(()=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(window.__qa.exports.at(-1).data),c=>c.charCodeAt(0)))));assert.equal(latest.elements[0].text,'取消以后仍可写作');
  });
 }finally{await browser.close()}
 await fs.mkdir(out,{recursive:true});const report={passed:results.every(x=>x.passed),results};await fs.writeFile(path.join(out,process.env.ANDROID_FAULT_BASELINE?'fault-baseline.json':'fault-regression.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:results.length}));if(!report.passed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1});
