const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const runtime=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs');
const {chromium}=runtime('playwright');
const output=process.env.ANDROID_QA_DIR||'D:/ScreenplayStudio-QA/android-0.1.1';
const root=path.resolve(__dirname,'../..');
const reports=[];
(async()=>{
 await fs.mkdir(output,{recursive:true});
 for(const [engine,executablePath] of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
  const browser=await chromium.launch({executablePath,headless:true});
  try{
   for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:800,height:1280}]){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5205/');await page.locator('textarea:not([readonly])').first().waitFor();
    const text='中文省略号……长句测试。'.repeat(100);
    await page.locator('textarea').first().fill(text);
    assert(await page.locator('textarea').first().evaluate(x=>x.clientHeight>=x.scrollHeight-3));
    await page.locator('textarea').first().evaluate(x=>{x.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));x.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));x.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));});
    assert.equal(await page.locator('textarea').count(),1);
    await page.waitForTimeout(900);await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await page.locator('textarea').first().inputValue(),text);
    await page.getByRole('button',{name:'下一段',exact:true}).click();await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName==='TEXTAREA' && document.activeElement.value===''),true);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await page.locator('.writing-surface [data-testid=virtuoso-scroller]').evaluate(x=>x.scrollTop=0).catch(()=>{});
    await page.locator('textarea').first().fill('中文测试……');
    await page.getByLabel('段落类型',{exact:true}).selectOption('action');
    await page.getByRole('button',{name:'段落选项',exact:true}).click();
    await page.getByRole('button',{name:'B',exact:true}).click();
    await page.getByRole('button',{name:'返回写作',exact:true}).click();
    assert.equal(await page.locator('textarea').first().evaluate(x=>getComputedStyle(x).fontWeight),'700');
    await page.getByRole('button',{name:'下一段',exact:true}).click();await page.waitForTimeout(200);
    assert.equal(await page.locator('textarea').count(),2);
    await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await page.locator('textarea').count(),1);
    await page.getByRole('button',{name:'重做',exact:true}).click();assert.equal(await page.locator('textarea').count(),2);
    await page.getByRole('button',{name:'段落选项',exact:true}).click();await page.getByRole('button',{name:'删除此段',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();assert.equal(await page.locator('textarea').count(),1);
    await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await page.locator('textarea').count(),2);
    await page.waitForTimeout(900);await page.reload();await page.locator('textarea:not([readonly])').first().waitFor();assert.equal(await page.locator('textarea').first().inputValue(),'中文测试……');
    for(const panel of ['教学中心','查找与替换','偏好与项目','导出文件']){
     await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:panel,exact:true}).click();
     if(panel==='教学中心')assert.equal(await page.getByRole('button',{name:'以新项目练习',exact:true,includeHidden:true}).count(),10);
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
     if(panel==='偏好与项目'){
      for(const locale of ['en-US','zh-TW','zh-CN']){await page.locator('.form-fields select').first().selectOption(locale);await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
     }
     await page.screenshot({path:path.join(output,`${engine}-${viewport.width}x${viewport.height}-${panel}.png`)});
     await page.locator('.sheet-header button').click();
    }
    const expected=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/document-import/last-bus-final.ssproj'),'utf8')).elements;
    for(const name of ['last-bus-import.docx','last-bus-import.txt','last-bus.fountain']){
     await page.getByRole('button',{name:'本地剧本',exact:true}).click();
     const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'导入文件',exact:true}).click();await(await chooser).setFiles(path.join(root,'tests/fixtures/document-import',name));
     await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'导出文件',exact:true}).click();
     const download=page.waitForEvent('download');await page.getByRole('button',{name:'SSPROJ',exact:true}).click();const file=await download;const data=JSON.parse(await fs.readFile(await file.path(),'utf8'));
     assert.deepEqual(data.elements.map(x=>({type:x.type,text:x.text})),expected.map(x=>({type:x.type,text:x.text})));await page.locator('.sheet-header button').click();
    }
    await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'分页预览',exact:true}).click();await page.locator('iframe').waitFor();await page.waitForTimeout(500);
    const html=await page.locator('iframe').getAttribute('srcdoc');assert(html.includes('末班')||html.includes('last-bus'));assert(!html.includes('{{SCREENPLAY_CJK'));
    await page.locator('.sheet-header button').click();
    await page.screenshot({path:path.join(output,`${engine}-${viewport.width}x${viewport.height}-writing.png`)});
    assert.deepEqual(errors,[]);reports.push({engine,viewport,imports:3,paragraphs:43,ime:true,longText:true,undo:true,autosave:true,deleteRestore:true,locales:3,passed:true});await context.close();
   }
  }finally{await browser.close()}
 }
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({reports,passed:true},null,2));console.log(JSON.stringify({passed:true,viewports:reports.length,output}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
