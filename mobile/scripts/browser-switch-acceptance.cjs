const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { chromium } = createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/placeholder.cjs')('playwright');
const out = process.env.ANDROID_QA_DIR || 'D:/ScreenplayStudio-QA/android-0.1.1';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      window.androidBridge = {};
      let queue = Promise.resolve();
      window.Capacitor = {
        PluginHeaders: [{ name: 'LocalDocuments', methods: ['saveRecovery', 'loadRecovery', 'backgroundApp'].map(name => ({ name, rtype: 'promise' })) }],
        nativePromise: (_plugin, method, payload) => {
          const next = queue.then(async () => {
            await new Promise(resolve => setTimeout(resolve, 220));
            if (method === 'saveRecovery') localStorage.setItem('qa-recovery', payload.content);
            return method === 'loadRecovery' ? { content: localStorage.getItem('qa-recovery') || undefined } : {};
          });
          queue = next;
          return next;
        },
      };
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        const request = open.apply(this, args), add = request.addEventListener;
        request.addEventListener = function (type, listener, options) {
          if (type === 'success' && typeof listener === 'function') return add.call(this, type, event => setTimeout(() => listener.call(this, event), 500), options);
          return add.call(this, type, listener, options);
        };
        return request;
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5205/');
    await page.locator('textarea:not([readonly])').first().waitFor();
    async function title(value) {
      await page.getByRole('button', { name: '功能', exact: true }).click();
      await page.getByRole('button', { name: '偏好与项目', exact: true }).click();
      await page.getByLabel('剧本名称', { exact: true }).fill(value);
      await page.getByRole('button', { name: '返回写作', exact: true }).click();
    }
    await title('项目 A');
    await page.locator('textarea').first().fill('A 的原稿');
    await page.getByRole('button', { name: '本地剧本', exact: true }).click();
    await page.getByRole('button', { name: '新建剧本', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await title('项目 B');
    await page.locator('textarea').first().fill('B 的原稿');
    await page.waitForTimeout(1800);
    for (let round = 0; round < 4; round++) {
      await page.getByRole('button', { name: '本地剧本', exact: true }).click();
      await page.locator('.library-row button').filter({ hasText: '项目 A' }).first().click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.locator('textarea').first().fill(`A 第 ${round} 次最新编辑……`);
      await page.waitForTimeout(760);
      await page.getByRole('button', { name: '本地剧本', exact: true }).click();
      await page.locator('.library-row button').filter({ hasText: '项目 B' }).first().click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-recovery')).project.title), '项目 B');
      await page.reload();
      await page.locator('textarea:not([readonly])').first().waitFor();
      assert.equal(await page.locator('.document-title strong').innerText(), '项目 B');
      assert.equal(await page.locator('textarea').first().inputValue(), 'B 的原稿');
    }
    assert.deepEqual(errors, []);
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, 'switch-race.json'), JSON.stringify({ passed: true, rounds: 4, delayedIndexedDbMs: 500, delayedSerialRecoveryMs: 220, activeProjectAndRecoveryPreserved: true, kimiCandidates: 'Not reproduced: serialized saves and persist-before-activation preserve project order.' }, null, 2));
    console.log('Delayed autosave / native recovery / project switching passed four restart cycles.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
