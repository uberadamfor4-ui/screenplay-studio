const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.5',results=[];
async function create(browser){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
  const open=IDBFactory.prototype.open,put=IDBObjectStore.prototype.put;
  IDBFactory.prototype.open=function(...args){if(sessionStorage.getItem('unreadable'))throw new Error('Injected unreadable library');return open.apply(this,args)};
  IDBObjectStore.prototype.put=function(...args){if(sessionStorage.getItem('full'))throw new DOMException('Injected disk full','QuotaExceededError');return put.apply(this,args)};
  window.androidBridge={};window.__qa={};let queue=Promise.resolve();
  const methods=['loadRecovery','saveRecovery','saveDocument','backgroundApp'];
  window.Capacitor={PluginHeaders:[{name:'LocalDocuments',methods:methods.map(name=>({name,rtype:'promise'}))}],nativePromise:(_plugin,method,payload)=>{
   const task=queue.then(()=>{if(method==='loadRecovery')return {content:localStorage.getItem('rescue')||undefined};if(method==='saveRecovery'){if(sessionStorage.getItem('backupFull'))throw new Error('Injected ENOSPC');localStorage.setItem('rescue',payload.content)}if(method==='saveDocument'){window.__qa.export=payload;return {canceled:false}}return {}});queue=task.catch(()=>undefined);return task;
  }};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
 return {context,page,errors,input:page.locator('textarea').first()};
}
async function saved(page){await page.waitForFunction(()=>document.querySelector('.document-title span').textContent==='已存至本机');await page.waitForTimeout(100)}
async function recovery(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('rescue')))}
async function records(page){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=IDBFactory.prototype.open.call(indexedDB,'screenplay-mobile-library',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}})}
async function reload(page){await page.reload();await page.locator('textarea').first().waitFor();await page.waitForFunction(()=>document.querySelector('main')&&document.querySelector('[role=alert]')||!document.querySelector('textarea').readOnly);await page.waitForTimeout(200)}
async function check(browser,name,action){let s;try{s=await create(browser);await action(s);assert.deepEqual(s.errors,[]);results.push({name,passed:true});console.log('PASS '+name)}catch(e){results.push({name,passed:false,error:e.stack});console.log('FAIL '+name+': '+e.message)}finally{await s?.context.close()}}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 await check(browser,'stale-backup-and-full-disk-must-not-hide-newer-primary',async({page,input})=>{
  await input.fill('旧副本');await saved(page);const stale=await recovery(page);await input.fill('当前原稿必须显示');await saved(page);
  await page.evaluate(stale=>{localStorage.setItem('rescue',JSON.stringify(stale));sessionStorage.setItem('full','1')},stale);await reload(page);assert.equal(await input.inputValue(),'当前原稿必须显示');
 });
 await check(browser,'full-disk-pending-recovery-keeps-original-id-and-retries-once',async({page,input})=>{
  await input.fill('原稿');await saved(page);const pending=await recovery(page);pending.recoveryPending=true;pending.project.elements[0].text='进程回收前最后输入……';
  await page.evaluate(p=>{localStorage.setItem('rescue',JSON.stringify(p));sessionStorage.setItem('full','1')},pending);await reload(page);assert.equal(await input.inputValue(),pending.project.elements[0].text);assert.equal((await recovery(page)).id,pending.id);assert.equal((await records(page)).length,1);
  await page.evaluate(()=>sessionStorage.removeItem('full'));await saved(page);const all=await records(page);assert.equal(all.length,1);assert.equal(all[0].id,pending.id);assert.equal(all[0].project.elements[0].text,pending.project.elements[0].text);
 });
 await check(browser,'ignored-stale-backup-cannot-resurrect-deleted-project-on-write-failure',async({page,input})=>{
  await input.fill('已经主动删除的稿件');await saved(page);await page.evaluate(async()=>{const store=await import('/src/storage.ts'),all=await store.listRecords();await store.saveRecord({...all[0],deletedAt:new Date().toISOString()});sessionStorage.setItem('full','1')});await reload(page);assert.notEqual(await input.inputValue(),'已经主动删除的稿件');
 });
 await check(browser,'unreadable-library-never-overwrites-backup-or-creates-a-copy',async({page,input})=>{
  await input.fill('唯一的恢复稿');await saved(page);const before=await recovery(page);await page.evaluate(()=>sessionStorage.setItem('unreadable','1'));await reload(page);await page.waitForTimeout(1100);assert.deepEqual(await recovery(page),before);assert.equal(await input.isEditable(),false);
  await page.evaluate(()=>sessionStorage.removeItem('unreadable'));await page.getByRole('button',{name:'重试读取',exact:true}).click();await saved(page);assert.equal(await input.inputValue(),'唯一的恢复稿');assert.equal((await records(page)).length,1);
 });
 await check(browser,'background-flushes-visible-composition-before-checkpoint',async({page,input})=>{
  await input.fill('锁屏前原稿');await saved(page);await input.focus();await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'锁屏前最后的中文……');window.dispatchEvent(new Event('android-background'))});await page.waitForTimeout(250);assert.equal((await recovery(page)).project.elements[0].text,'锁屏前最后的中文……');await reload(page);assert.equal(await input.inputValue(),'锁屏前最后的中文……');
 });
 await check(browser,'primary-and-backup-full-never-claim-saved-and-recover-after-space-freed',async({page,input})=>{
  await input.fill('落盘旧稿');await saved(page);const before=await recovery(page);await page.evaluate(()=>{sessionStorage.setItem('full','1');sessionStorage.setItem('backupFull','1')});await input.fill('内存最新稿不得谎报');await page.evaluate(()=>window.dispatchEvent(new Event('android-background')));await page.getByRole('alert').waitFor();assert.notEqual(await page.locator('.document-title span').innerText(),'已存至本机');assert.deepEqual(await recovery(page),before);assert.equal((await records(page))[0].project.elements[0].text,'落盘旧稿');
  await page.evaluate(()=>{sessionStorage.removeItem('full');sessionStorage.removeItem('backupFull')});await saved(page);await reload(page);assert.equal(await input.inputValue(),'内存最新稿不得谎报');
 });
 await check(browser,'pending-conflict-under-full-disk-preserves-both-drafts',async({page,input})=>{
  await input.fill('原稿一');await saved(page);const pending=await recovery(page);pending.recoveryPending=true;pending.project.elements[0].text='待恢复稿';await input.fill('数据库中更新的稿');await saved(page);const original=(await records(page))[0];
  await page.evaluate(p=>{localStorage.setItem('rescue',JSON.stringify(p));sessionStorage.setItem('full','1')},pending);await reload(page);assert.equal(await input.inputValue(),'待恢复稿');assert.equal((await records(page))[0].project.elements[0].text,'数据库中更新的稿');await page.evaluate(()=>sessionStorage.removeItem('full'));await saved(page);const all=await records(page);assert.equal(all.length,2);assert.equal(all.find(x=>x.id===original.id).project.elements[0].text,'数据库中更新的稿');assert(all.some(x=>x.project.title.endsWith('(恢复副本)')&&x.project.elements[0].text==='待恢复稿'));
 });
 }finally{await browser.close()}await fs.mkdir(out,{recursive:true});const report={passed:results.every(x=>x.passed),results};await fs.writeFile(path.join(out,process.env.ANDROID_SURVIVAL_BASELINE?'survival-baseline.json':'survival-regression.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:results.length}));if(!report.passed)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
