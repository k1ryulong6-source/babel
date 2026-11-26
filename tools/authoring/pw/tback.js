// 上一页测试：node tback.js（网页版点顶部箭头；App 版用浏览器的返回 = 手机返回手势）
const { server, open } = require('./lib');
const docs = { 'app/profile': { createdAt: 1, lang: 'en', v3: true, v3seen: true, book: 'b1' } };
const st = page => page.evaluate(() => ({ cur: current, label: document.querySelector('#pb-back span')?.textContent, hist: HIST.join('>') }));
const say = (name, got, want) => console.log((got === want ? '✓ ' : '✗ ') + name, '→', got, got === want ? '' : `(应为 ${want})`);
(async () => {
  const srv = await server();
  try {
    // ---- 网页版：顶部箭头 ----
    let { browser, page, errors } = await open({ docs, hash: '#home', now: '2026-11-07T09:00:00' });
    await page.waitForFunction(() => PL.days[today()], null, { timeout: 15000 });
    for (const v of ['today', 'course', 'dict']) { await page.evaluate(v => go(v), v); await page.waitForTimeout(300); }
    let s = await st(page); say('dict 页的箭头写着上一页', s.label, '课程');
    await page.click('#pb-back'); await page.waitForTimeout(300); say('箭头 → 课程', (await st(page)).cur, 'course');
    await page.click('#pb-back'); await page.waitForTimeout(300); s = await st(page); say('箭头 → 今日任务', s.cur, 'today'); say('今日任务页的箭头写回首页', s.label, 'turris');
    await page.click('#pb-back'); await page.waitForTimeout(300); say('箭头 → 首页', (await st(page)).cur, 'home');
    // 页面上写死的“← 今日任务”回到上一页时不再压一层
    await page.evaluate(() => go('today')); await page.evaluate(() => go('course')); await page.evaluate(() => go('today')); await page.waitForTimeout(300);
    say('写死的返回按钮不叠历史', (await st(page)).hist, '');
    // 做题中按返回：先确认
    await page.evaluate(() => { go('course'); go('dict'); }); await page.waitForTimeout(400);
    await page.evaluate(() => document.body.classList.add('focus'));
    await page.evaluate(() => goBack()); await page.waitForTimeout(200);
    say('做题中返回先弹确认', await page.evaluate(() => !!document.querySelector('.modal-bg') && current), 'dict');
    await page.evaluate(() => document.querySelector('.modal-bg').remove());
    console.log('web errors', errors.filter(e => !e.includes('ERR_FAILED')));
    await browser.close();
    // ---- App 版：返回手势 ----
    ({ browser, page, errors } = await open({ docs, hash: '#home', now: '2026-11-07T09:00:00', init: () => { window.BABEL_APP = true; } }));
    await page.waitForFunction(() => PL.days[today()], null, { timeout: 15000 });
    for (const v of ['course', 'words', 'dict']) { await page.evaluate(v => go(v), v); await page.waitForTimeout(300); }
    await page.goBack(); await page.waitForTimeout(400); say('App 返回 → 复习', (await st(page)).cur, 'words');
    await page.goBack(); await page.waitForTimeout(400); say('App 返回 → 课程', (await st(page)).cur, 'course');
    await page.goBack(); await page.waitForTimeout(400); say('App 返回 → 首页', (await st(page)).cur, 'home');
    console.log('app errors', errors.filter(e => !e.includes('ERR_FAILED')));
    await browser.close();
  } finally { srv.kill(); }
})();
