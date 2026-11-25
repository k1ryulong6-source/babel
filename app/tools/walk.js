// 浏览器自动走课：每屏按标准答案作答（故意答错几题），检查回翻只读、目录、没懂、删除、跳过、复习，截图。
// 用法：node app/tools/walk.js [截图目录]
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const WWW = path.join(__dirname, "..", "www"), OUT = process.argv[2] || "/tmp/walk";
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg" };
const srv = http.createServer((q, r) => { const f = path.join(WWW, decodeURIComponent(q.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); r.end(d); } }); }).listen(0);
const L = JSON.parse(fs.readFileSync(path.join(WWW, "lessons/es.2.5.1.json")));
const byId = {}; for (const s of L.sections.flatMap(x => x.screens).concat(L.bank)) byId[s.id] = s;
const WRONG = new Set(["w3", "r3", "p1", "e3"]);
const fail = []; const ok = (c, m) => { if (!c) { fail.push(m); console.log("✗", m); } };

(async () => {
  const port = srv.address().port, b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; pg.on("pageerror", e => errs.push(String(e))); pg.on("console", m => m.type() === "error" && !/404|Failed to load/.test(m.text()) && errs.push(m.text()));
  await pg.goto(`http://localhost:${port}/`); await pg.waitForSelector("[data-start]");
  await pg.screenshot({ path: `${OUT}/00-home.png` });
  await pg.click("[data-start]");
  const shot = async n => pg.screenshot({ path: `${OUT}/${n}.png` });
  const cur = () => pg.evaluate(() => window.__babel.db().lessons["es.2.5.1"].curId);
  const intro = async () => { const o = await pg.$(".secintro"); if (o) { await pg.waitForTimeout(700); await o.click(); await pg.waitForTimeout(400); } };
  await pg.waitForTimeout(800); await shot("01-secintro"); await intro();
  let guard = 0, shotN = 2; const shots = new Set(["r1", "d2", "t1", "t2", "t6", "p3", "p8", "r5", "o1", "e2"]);
  async function answer(s, id, wrong) {
    const sc = ".screen.cur";
    if (s.t === "c") {
      const want = wrong ? (s.a + 1) % s.o.length : s.a;
      await pg.click(`${sc} [data-o="${want}"]`);
    } else if (["f", "tr", "rw", "dict"].includes(s.t)) {
      const v = wrong ? "xx" : s.t === "dict" ? s.a : s.a[0];
      await pg.fill(`${sc} [data-in]`, v); await pg.click("[data-primary]");
    } else if (s.t === "o") {
      const toks = s.p; const map = await pg.$$eval(`${sc} [data-add]`, bs => bs.map(b => [b.dataset.add, b.textContent]));
      for (let k = 0; k < toks.length; k++) await pg.click(`${sc} [data-add="${k}"]`);
      await pg.click("[data-primary]");
    } else if (s.t === "match") {
      for (let k = 0; k < s.pairs.length; k++) { await pg.click(`${sc} [data-l="${k}"]`); await pg.click(`${sc} [data-r="${k}"]`); }
      await pg.waitForTimeout(500);
    } else if (s.t === "free") {
      await pg.fill(`${sc} [data-in]`, s.model); await pg.click("[data-primary]"); await pg.click(`${sc} [data-self="1"]`);
    } else if (s.t === "write") {
      await pg.fill(`${sc} [data-in]`, s.model); await pg.click("[data-primary]"); await pg.click(`${sc} [data-chk="0"]`);
    } else if (s.t === "speak") {
      await pg.click("[data-primary]");
    } else if (s.t === "teach" && s.ask) {
      await answer({ ...s.ask }, id + ".ask", false);
    }
  }
  while (guard++ < 120) {
    if (await pg.$(".summary")) break;
    await intro();
    const id = await cur(), s = byId[id]; if (!s) { ok(false, "unknown screen " + id); break; }
    await answer(s, id, WRONG.has(id));
    await pg.waitForTimeout(150);
    if (shots.has(id)) await shot(String(shotN++).padStart(2, "0") + "-" + id);
    if (id === "t1") { // 没懂
      await pg.click("[data-flag]"); ok(await pg.$eval("[data-flag]", b => b.classList.contains("on")), "flag on");
    }
    if (id === "d3") { // 回翻：答过的题只读
      await pg.click("[data-back]"); await pg.waitForTimeout(350);
      ok((await cur()) === "d2", "back to d2");
      ok(await pg.$$eval(".screen.cur [data-o]", bs => bs.every(b => b.disabled)), "answered read-only");
      await shot(String(shotN++).padStart(2, "0") + "-back-readonly");
      await pg.click("[data-primary]"); await pg.waitForTimeout(350); ok((await cur()) === "d3", "forward again");
    }
    if (id === "t3") { // 目录
      await pg.click(".prog"); await pg.waitForTimeout(400); await shot(String(shotN++).padStart(2, "0") + "-toc");
      await pg.click('.sheet [data-go="0"]'); await pg.waitForTimeout(400); ok((await cur()) === "w1", "toc jump");
      await pg.click("[data-jump]"); await pg.waitForTimeout(400); ok((await cur()) === "t3", "jump back to frontier");
    }
    if (id === "p5") { // 删除题目
      await pg.click("[data-primary]"); await pg.waitForTimeout(350); await intro();
      ok((await cur()) === "p6", "at p6");
      await pg.click("[data-menu]"); await pg.waitForTimeout(350); await shot(String(shotN++).padStart(2, "0") + "-menu");
      await pg.click('[data-m="del"]'); await pg.click('[data-m="del"]'); await pg.waitForTimeout(500);
      ok((await cur()) === "p7", "deleted p6 → p7 (got " + (await cur()) + ")");
      continue;
    }
    if (await pg.$("[data-primary]:not([disabled])")) await pg.click("[data-primary]");
    else { ok(false, "stuck at " + id + " : " + await pg.textContent("[data-primary]")); break; }
    await pg.waitForTimeout(330);
  }
  await pg.waitForTimeout(1200); await shot(String(shotN++).padStart(2, "0") + "-summary");
  const R = await pg.evaluate(() => window.__babel.db());
  const lr = R.lessons["es.2.5.1"];
  ok(lr.done && lr.exit.n === 5 && lr.exit.score === 4, "exit score " + JSON.stringify(lr.exit));
  ok(R.deleted["es.2.5.1"].includes("p6"), "p6 deleted");
  ok(R.carry.length === 1, "carry flagged " + R.carry.length);
  console.log("time", Math.round(lr.ms / 1000), "s; key", JSON.stringify(R.keys));
  // 复习
  await pg.click("[data-review]"); await pg.waitForTimeout(500);
  let g2 = 0;
  while (g2++ < 40) {
    if (await pg.$(".summary")) break;
    await intro();
    const id = await pg.evaluate(() => window.__babel.db().lessons["es.2.5.1"].rv.curId);
    const base = id.replace(/^[ft]-/, "").replace(/^rc-/, ""), s = byId[base] || byId[base.split("-")[0]] || (id.startsWith("rc-") ? byId[base].recall : null) || byId[id.split("-")[1]];
    let ss = id.startsWith("rc-") ? byId[id.slice(3)].recall : id.startsWith("ew-") ? byId[id.split("-")[1]] : s;
    if (!ss) { ok(false, "review unknown " + id); break; }
    if (g2 === 1) await shot(String(shotN++).padStart(2, "0") + "-review-first");
    await answer(ss, id, false); await pg.waitForTimeout(150);
    if (await pg.$("[data-primary]:not([disabled])")) await pg.click("[data-primary]"); else { ok(false, "review stuck " + id); break; }
    await pg.waitForTimeout(330);
  }
  await pg.waitForTimeout(1000); await shot(String(shotN++).padStart(2, "0") + "-review-summary");
  const R2 = await pg.evaluate(() => window.__babel.db());
  console.log("reviews", JSON.stringify(R2.lessons["es.2.5.1"].reviews), "key", JSON.stringify(R2.keys));
  // 跳过整节课（首页）
  await pg.evaluate(() => { localStorage.clear(); location.reload(); }); await pg.waitForSelector("[data-skip]");
  await pg.click("[data-skip]"); await pg.click("[data-skip]"); await pg.waitForTimeout(300);
  ok(!!(await pg.$(".skipped")), "lesson skipped badge"); await shot(String(shotN++).padStart(2, "0") + "-skipped");
  // 深色模式首页
  await pg.emulateMedia({ colorScheme: "dark" }); await pg.click("[data-start]"); await pg.waitForTimeout(800); await intro(); await shot(String(shotN++).padStart(2, "0") + "-dark");
  ok(errs.length === 0, "errors: " + errs.join(" | "));
  console.log(fail.length ? `FAIL ${fail.length}` : "ALL OK");
  await b.close(); srv.close();
})();
