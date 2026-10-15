// 测试辅助：起本地服务器、打开 app、预置 IndexedDB 存档
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const ROOT = require('path').resolve(__dirname, '../../..');
async function server(port = 8765) {
  const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  return p;
}
async function open({ docs = {}, ls = {}, hash = '', now = null, port = 8765 } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (now) await page.addInitScript(t => { const D = Date; const off = new D(t).getTime() - D.now(); globalThis.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } }; }, now);
  await page.goto(`http://127.0.0.1:${port}/manifest.webmanifest`);
  await page.evaluate(async ({ docs, ls }) => {
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    localStorage.setItem('bt_idb_from_ls', '1');
    await new Promise((ok, no) => { const r = indexedDB.open('babel', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs'); r.onsuccess = () => { const db = r.result; const t = db.transaction('docs', 'readwrite'); for (const [k, v] of Object.entries(docs)) t.objectStore('docs').put(v, k); t.oncomplete = () => { db.close(); ok(); }; t.onerror = () => no(t.error); }; r.onerror = () => no(r.error); });
  }, { docs, ls });
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`);
  await page.waitForFunction(() => typeof S !== 'undefined' && S.log && typeof LEX !== 'undefined' && LEX.ready, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { browser, page, errors };
}
async function idb(page, key) {
  return page.evaluate(k => new Promise(ok => { const r = indexedDB.open('babel', 1); r.onsuccess = () => { const q = r.result.transaction('docs').objectStore('docs').get(k); q.onsuccess = () => ok(q.result); }; }), key);
}
module.exports = { server, open, idb };
