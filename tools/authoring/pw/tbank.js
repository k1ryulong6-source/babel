// 单元题库练习测试：node tbank.js es.2.5（先把课时标成已学，再做一组题，检查记录和错题本）
const { server, open } = require('./lib');
const UID = process.argv[2], LANG = UID.split('.')[0];
(async () => {
  const srv = await server();
  try {
    const docs = { 'app/profile': { createdAt: 1, lang: LANG, v3: true, v3seen: true, book: 'b1' } };
    const { browser, page, errors } = await open({ docs, hash: '#home', now: '2026-11-07T09:00:00' });
    await page.waitForFunction(() => PL.days[today()], null, { timeout: 15000 });
    // 课程页：单元题库这一行出现
    await page.evaluate(async uid => { await curUnit(uid); go('course'); }, UID);
    await page.waitForTimeout(800);
    const opened = await page.evaluate(uid => { const d = document.querySelector(`.cx-u[data-u="${uid}"]`); if (d && !d.open) { d.open = true; d.dispatchEvent(new Event('toggle')); } return !!d; }, UID);
    await page.waitForTimeout(600);
    console.log('course row', opened, await page.evaluate(uid => document.querySelector(`[data-bank="${uid}"]`)?.textContent.replace(/\s+/g, ' ') || 'MISSING', UID));
    // 没学课时：不能做题
    await page.evaluate(uid => ubOpen(uid), UID); await page.waitForTimeout(600);
    console.log('before lessons:', await page.evaluate(() => !!document.querySelector('#ub-go')) ? 'can start ✗' : 'locked ✓');
    // 标成已学第 1–3 课
    await page.evaluate(uid => { for (const i of [1, 2, 3]) (PL.st.les[`${uid}.${i}`] ||= {}).done = today(); go('course'); ubOpen(uid); }, UID);
    await page.waitForTimeout(600);
    console.log('intro:', await page.evaluate(() => document.querySelector('.card p.num')?.innerText));
    await page.click('#ub-go'); await page.waitForTimeout(300);
    let n = 0, wrongOnce = false;
    for (let k = 0; k < 80; k++) {
      const it = await page.evaluate(() => { const Q = UB.quiz; if (!Q || Q.pos >= Q.queue.length) return null; const x = Q.items[Q.queue[Q.pos]]; return { x, ans: !!Q.ans }; });
      if (!it) break;
      if (it.ans) { await page.click('#qz-next'); await page.waitForTimeout(40); continue; }
      n++; const x = it.x, wrong = !wrongOnce && x.t === 'c'; if (wrong) wrongOnce = true;
      if (x.l > 3) console.log('  ✗ 出了没学的课的题', x.l);
      if (x.t === 'c') await page.click(`[data-o="${wrong ? (x.a + 1) % x.o.length : x.a}"]`);
      else if (['f', 'tr', 'dict'].includes(x.t)) { await page.fill('#qz-in', Array.isArray(x.a) ? x.a[0] : x.a); await page.press('#qz-in', 'Enter'); }
      else { const order = await page.evaluate(q => orderTokens(q).sort((a, b) => a.i - b.i).map(t => t.i), x); for (const i of order) await page.click(`[data-add="${i}"]`); await page.click('#qz-ord'); }
      await page.waitForTimeout(40);
      const ok = await page.evaluate(() => UB.quiz?.ans?.ok); if (!wrong && ok === false) console.log('  ✗ marked wrong', JSON.stringify(x).slice(0, 120));
    }
    const res = await page.evaluate(uid => ({ last: UB.last, bk: PL.st.units[uid]?.bk, note: document.querySelector('.notice.info')?.innerText }), UID);
    console.log('answered screens', n, JSON.stringify(res));
    console.log('errors', errors.filter(e => !e.includes('ERR_FAILED')));
    await browser.close();
  } finally { srv.kill(); }
})();
