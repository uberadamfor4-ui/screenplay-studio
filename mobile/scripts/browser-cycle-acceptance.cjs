const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.4',results=[];
const fixture=path.resolve(__dirname,'../../tests/fixtures/document-import/last-bus-final.ssproj');
async function create(browser){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
  const open=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(...args){
   const request=open.apply(this,args),add=request.addEventListener,delay=window.__dbDelay||0,hang=window.__hangDb;
   request.addEventListener=function(type,listener,options){if(hang&&type==='success')return;return add.call(this,type,delay&&type==='success'&&typeof listener==='function'?event=>setTimeout(()=>listener.call(this,event),delay):listener,options)};
   return request;
  };
  window.__qa={exports:[],delay:0,recoveryWrites:0};window.androidBridge={};let queue=Promise.resolve();
  const methods=['loadRecovery','saveRecovery','openDocument','saveDocument','exportPdf','backgroundApp'];
  window.Capacitor={PluginHeaders:[{name:'LocalDocuments',methods:methods.map(name=>({name,rtype:'promise'}))}],nativePromise:(_plugin,method,payload)=>{
   const next=queue.then(async()=>{
    await new Promise(resolve=>setTimeout(resolve,window.__qa.delay));
    if(method==='loadRecovery')return {content:localStorage.getItem('qa-cycle-recovery')||undefined};
    if(method==='saveRecovery'){window.__qa.recoveryWrites++;localStorage.setItem('qa-cycle-recovery',payload.content);return {}}
    if(method==='openDocument')return window.__qa.input||{canceled:true};
    if(method==='saveDocument'||method==='exportPdf'){if(window.__qa.failExport)throw new Error('Injected export failure');if(window.__qa.cancelExport)return {canceled:true};window.__qa.exports.push({method,...payload});return {canceled:false,openedPrintDialog:method==='exportPdf'}}
    return {};
   });queue=next.catch(()=>undefined);return next;
  }};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
 return {context,page,errors,input:page.locator('textarea').first()};
}
async function settled(page){await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false'&&!document.querySelector('textarea').readOnly)}
async function saved(page){await page.waitForFunction(()=>document.querySelector('.document-title span').textContent==='已存至本机');await page.waitForTimeout(80)}
async function importProject(page,title,text){
 const project=JSON.parse(await fs.readFile(fixture,'utf8'));project.title=title;project.elements=[{id:'shared-element',type:'action',text}];
 await page.evaluate(data=>window.__qa.input={canceled:false,name:'cycle.ssproj',data},Buffer.from(JSON.stringify(project)).toString('base64'));
 await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'导入文件',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await settled(page);
}
async function records(page){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('screenplay-mobile-library',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}})}
async function check(browser,name,action){if(process.env.ANDROID_CYCLE_CASE&&process.env.ANDROID_CYCLE_CASE!==name)return;let state;try{state=await create(browser);await action(state);assert.deepEqual(state.errors,[]);results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.log('FAIL '+name+': '+error.message)}finally{await state?.context.close()}}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  await check(browser,'late-IME-during-project-activation-remains-in-original-project',async({page,input})=>{
   await importProject(page,'项目 A','A 原稿');await saved(page);await page.evaluate(()=>window.__dbDelay=550);
   await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'新建剧本',exact:true}).click();await page.waitForTimeout(170);
   await input.evaluate(x=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'A 最后提交的中文……');x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文……'}))});
   await settled(page);await page.evaluate(()=>window.__dbDelay=0);await page.waitForTimeout(1200);
   const all=await records(page);assert.equal(all.find(x=>x.project.title==='项目 A').project.elements[0].text,'A 最后提交的中文……');assert.equal(await input.inputValue(),'');
  });
  await check(browser,'first-edit-after-switching-same-paragraph-ids-has-undo',async({page,input})=>{
   await importProject(page,'项目 A','A 原稿');await input.fill('A 最新稿');await importProject(page,'项目 B','B 原稿');await input.fill('B 最新稿');
   assert.equal(await page.getByRole('button',{name:'撤销',exact:true}).isEnabled(),true);await input.press('Control+z');assert.equal(await input.inputValue(),'B 原稿');
  });
  await check(browser,'reopening-active-project-does-not-install-a-stale-library-snapshot',async({page,input})=>{
   await importProject(page,'项目 A','A 原稿');await saved(page);await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.locator('.library-row button').filter({hasText:'项目 A'}).first().waitFor();await page.evaluate(()=>window.__dbDelay=500);
   await page.locator('.library-row button').filter({hasText:'项目 A'}).first().click();await page.waitForTimeout(160);await input.evaluate(x=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'同一项目迟到的中文……');x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文……'}))});
   await settled(page);await page.evaluate(()=>window.__dbDelay=0);await page.waitForTimeout(1700);assert.equal(await input.inputValue(),'同一项目迟到的中文……');assert.equal((await records(page)).find(x=>x.project.title==='项目 A').project.elements[0].text,'同一项目迟到的中文……');
  });
  await check(browser,'hung-primary-store-releases-operation-and-retries-after-recovery',async({page,input})=>{
   await input.fill('数据库挂起前的最新稿……');await page.evaluate(()=>{window.__hangDb=true;window.dispatchEvent(new Event('android-background'))});await page.waitForTimeout(120);
   await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'新建剧本',exact:true}).click();await page.waitForTimeout(250);await page.evaluate(()=>window.__hangDb=false);
   await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false',{},{timeout:13000});assert.equal(await input.inputValue(),'数据库挂起前的最新稿……');
   await page.getByRole('button',{name:'返回写作',exact:true}).click();await saved(page);await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'数据库挂起前的最新稿……');
  });
  await check(browser,'twenty-interleaved-switch-background-export-cycles-keep-all-drafts',async({page,input})=>{
   const expected=new Map();for(const name of ['项目 A','项目 B','项目 C']){await importProject(page,name,name+' 原稿');expected.set(name,name+' 原稿')}
   await saved(page);await page.evaluate(()=>{window.__dbDelay=70;window.__qa.delay=15});
   for(let round=0;round<20;round++){
    const name=['项目 A','项目 B','项目 C'][round%3];await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.locator('.library-row button').filter({hasText:name}).first().click();await page.getByRole('dialog').waitFor({state:'hidden'});await settled(page);assert.equal(await input.inputValue(),expected.get(name));
    const text=`${name} 第 ${round} 轮 中文…… English 日本語 한국어`;expected.set(name,text);await input.fill(text);
    await page.evaluate(()=>{for(let i=0;i<3;i++){window.dispatchEvent(new Event('android-background'));window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('android-foreground'))}});
    for(const kind of ['SSPROJ','TXT','FDX','PDF']){
     if(kind==='PDF')await page.getByRole('button',{name:'导出 PDF',exact:true}).click();else{await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'导出文件',exact:true}).click();await page.getByRole('button',{name:kind,exact:true}).click()}
     await settled(page);const exported=await page.evaluate(()=>window.__qa.exports.at(-1));if(kind==='SSPROJ')assert.equal(JSON.parse(Buffer.from(exported.data,'base64').toString()).elements[0].text,text);else if(kind==='PDF')assert(exported.html.includes(text));else assert(Buffer.from(exported.data,'base64').toString().includes(text));
     if(kind!=='PDF')await page.getByRole('button',{name:'返回写作',exact:true}).click();
    }
    if(round%4===0){await page.evaluate(()=>window.__qa.cancelExport=true);await page.getByRole('button',{name:'导出 PDF',exact:true}).click();await settled(page);await page.evaluate(()=>{window.__qa.cancelExport=false;window.__qa.failExport=true});await page.getByRole('button',{name:'导出 PDF',exact:true}).click();await settled(page);await page.evaluate(()=>window.__qa.failExport=false);assert.equal(await input.isEditable(),true)}
    if(round%5===0){await page.evaluate(()=>{window.dispatchEvent(new Event('android-back'));window.dispatchEvent(new Event('android-background'));window.dispatchEvent(new Event('android-foreground'))});await settled(page)}
   }
   await page.evaluate(()=>{window.__dbDelay=0;window.__qa.delay=0;window.dispatchEvent(new Event('android-background'))});
   await page.waitForFunction(expected=>{const rescue=JSON.parse(localStorage.getItem('qa-cycle-recovery'));return rescue&&!rescue.recoveryPending&&rescue.project.title===expected[0]&&rescue.project.elements[0].text===expected[1]},['项目 B',expected.get('项目 B')]);
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();
   const all=await records(page);for(const [title,text]of expected)assert.equal(all.find(x=>x.project.title===title).project.elements[0].text,text);assert.equal(await page.locator('.document-title strong').innerText(),'项目 B');assert.equal(await input.inputValue(),expected.get('项目 B'));
  });
  await check(browser,'repeated-export-clicks-share-the-operation-lock',async({page,input})=>{
   await input.fill('重复点击只能导出一次……');await saved(page);await page.evaluate(()=>{window.__qa.delay=250;const button=document.querySelector('button[aria-label="导出 PDF"]');for(let i=0;i<6;i++)button.click()});await settled(page);assert.equal(await page.evaluate(()=>window.__qa.exports.length),1);await input.fill('导出之后继续写');await saved(page);await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'导出之后继续写');
  });
  await check(browser,'completed-write-with-missing-completion-event-can-retry-without-false-conflict',async({page,input})=>{
   await input.fill('事务测试原稿');await saved(page);
   await page.evaluate(()=>{const transaction=IDBDatabase.prototype.transaction;window.__dropComplete=true;IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(window.__dropComplete&&args[1]==='readwrite'){window.__dropComplete=false;const add=tx.addEventListener;tx.addEventListener=function(type,listener,options){if(type==='complete')return;return add.call(this,type,listener,options)}}return tx}});
   await input.fill('已经提交但回调迟到的最新稿……');await page.evaluate(()=>window.dispatchEvent(new Event('android-background')));await page.waitForTimeout(13500);
   assert.equal(await page.locator('.document-title span').innerText(),'已存至本机');await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'已经提交但回调迟到的最新稿……');
  });
  await check(browser,'uncertain-write-does-not-overwrite-a-genuinely-newer-external-draft',async({page,input})=>{
   await input.fill('冲突检查原稿');await saved(page);
   await page.evaluate(()=>{const transaction=IDBDatabase.prototype.transaction;window.__dropComplete=true;IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(window.__dropComplete&&args[1]==='readwrite'){window.__dropComplete=false;const add=tx.addEventListener;tx.addEventListener=function(type,listener,options){if(type==='complete')return;return add.call(this,type,listener,options)}}return tx}});
   await input.fill('本窗口未确认的文字');await page.evaluate(()=>window.dispatchEvent(new Event('android-background')));await page.waitForTimeout(200);
   await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('screenplay-mobile-library',1);r.onsuccess=()=>resolve(r.result)});const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects'),all=store.getAll();all.onsuccess=()=>{const row=all.result.find(x=>x.project.elements[0].text==='本窗口未确认的文字');row.project.elements[0].text='另一个窗口更新的稿件';row.revision++;row.updatedAt=new Date().toISOString();store.put(row)};await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=reject});db.close()});
   await page.waitForFunction(()=>document.querySelector('[role=alert]')?.textContent.includes('另一窗口'),{},{timeout:16000});assert.equal(await input.inputValue(),'本窗口未确认的文字');assert((await records(page)).some(x=>x.project.elements[0].text==='另一个窗口更新的稿件'));
  });
  await check(browser,'selecting-the-current-project-closes-library-without-waiting-on-autosave',async({page,input})=>{
   await importProject(page,'项目 A','当前项目原稿');await saved(page);await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.locator('.library-row button').filter({hasText:'项目 A'}).first().waitFor();
   await input.evaluate(x=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'当前项目仍能继续写……');x.dispatchEvent(new InputEvent('input',{bubbles:true}))});await page.evaluate(()=>{window.__hangDb=true;window.dispatchEvent(new Event('android-background'))});
   await page.locator('.library-row button').filter({hasText:'项目 A'}).first().click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:500});assert.equal(await input.inputValue(),'当前项目仍能继续写……');assert.equal(await input.isEditable(),true);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-cycle-recovery')).project.elements[0].text),'当前项目仍能继续写……');
  });
 }finally{await browser.close()}
 await fs.mkdir(out,{recursive:true});const report={passed:results.every(x=>x.passed),results};await fs.writeFile(path.join(out,process.env.ANDROID_CYCLE_REPORT_FILENAME||(process.env.ANDROID_CYCLE_BASELINE?'cycle-baseline.json':'cycle-regression.json')),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:results.length}));if(!report.passed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1});
