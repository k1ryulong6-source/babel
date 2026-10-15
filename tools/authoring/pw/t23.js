const { server, open } = require('./lib');
const IDS = process.argv.slice(2), LANG = IDS[0].split('.')[0];
(async () => {
  const srv = await server();
  try {
    const docs = { 'app/profile': { createdAt: 1, lang: LANG, v3: true, v3seen: true, book: 'b1' } };
    let { browser, page, errors } = await open({ docs, hash: '#home', now: '2026-10-12T09:00:00' });
    await page.waitForFunction(() => PL.days[today()], null, { timeout: 15000 });
    for (const LID of IDS) {
      await page.evaluate(async id => { await curUnit(unitIdOf(id)); LR.id = id; LR.parts = null; LR.from = 'today'; LR.v2 = null; go('lesson'); }, LID);
      await page.waitForTimeout(700);
      const info = () => page.evaluate(() => { const V = LR.v2; if (!V || current !== 'lesson') return null; const s = V.redoing ? V.redo[V.sub] : V.flow[V.i]; return { i: V.i, t: s.t, kd: !!s.kd, warm: !!s.warm, redo: !!V.redoing, ans: !!V.ans, ex: ['c','f','o','tr','dict'].includes(s.t) ? s : null, rq: V.rq && { w: V.rq.ws[V.rq.k], pick: V.rq.pick, opts: V.rq.opts }, wr: V.wr }; });
      const kinds = {}; let wrongOnce = false, n = 0, stuck = null, shots = 0;
      for (let k = 0; k < 400; k++) {
        const s = await info(); if (!s) break; n++; kinds[s.t] = (kinds[s.t] || 0) + 1;
        if (process.env.SHOT && shots < 60 && !s.ans) { await page.screenshot({ path: `${__dirname}/sh/${LID}_${String(s.i).padStart(2, '0')}_${s.t}.png`, fullPage: true }); shots++; }
        const ex = s.ex;
        if (ex && !s.ans) {
          const wrong = s.kd && !wrongOnce && ex.t === 'c'; if (wrong) wrongOnce = true;
          if (ex.t === 'c') await page.click(`[data-o="${wrong ? (ex.a + 1) % ex.o.length : ex.a}"]`);
          else if (['f','tr','dict'].includes(ex.t)) { const a = Array.isArray(ex.a) ? ex.a[0] : ex.a; await page.fill('#v2-in', a); await page.press('#v2-in', 'Enter'); }
          else { const order = await page.evaluate(q => orderTokens(q).sort((a, b) => a.i - b.i).map(x => x.i), ex); for (const i of order) await page.click(`[data-add="${i}"]`); await page.click('#v2-next'); }
          await page.waitForTimeout(40);
          const a2 = await page.evaluate(() => LR.v2?.ans?.ok); if (!wrong && a2 === false) console.log('  ✗ marked wrong:', JSON.stringify(ex).slice(0, 160));
          continue;
        }
        if (s.t === 'recall' && s.rq && s.rq.pick == null) { await page.click(`[data-r="${s.rq.opts.indexOf(s.rq.w)}"]`); continue; }
        if (s.t === 'write' && !s.wr?.sent) { await page.fill('#v2-wr', 'Test text.'); await page.click('#v2-next'); await page.waitForTimeout(80); continue; }
        if (await page.$eval('#v2-next', b => b.disabled)) { stuck = s; break; }
        await page.click('#v2-next'); await page.waitForTimeout(40);
      }
      const rec = await page.evaluate(id => PL.st.les[id], LID);
      console.log(LID, 'screens', n, JSON.stringify(kinds), 'done', !!rec?.done, 'x', JSON.stringify(rec?.p?.x), stuck ? 'STUCK ' + JSON.stringify(stuck) : '');
    }
    console.log('keys', Object.keys(await page.evaluate(() => PL.st.keys || {})).length, 'errors', errors.filter(e => !e.includes('ERR_FAILED')));
    await browser.close();
  } finally { srv.kill(); }
})();
