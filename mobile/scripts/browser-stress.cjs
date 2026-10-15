const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.1';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const slow=await browser.newContext({viewport:{width:390,height:844}});
  await slow.addInitScript(()=>{const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args){const request=open.apply(this,args),add=request.addEventListener;request.addEventListener=function(type,listener,options){if(type==='success'&&typeof listener==='function')return add.call(this,type,event=>setTimeout(()=>listener.call(this,event),800),options);return add.call(this,type,listener,options)};return request}});
  const page=await slow.newPage();await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
  await page.locator('textarea').first().fill('FIRST');await page.waitForTimeout(850);await page.locator('textarea').first().fill('LATEST……中文');await page.waitForTimeout(3500);
  assert.equal(await page.locator('.document-title span').innerText(),'已存至本机');await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await page.locator('textarea').first().inputValue(),'LATEST……中文');
  await page.locator('textarea').first().evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'候选词提交……完整');input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'候选词提交……完整'}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,isComposing:false,bubbles:true}));});
  assert.equal(await page.locator('textarea').count(),1);await page.waitForTimeout(3500);await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await page.locator('textarea').first().inputValue(),'候选词提交……完整');await slow.close();
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const app=await context.newPage();const errors=[];app.on('pageerror',e=>errors.push(e.message));await app.goto('http://127.0.0.1:5205/');await app.locator('textarea:not([readonly])').first().waitFor();
  const project=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/document-import/last-bus-final.ssproj'),'utf8'));
  project.title='5000 段落压力测试';project.elements=Array.from({length:5000},(_,index)=>({id:'stress-'+index,type:index%10===0?'scene':'action',text:index%10===0?'内景 写作室 - 日':`第 ${index} 段：中文、省略号……与 English dialogue。`}));
  await app.getByRole('button',{name:'本地剧本',exact:true}).click();const chooser=app.waitForEvent('filechooser');await app.getByRole('button',{name:'导入文件',exact:true}).click();await(await chooser).setFiles({name:'stress.ssproj',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await app.getByRole('dialog').waitFor({state:'hidden'});
  const visible=await app.locator('textarea').count();assert(visible<80,`Too many DOM rows: ${visible}`);
  const scroller=app.locator('.writing-surface [data-testid=virtuoso-scroller]');await scroller.evaluate(x=>x.scrollTop=x.scrollHeight);await app.waitForTimeout(1500);
  await app.locator('[data-element-id="stress-4999"] textarea').fill('最后一段完整保留……');await app.waitForTimeout(900);
  await app.getByRole('button',{name:'功能',exact:true}).click();await app.getByRole('button',{name:'导出文件',exact:true}).click();const download=app.waitForEvent('download');await app.getByRole('button',{name:'SSPROJ',exact:true}).click();const file=await download;const saved=JSON.parse(await fs.readFile(await file.path(),'utf8'));
  assert.equal(saved.elements.length,5000);assert.equal(saved.elements.at(-1).text,'最后一段完整保留……');assert.equal(saved.elements[0].text,project.elements[0].text);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'stress.json'),JSON.stringify({passed:true,delayedIndexedDbSave:'latest edit survives in-flight save and reload',paragraphs:5000,initialDomRows:visible,lastParagraphSaved:true,kimiAutosaveRace:'not reproduced; each project edit installs its own pending debounce timer'},null,2));console.log('Delayed-save and 5,000-paragraph tests passed.');await context.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
