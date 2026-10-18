const {app,BrowserWindow,ipcMain}=require('electron')
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SCREENPLAY_GATE_OUTPUT||path.join(root,'acceptance-results'),'composition')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[]
app.setPath('userData',path.join(out,'profile-'+Date.now()))
let window,fixture,sequence=0
const evaluate=source=>window.webContents.executeJavaScript(source)
const value=()=>evaluate("document.querySelector('.editor-row textarea').value")
async function until(source){for(let i=0;i<100;i++){if(await evaluate(source))return;await wait(50)}throw Error('Timed out: '+source)}
async function replace(text){await evaluate("(()=>{const e=document.querySelector('.editor-row textarea');e.focus();e.select()})()");await window.webContents.insertText(text);await wait(40)}
async function compositionStart(){await evaluate("document.querySelector('.editor-row textarea').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}))")}
async function compositionEnd(text){await evaluate(`document.querySelector('.editor-row textarea').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:${JSON.stringify(text)}}))`);await wait(100)}
async function command(name){window.webContents.send('menu:command',name);await wait(100)}
async function reset(){fixture.elements=[{id:'qa-ime-'+(++sequence),type:'action',text:''}];await command('openProject');await until(`Boolean(document.querySelector('textarea[data-element-id="qa-ime-${sequence}"]'))`)}
async function check(name,run){await reset();await run();checks.push({name,passed:true})}
async function main(){
 await fs.mkdir(out,{recursive:true});await app.whenReady()
 for(const [name,result]of Object.entries({'system:listFonts':{fonts:[]},'revision:read':undefined,'revision:write':true,'recovery:read':undefined,'recovery:write':true}))ipcMain.handle(name,()=>result)
 ipcMain.handle('system:setUiLocale',(_event,locale)=>({locale}))
 fixture=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/document-import/last-bus-final.ssproj'),'utf8'));fixture.title='Composition acceptance'
 ipcMain.handle('file:openText',()=>({canceled:false,filePath:path.join(out,'source.ssproj'),content:JSON.stringify(fixture)}))
 ipcMain.handle('file:saveText',()=>({canceled:false,filePath:path.join(out,'source.ssproj')}))
 window=new BrowserWindow({width:1280,height:900,show:false,webPreferences:{preload:path.join(root,'electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}})
 await window.loadFile(path.join(root,'dist/index.html'));await until("Boolean(document.querySelector('.editor-row textarea'))");await wait(300)
 await check('long-candidate-pause-is-one-undo-step',async()=>{
  await compositionStart();await replace('ni');await wait(1400);await replace('ni hao');await replace('你好……');await compositionEnd('你好……')
  await command('undoProject');assert.equal(await value(),'');await command('redoProject');assert.equal(await value(),'你好……')
 })
 await check('cancel-restores-existing-redo',async()=>{
  await replace('旧稿');await command('undoProject');assert.equal(await value(),'');await compositionStart();await replace('临时拼音');await replace('');await compositionEnd('');await command('redoProject');assert.equal(await value(),'旧稿')
 })
 await check('successive-compositions-have-independent-undo',async()=>{
  await compositionStart();await replace('你好');await compositionEnd('你好');await compositionStart();await replace('你好世界');await compositionEnd('你好世界')
  await command('undoProject');assert.equal(await value(),'你好');await command('undoProject');assert.equal(await value(),'');await command('redoProject');await command('redoProject');assert.equal(await value(),'你好世界')
 })
 await check('final-smart-type-detection-is-atomic',async()=>{
  await compositionStart();await replace('nei jing');await wait(1400);await replace('内景 房间 - 日');await compositionEnd('内景 房间 - 日')
  assert.equal(await evaluate("document.querySelector('.editor-row select').value"),'scene');await command('undoProject');assert.equal(await value(),'');assert.equal(await evaluate("document.querySelector('.editor-row select').value"),'action')
 })
 await check('explicit-type-change-remains-separately-undoable',async()=>{
  await compositionStart();await replace('完整中文');await compositionEnd('完整中文')
  await evaluate("(()=>{const s=document.querySelector('.editor-row select');s.value='shot';s.dispatchEvent(new Event('change',{bubbles:true}))})()");await wait(100)
  await command('undoProject');assert.equal(await value(),'完整中文');assert.equal(await evaluate("document.querySelector('.editor-row select').value"),'action');await command('undoProject');assert.equal(await value(),'')
 })
 await check('ordinary-typing-after-composition-is-a-new-step',async()=>{
  await compositionStart();await replace('中文');await compositionEnd('中文');await replace('中文 English');await command('undoProject');assert.equal(await value(),'中文')
 })
 await check('blur-commits-composition-without-intermediate-undo',async()=>{
  await compositionStart();await replace('pin yin');await wait(1400);await replace('失焦仍保留中文');await evaluate("(()=>{const e=document.querySelector('.editor-row textarea');e.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:document.body}));e.blur()})()");await wait(100)
  await command('undoProject');assert.equal(await value(),'');await command('redoProject');assert.equal(await value(),'失焦仍保留中文')
 })
 await check('saving-does-not-add-an-invisible-undo-step',async()=>{
  await replace('保存前的修改');await command('saveProject');await command('saveProject');await command('undoProject');assert.equal(await value(),'');await command('redoProject');assert.equal(await value(),'保存前的修改')
 })
 await check('saving-does-not-consume-a-redo-branch',async()=>{
  await replace('可重做的修改');await command('undoProject');assert.equal(await value(),'');await command('saveProject');await command('redoProject');assert.equal(await value(),'可重做的修改')
 })
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,platform:process.platform,checks,scope:'Synthetic composition events and native Electron text insertion; not physical IME certification'},null,2))
 await fs.writeFile(path.join(out,'composition.png'),(await window.webContents.capturePage()).toPNG())
 console.log(JSON.stringify({passed:true,checks:checks.length,output:out}));window.destroy();app.quit()
}
main().catch(async error=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:false,platform:process.platform,checks,error:error.message},null,2));console.error(error);app.exit(1)})
