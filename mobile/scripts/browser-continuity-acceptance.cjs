const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.3',results=[];

async function create(browser){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
  const open=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(...args){
   const request=open.apply(this,args),add=request.addEventListener,delay=window.__dbDelay||0,hang=window.__hangDb;
   request.addEventListener=function(type,listener,options){if(hang&&type==='success')return;return add.call(this,type,delay&&type==='success'&&typeof listener==='function'?event=>setTimeout(()=>listener.call(this,event),delay):listener,options)};
   return request;
  };
  window.__qa={exports:[],exportDelay:0,recoveryWrites:0};window.androidBridge={};let queue=Promise.resolve();
  const methods=['loadRecovery','saveRecovery','openDocument','saveDocument','exportPdf','backgroundApp'];
  window.Capacitor={PluginHeaders:[{name:'LocalDocuments',methods:methods.map(name=>({name,rtype:'promise'}))}],nativePromise:(_plugin,method,payload)=>{
   const next=queue.then(async()=>{
    if(method==='loadRecovery')return {content:localStorage.getItem('qa-recovery')||undefined};
    if(method==='saveRecovery'){window.__qa.recoveryWrites++;localStorage.setItem('qa-recovery',payload.content);return {}}
    if(method==='openDocument')return window.__qa.input||{canceled:true};
    if(method==='saveDocument'||method==='exportPdf'){await new Promise(resolve=>setTimeout(resolve,window.__qa.exportDelay));if(window.__qa.exportFail)throw new Error('Injected export failure');window.__qa.exports.push({method,...payload});return {canceled:!!window.__qa.exportCancel,openedPrintDialog:method==='exportPdf'}}
    return {};
   });queue=next.catch(()=>undefined);return next;
  }};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
 return {context,page,errors,input:page.locator('textarea').first()};
}
async function saved(page){await page.waitForFunction(()=>document.querySelector('.document-title span').textContent==='已存至本机');await page.waitForTimeout(120)}
async function check(browser,name,action){if(process.env.ANDROID_CONTINUITY_CASE&&process.env.ANDROID_CONTINUITY_CASE!==name)return;let state;try{state=await create(browser);await action(state);assert.deepEqual(state.errors,[]);results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.log('FAIL '+name+': '+error.message)}finally{await state?.context.close()}}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  await check(browser,'undo-to-saved-object-while-newer-save-is-inflight',async({page,input})=>{
   await input.fill('已保存的原稿甲');await saved(page);await page.evaluate(()=>window.__dbDelay=1800);
   await input.fill('不应在撤销后覆盖原稿的乙');await page.waitForTimeout(950);await input.press('Control+z');assert.equal(await input.inputValue(),'已保存的原稿甲');
   await page.waitForTimeout(6000);await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'已保存的原稿甲');
  });
  await check(browser,'background-rescue-does-not-wait-for-stalled-primary-store',async({page,input})=>{
   await input.fill('后台前的旧稿');await saved(page);await page.evaluate(()=>window.__hangDb=true);await input.fill('切后台前刚输入的最新中文……');
   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))});
   await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')).project.elements[0].text),'切后台前刚输入的最新中文……');
   await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'切后台前刚输入的最新中文……');
  });
  await check(browser,'long-script-add-undo-keeps-nearby-paragraph-active',async({page})=>{
   const project=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../tests/fixtures/document-import/last-bus-final.ssproj'),'utf8'));
   project.title='长篇连续编辑';project.elements=Array.from({length:2000},(_,index)=>({id:'continuity-'+index,type:'action',text:`第 ${index} 段，中文动作与省略号……`}));
   await page.evaluate(data=>window.__qa.input={canceled:false,name:'continuity.ssproj',data},Buffer.from(JSON.stringify(project)).toString('base64'));
   await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'导入文件',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await saved(page);
   await page.locator('[data-testid=virtuoso-scroller]').evaluate(x=>x.scrollTop=x.scrollHeight*.65);await page.waitForTimeout(500);
   const row=page.locator('.paragraph').nth(3),id=await row.getAttribute('data-element-id');await row.locator('textarea').focus();
   await page.getByRole('button',{name:'下一段',exact:true}).click();await page.waitForTimeout(600);await page.getByRole('button',{name:'撤销',exact:true}).click();await page.waitForTimeout(600);
   assert.equal(await page.evaluate(()=>document.querySelector('.paragraph.selected')?.getAttribute('data-element-id')),id);
   await page.getByRole('button',{name:'下一段',exact:true}).click();await page.waitForTimeout(500);
   const stored=await page.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,1000));return JSON.parse(localStorage.getItem('qa-recovery')).project.elements});
   assert.equal(stored.findIndex(x=>x.id===id)+1,stored.findIndex(x=>x.text===''));
  });
  await check(browser,'late-composition-commit-is-not-lost-during-pdf-export',async({page,input})=>{
   await input.fill('原文');await saved(page);await input.evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原文zhong');x.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.evaluate(()=>window.__qa.exportDelay=1000);await page.getByRole('button',{name:'导出 PDF',exact:true}).click();
   await input.evaluate(x=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,'原文中文');x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));x.dispatchEvent(new InputEvent('input',{bubbles:true,data:'中文',inputType:'insertFromComposition'}))});
   await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');assert.ok(await page.evaluate(()=>window.__qa.exports.at(-1).html.includes('原文中文')));await input.focus();await input.press('End');await input.press('!');await saved(page);
   assert.equal(await input.inputValue(),'原文中文!');await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'原文中文!');
  });
  await check(browser,'repeated-native-background-signals-preserve-newest-rescue',async({page,input})=>{
   await input.fill('主存储原稿');await saved(page);await page.evaluate(()=>window.__dbDelay=1400);await input.fill('较旧的正在保存稿');await page.waitForTimeout(850);await input.fill('后台最新稿……');
   await page.evaluate(()=>{window.__qa.recoveryWrites=0;for(let i=0;i<8;i++)window.dispatchEvent(new Event('android-background'))});await page.waitForTimeout(250);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')).project.elements[0].text),'后台最新稿……');
   assert.equal(await page.evaluate(()=>window.__qa.recoveryWrites),1);await page.waitForTimeout(5500);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-recovery')).project.elements[0].text),'后台最新稿……');await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'后台最新稿……');
  });
  await check(browser,'long-script-delete-undo-redo-stays-nearby',async({page})=>{
   const project=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../tests/fixtures/document-import/last-bus-final.ssproj'),'utf8'));
   project.elements=Array.from({length:2000},(_,i)=>({id:'delete-'+i,type:'action',text:`动作 ${i} ……`}));
   await page.evaluate(data=>window.__qa.input={canceled:false,name:'delete.ssproj',data},Buffer.from(JSON.stringify(project)).toString('base64'));
   await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'导入文件',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await saved(page);
   await page.locator('[data-testid=virtuoso-scroller]').evaluate(x=>x.scrollTop=x.scrollHeight*.7);await page.waitForTimeout(500);
   const row=page.locator('.paragraph').nth(3),id=await row.getAttribute('data-element-id');await row.locator('textarea').focus();
   await page.getByRole('button',{name:'段落选项',exact:true}).click();await page.getByRole('button',{name:'删除此段',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();await page.waitForTimeout(650);
   const selected=()=>page.evaluate(()=>document.querySelector('.paragraph.selected')?.getAttribute('data-element-id'));
   assert.equal(await selected(),'delete-'+(Number(id.slice(7))+1));await page.getByRole('button',{name:'撤销',exact:true}).click();await page.waitForTimeout(650);assert.equal(await selected(),id);
   await page.getByRole('button',{name:'重做',exact:true}).click();await page.waitForTimeout(650);assert.equal(await selected(),'delete-'+(Number(id.slice(7))+1));
  });
  for(const mode of ['exportCancel','exportFail'])await check(browser,mode+'-does-not-lock-following-input',async({page,input})=>{
   await input.fill('导出之前');await saved(page);await page.evaluate(mode=>window.__qa[mode]=true,mode);await page.getByRole('button',{name:'导出 PDF',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');await input.focus();await input.press('End');await input.press('!');await saved(page);assert.equal(await input.inputValue(),'导出之前!');await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await input.inputValue(),'导出之前!');
  });
  await check(browser,'imported-quoted-identifiers-remain-editable-through-history',async({page,input})=>{
   const project=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../tests/fixtures/document-import/last-bus-final.ssproj'),'utf8'));
   project.elements=[{id:'imported-"quoted"-identifier',type:'action',text:'导入原稿'}];
   await page.evaluate(data=>window.__qa.input={canceled:false,name:'quoted.ssproj',data},Buffer.from(JSON.stringify(project)).toString('base64'));
   await page.getByRole('button',{name:'本地剧本',exact:true}).click();await page.getByRole('button',{name:'导入文件',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await saved(page);
   await input.fill('修改后的文字');await input.press('Control+z');await page.waitForTimeout(700);assert.equal(await input.inputValue(),'导入原稿');await input.press('Control+Shift+z');await page.waitForTimeout(700);assert.equal(await input.inputValue(),'修改后的文字');
  });
 }finally{await browser.close()}
 await fs.mkdir(out,{recursive:true});const report={passed:results.every(x=>x.passed),results};await fs.writeFile(path.join(out,process.env.ANDROID_CONTINUITY_REPORT_FILENAME||(process.env.ANDROID_CONTINUITY_BASELINE?'continuity-baseline.json':'continuity-regression.json')),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:results.length}));if(!report.passed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1});
