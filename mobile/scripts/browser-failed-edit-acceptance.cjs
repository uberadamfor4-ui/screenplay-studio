const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { chromium } = createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out = process.env.ANDROID_QA_DIR || 'D:/ScreenplayStudio-QA/android-0.1.6', results = [];
async function create(browser) {
 const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
 await context.addInitScript(() => {
  const open = IDBFactory.prototype.open, put = IDBObjectStore.prototype.put, get = IDBObjectStore.prototype.get;
  window.__qa = { open, put, get, exports: [] };
  IDBObjectStore.prototype.put = function (...args) { if (sessionStorage.full) throw new DOMException('Injected disk full', 'QuotaExceededError'); return put.apply(this, args); };
  IDBObjectStore.prototype.get = function (...args) {
   const request = get.apply(this, args);
   if (this.name === 'projects' && sessionStorage.startupRace) {
    sessionStorage.removeItem('startupRace'); const add = request.addEventListener;
    request.addEventListener = function (type, listener, options) {
     return add.call(this, type, type === 'success' ? event => {
      const r = open.call(indexedDB, 'screenplay-mobile-library', 1);
      r.onsuccess = () => { const db = r.result, tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects'), current = get.call(store, args[0]); current.onsuccess = () => { const next = current.result; next.revision++; next.project.elements[0].text = '外部更新必须保留'; put.call(store, next); }; tx.oncomplete = () => { db.close(); listener.call(request, event); }; };
     } : listener, options);
    };
   }
   return request;
  };
  window.androidBridge = {}; let queue = Promise.resolve();
  const methods = ['loadRecovery', 'saveRecovery', 'saveDocument', 'backgroundApp'];
  window.Capacitor = { PluginHeaders: [{ name: 'LocalDocuments', methods: methods.map(name => ({ name, rtype: 'promise' })) }], nativePromise: (_plugin, method, payload) => {
   const task = queue.then(async () => {
    if (method === 'loadRecovery') return { content: localStorage.rescue || undefined };
    if (method === 'saveRecovery') {
     if (window.__qa.delayedRecoveryFailure) { window.__qa.delayedRecoveryFailure = false; await new Promise(resolve => setTimeout(resolve, 1200)); throw new Error('Injected stale rescue failure'); }
     if (sessionStorage.backupFull) throw new Error('Injected ENOSPC'); localStorage.rescue = payload.content;
    }
    if (method === 'saveDocument') { window.__qa.exports.push(payload); return { canceled: false }; }
    return {};
   }); queue = task.catch(() => undefined); return task;
  } };
 });
 const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('http://127.0.0.1:5205/'); await page.locator('textarea:not([readonly])').first().waitFor();
 return { context, page, errors, input: page.locator('textarea').first() };
}
async function saved(page) { await page.waitForFunction(() => document.querySelector('.document-title span').textContent === '已存至本机'); await page.waitForTimeout(100); }
async function idle(page) { await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false'); }
async function records(page) { return page.evaluate(async () => { const { listRecords } = await import('/src/storage.ts'); return listRecords(); }); }
async function recovery(page) { return page.evaluate(() => JSON.parse(localStorage.rescue)); }
async function background(page) { await page.evaluate(() => window.dispatchEvent(new Event('android-background'))); await page.waitForTimeout(150); }
async function reload(page) { await page.reload(); await page.locator('textarea:not([readonly])').first().waitFor(); }
async function createSecond(page, input) {
 await page.getByRole('button', { name: '本地剧本', exact: true }).click(); await page.getByRole('button', { name: '新建剧本', exact: true }).click(); await idle(page); await page.getByRole('dialog').waitFor({ state: 'hidden' });
 await input.fill('第二项目原稿'); await saved(page); return (await recovery(page)).id;
}
async function switchTo(page, index) { await page.getByRole('button', { name: '本地剧本', exact: true }).click(); await page.locator('.library-row > button:first-child').nth(index).click(); await idle(page); }
async function check(browser, name, action) {
 if (process.env.ANDROID_FAILED_EDIT_CASE && process.env.ANDROID_FAILED_EDIT_CASE !== name) return;
 let state; try { state = await create(browser); await action(state); assert.deepEqual(state.errors, []); results.push({ name, passed: true }); console.log('PASS ' + name); }
 catch (e) { const diagnostics = state ? await state.page.evaluate(async () => ({text: document.querySelector('textarea')?.value, status: document.querySelector('.document-title span')?.textContent, busy: document.querySelector('main')?.getAttribute('aria-busy'), dialog: !!document.querySelector('[role=dialog]'), recovery: JSON.parse(localStorage.rescue || 'null'), records: await (await import('/src/storage.ts')).listRecords()})).catch(() => undefined) : undefined; results.push({ name, passed: false, error: e.stack, diagnostics }); console.log('FAIL ' + name + ': ' + e.message); } finally { await state?.context.close(); }
}
(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
 try {
  await check(browser, 'both-stores-fail-continued-input-undo-redo-and-retry', async ({ page, input }) => {
   await input.fill('原稿'); await saved(page); await page.evaluate(() => { sessionStorage.full = '1'; sessionStorage.backupFull = '1'; });
   await input.fill('失败后第一句……'); await page.getByRole('alert').waitFor(); await input.fill('失败后第二句，中文与 English'); await page.waitForTimeout(850); await input.fill('失败后第三句');
   await input.press('Control+z'); assert.equal(await input.inputValue(), '失败后第二句，中文与 English'); await input.press('Control+Shift+z'); assert.equal(await input.inputValue(), '失败后第三句');
   assert.equal((await records(page))[0].project.elements[0].text, '原稿'); await page.evaluate(() => { delete sessionStorage.full; delete sessionStorage.backupFull; }); await saved(page); await reload(page); assert.equal(await input.inputValue(), '失败后第三句');
  });
  for (const redo of [false, true]) await check(browser, 'pending-recovery-follows-' + (redo ? 'redo' : 'undo') + '-after-failure', async ({ page, input }) => {
   await input.fill('落盘原稿'); await saved(page); await page.evaluate(() => sessionStorage.full = '1'); await input.fill('失败后中文甲'); await page.getByRole('alert').waitFor(); await page.waitForTimeout(850); await input.fill('失败后中文乙');
   await input.press('Control+z'); if (redo) await input.press('Control+Shift+z'); const text = redo ? '失败后中文乙' : '失败后中文甲'; assert.equal(await input.inputValue(), text); await background(page); assert.equal((await recovery(page)).project.elements[0].text, text);
   await reload(page); assert.equal(await input.inputValue(), text); await page.evaluate(() => delete sessionStorage.full); await saved(page); assert.equal((await records(page)).length, 1);
  });
  await check(browser, 'failed-project-switch-keeps-draft-target-and-history', async ({ page, input }) => {
   await input.fill('第一项目原稿'); await saved(page); const first = (await recovery(page)).id; const second = await createSecond(page, input);
   await page.evaluate(() => { sessionStorage.full = '1'; sessionStorage.backupFull = '1'; }); await input.fill('第二项目保存失败的新字'); await page.getByRole('alert').waitFor(); await switchTo(page, 1);
   assert.equal(await page.getByRole('dialog').count(), 1); assert.equal(await input.inputValue(), '第二项目保存失败的新字'); assert.equal((await records(page)).find(x => x.id === first).project.elements[0].text, '第一项目原稿');
   await page.getByRole('button', { name: '返回写作', exact: true }).click(); await input.press('Control+z'); assert.equal(await input.inputValue(), '第二项目原稿'); await input.press('Control+Shift+z');
   await page.evaluate(() => { delete sessionStorage.full; delete sessionStorage.backupFull; }); await saved(page); await switchTo(page, 1); await saved(page); assert.equal(await input.inputValue(), '第一项目原稿'); assert.equal(await page.getByRole('button', { name: '撤销', exact: true }).isEnabled(), false); assert.equal((await records(page)).find(x => x.id === second).project.elements[0].text, '第二项目保存失败的新字');
  });
  await check(browser, 'conflict-copy-failed-save-continued-edit-history-and-switch', async ({ page, input }) => {
   await input.fill('原稿甲'); await saved(page); const pending = await recovery(page); pending.recoveryPending = true; pending.project.elements[0].text = '恢复分支'; await input.fill('原稿乙必须保留'); await saved(page); const original = (await records(page))[0];
   await page.evaluate(p => { localStorage.rescue = JSON.stringify(p); sessionStorage.full = '1'; }, pending); await reload(page); assert.equal(await input.inputValue(), '恢复分支');
   await input.fill('恢复分支继续输入……'); await page.waitForTimeout(850); await input.fill('恢复分支最终稿'); await input.press('Control+z'); assert.equal(await input.inputValue(), '恢复分支继续输入……'); await input.press('Control+Shift+z'); await background(page); const copy = await recovery(page); assert.notEqual(copy.id, original.id); assert(copy.project.title.endsWith('(恢复副本)'));
   await page.evaluate(() => delete sessionStorage.full); await saved(page); const all = await records(page); assert.equal(all.length, 2); assert.deepEqual(all.find(x => x.id === original.id), original); assert.equal(all.find(x => x.id === copy.id).project.elements[0].text, '恢复分支最终稿');
   await reload(page); assert.equal(await input.inputValue(), '恢复分支最终稿'); await saved(page); assert.equal((await records(page)).length, 2); await switchTo(page, 1); await saved(page); assert.equal(await input.inputValue(), '原稿乙必须保留');
  });
  await check(browser, 'startup-second-read-must-not-authorize-overwriting-newer-original', async ({ page, input }) => {
   await input.fill('启动读取的旧稿'); await saved(page); await page.evaluate(() => sessionStorage.startupRace = '1'); await reload(page); await saved(page);
   assert.equal(await input.inputValue(), '外部更新必须保留'); await input.fill('基于外部更新继续写'); await saved(page); assert.equal((await records(page))[0].project.elements[0].text, '基于外部更新继续写');
  });
  await check(browser, 'read-of-conflicting-original-does-not-grant-stale-writer-permission', async ({ page, input }) => {
   await input.fill('本窗口旧版本'); await saved(page);
   await page.evaluate(async () => { const qa = window.__qa, r = qa.open.call(indexedDB, 'screenplay-mobile-library', 1); await new Promise(resolve => { r.onsuccess = resolve; }); const db = r.result, tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects'), request = qa.get.call(store, JSON.parse(localStorage.rescue).id); request.onsuccess = () => { const next = request.result; next.revision++; next.project.elements[0].text = '另一窗口的新原稿'; qa.put.call(store, next); }; await new Promise(resolve => { tx.oncomplete = resolve; }); db.close(); const storage = await import('/src/storage.ts'); await storage.loadRecord(JSON.parse(localStorage.rescue).id); });
   await input.fill('本窗口未合并的修改'); await background(page); await page.waitForTimeout(1000); assert.equal((await records(page))[0].project.elements[0].text, '另一窗口的新原稿'); assert.notEqual(await page.locator('.document-title span').innerText(), '已存至本机');
   await reload(page); await saved(page); const all = await records(page); assert.equal(all.length, 2); assert(all.some(x => x.project.elements[0].text === '另一窗口的新原稿')); assert(all.some(x => x.project.elements[0].text === '本窗口未合并的修改'));
  });
  await check(browser, 'stale-rescue-failure-cannot-survive-successful-new-generation-save', async ({ page, input }) => {
   await input.fill('原稿'); await saved(page); await page.evaluate(() => window.__qa.delayedRecoveryFailure = true); await input.fill('较旧的抢救稿'); await background(page); await input.fill('已正常保存的最新稿'); await saved(page); await page.waitForTimeout(100); assert.equal(await page.getByRole('alert').count(), 0); assert.equal((await recovery(page)).project.elements[0].text, '已正常保存的最新稿');
  });
  await check(browser, 'primary-success-backup-failure-keeps-new-primary-after-restart', async ({ page, input }) => {
   await input.fill('旧稿'); await saved(page); const pending = await recovery(page); pending.recoveryPending = true; pending.project.elements[0].text = '旧的未确认分支';
   await page.evaluate(p => { localStorage.rescue = JSON.stringify(p); sessionStorage.backupFull = '1'; }, pending); await input.fill('主库已保存的最新正文'); await page.getByRole('alert').waitFor();
   assert.equal((await records(page))[0].project.elements[0].text, '主库已保存的最新正文'); await reload(page); await page.waitForTimeout(1000); await page.evaluate(() => delete sessionStorage.backupFull); await saved(page); const all = await records(page); assert.equal(all.length, 2); assert(all.some(x => x.project.elements[0].text === '主库已保存的最新正文')); assert(all.some(x => x.project.elements[0].text === '旧的未确认分支'));
  });
 } finally { await browser.close(); }
 await fs.mkdir(out, { recursive: true }); const report = { passed: results.every(x => x.passed), results }; await fs.writeFile(path.join(out, process.env.ANDROID_FAILED_EDIT_BASELINE ? 'failed-edit-baseline.json' : 'failed-edit-regression.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: results.length })); if (!report.passed) process.exitCode = 1;
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
