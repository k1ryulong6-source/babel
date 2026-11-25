// 入口：首页 → 课时播放器 → 课后小结 → 课后复习 / 间隔复习
import { esc, $, $$, addDays, daysUntil, dayStr, today, toast } from "./util.js";
import { db, save, rec, resetLesson } from "./store.js";
import { openPlayer } from "./player.js";
import { Capacitor, registerPlugin } from "../vendor/capacitor-core.js";

const app = document.getElementById("app");
const LESSONS = ["es.2.5.1"];
const cache = {};
let player = null;
const INTERVALS = [1, 3, 7, 15, 30];

async function lesson(id) { return cache[id] ||= await (await fetch(`lessons/${id}.json`)).json(); }

// 课时 → 播放器用的 flow：按节奏去掉可选屏；把别的课标了“没懂”的题塞进开场检索
function lessonFlow(L) {
  const pace = db().settings.pace;
  const carry = db().carry.filter(c => c.from !== L.id).slice(0, 3);
  const sections = L.sections.map(sec => {
    let screens = sec.screens.filter(s => (pace !== "fast" || !s.opt) && !isDel(L, s.id));
    if (sec.id === "warm" && carry.length) screens = [...carry.map((c, k) => ({ ...c.item, id: "carry" + k, src: "上一课没懂的地方" })), ...screens];
    return { ...sec, screens };
  });
  return { id: L.id, title: `${L.unit} · ${L.title}`, sections };
}
const passageOf = L => L.sections.flatMap(s => s.screens).find(s => s.t === "read");
const isDel = (L, id) => (db().deleted?.[L.id] || []).includes(id);
const allScreens = L => L.sections.flatMap(s => s.screens).filter(s => !isDel(L, s.id));
// 删除题目：记进 deleted，以后课时和复习都不再出；首页可以恢复
function delQuestion(L, flow, id) {
  const s = flow.sections.flatMap(x => x.screens).find(x => x.id === id) || {};
  const real = s.bankId || (id.startsWith("ew-") ? id.split("-")[1] : id);
  const D = (db().deleted ||= {}); (D[L.id] ||= []).includes(real) || D[L.id].push(real); save();
  toast("已删除这道题，首页可以恢复");
}
function skipLesson(L) { const R = rec(L.id); R.skipped = dayStr(today()); save(); toast("已跳过这节课"); home(); }

// 课后复习：没懂的屏 → 其余讲解屏 → 5 道新的产出题（没懂的屏的检索题优先，再从题库抽没做过的）
function reviewFlow(L, R) {
  const teach = allScreens(L).filter(s => s.t === "teach" || (s.t === "c" && s.reveal));
  const flagged = teach.filter(s => R.flags[s.id]);
  const rest = teach.filter(s => s.t === "teach" && !R.flags[s.id]);
  const n = (R.reviews || []).length;
  const seen = new Set((R.reviews || []).flatMap(r => r.items || []));
  const quiz = [];
  for (const s of flagged) if (s.recall && quiz.length < 2) quiz.push({ ...s.recall, id: "rc-" + s.id, ins: s.recall.ins || "检索：凭记忆作答" });
  const exitWrong = allScreens(L).filter(s => s.exit && R.ans[s.id] && !R.ans[s.id].ok);
  for (const s of exitWrong) if (quiz.length < 3) quiz.push({ ...s, id: "ew-" + s.id + "-" + n, src: "上次小测错的" });
  const pool = L.bank.filter(b => !isDel(L, b.id));
  const bank = [...pool.filter(b => !seen.has(b.id)), ...pool.filter(b => seen.has(b.id))];
  for (const b of bank) if (quiz.length < 5) quiz.push({ ...b, id: b.id + "-" + n, bankId: b.id, exit: true });
  quiz.forEach(q => q.exit = true);
  const mk = (s, p) => ({ ...s, id: p + s.id });
  const sections = [];
  if (flagged.length) sections.push({ id: "rf", name: "没懂的地方", short: "没懂", intro: "你标了“没懂”的屏，先再看一遍，小问题重新答。", screens: flagged.map(s => mk(s, "f-")) });
  sections.push({ id: "rt", name: "讲解回顾", short: "回顾", intro: "把这一课的讲解快速过一遍，小问题再答一次。", screens: rest.map(s => mk(s, "t-")) });
  sections.push({ id: "rq", name: "出口小测（新题）", short: "小测", intro: "5 道没见过的产出题，不给提示。", screens: quiz });
  return { id: L.id + ".review", title: `复习 · ${L.title}`, sections };
}

function scheduleKey(L, score, n) {
  const K = (db().keys[L.keyId] ||= { step: -1 });
  const good = score >= n - 1, ok = score >= Math.ceil(n * 0.6);
  K.step = good ? Math.min(K.step + (K.step < 0 && score === n ? 2 : 1), INTERVALS.length - 1) : ok ? Math.max(K.step, 0) : 0;
  K.due = addDays(INTERVALS[K.step]); K.last = dayStr(today()); save();
  return K;
}

function finishLesson(L) {
  const R = rec(L.id);
  const ex = allScreens(L).filter(s => s.exit), score = ex.filter(s => R.ans[s.id]?.ok).length;
  R.done ||= dayStr(today()); R.exit = { score, n: ex.length, at: dayStr(today()) };
  // “没懂”的屏：下一课开场检索优先出
  const S = db(); S.carry = S.carry.filter(c => c.from !== L.id);
  for (const s of allScreens(L)) if (R.flags[s.id] && s.recall) S.carry.push({ from: L.id, sid: s.id, item: s.recall });
  scheduleKey(L, score, ex.length);
  save(); summary(L);
}

function finishReview(L, RV) {
  const R = rec(L.id), F = reviewFlow(L, R);
  const quiz = F.sections.at(-1).screens, score = quiz.filter(s => RV.ans[s.id]?.ok).length;
  (R.reviews ||= []).push({ at: dayStr(today()), score, n: quiz.length, items: quiz.map(q => q.bankId).filter(Boolean), ms: RV.ms });
  delete R.rv; scheduleKey(L, score, quiz.length);
  // 复习时把“没懂”都过了一遍：答对了就取消标记
  for (const s of F.sections[0].id === "rf" ? F.sections[0].screens : []) { const a = RV.ans[s.id + ".ask"]; if (a?.ok) delete R.flags[s.id.slice(2)]; }
  db().carry = db().carry.filter(c => c.from !== L.id || R.flags[c.sid]);
  save(); summary(L, { review: { score, n: quiz.length } });
}

function startLesson(L) {
  const R = rec(L.id);
  if (R.done && R.i >= allScreens(L).length - 1 && !R.again) { /* 学完后从头复看 */ R.i = 0; }
  const F = lessonFlow(L);
  player = openPlayer(app, F, R, { onExit: home, onFinish: () => finishLesson(L), passage: passageOf(L),
    onDelete: id => { delQuestion(L, F, id); startLesson(L); }, onSkipLesson: () => skipLesson(L) });
}
function startReview(L) {
  const R = rec(L.id); R.rv ||= { i: 0, hi: 0, ans: {}, flags: {}, ms: 0, secSeen: {} };
  const F = reviewFlow(L, R);
  player = openPlayer(app, F, R.rv, { onExit: home, onFinish: () => finishReview(L, R.rv), passage: passageOf(L),
    onDelete: id => { delQuestion(L, F, id); startReview(L); } });
}

const fmtMin = ms => Math.max(1, Math.round((ms || 0) / 60000));
const dueText = d => { const n = daysUntil(d); return n <= 0 ? "今天" : n === 1 ? "明天" : `${n} 天后`; };

// ---------- 首页 ----------
async function home() {
  player = null;
  const L = await lesson(LESSONS[0]), R = db().lessons[L.id], K = db().keys[L.keyId];
  const total = lessonFlow(L).sections.reduce((n, s) => n + s.screens.length, 0);
  const pct = R ? Math.round(((R.hi || 0) + (R.done ? 1 : 0)) / total * 100) : 0;
  const label = R?.skipped && !R.done ? "还是学一下" : !R ? "开始试课" : R.done ? "从头再学一遍" : `继续 · 第 ${R.i + 1} 屏`;
  const delN = (db().deleted?.[L.id] || []).length;
  const flags = R ? Object.keys(R.flags).length : 0;
  const due = K?.due && daysUntil(K.due) <= 0;
  app.innerHTML = `<div class="home">
    <header class="hh"><div class="brand">巴别塔</div><div class="date">${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}</div></header>
    ${R?.done ? reviewCard(L, R, K, due) : ""}
    <article class="lcard ${R?.done ? "done" : ""}">
      <div class="unit">${esc(L.unit)} · 试课${R?.skipped && !R.done ? `<span class="skipped">已跳过</span>` : ""}</div>
      <h1 class="es">${esc(L.title)}</h1>
      <p class="lsub">${esc(L.subtitle)}</p>
      <ol class="struct">${L.sections.map((s, i) => `<li><span class="n">${"①②③④⑤⑥⑦"[i]}</span><span class="nm">${esc(s.name)}</span><span class="m">${s.min} 分</span></li>`).join("")}</ol>
      <div class="meta"><span>约 ${L.minutes} 分钟 · ${total} 屏</span>${R ? `<span>${R.done ? "已学完" : `已学 ${pct}%`}${R.ms ? ` · 用时 ${fmtMin(R.ms)} 分` : ""}</span>` : ""}</div>
      ${R && !R.done ? `<div class="bar"><i style="transform:scaleX(${pct / 100})"></i></div>` : ""}
      <button class="primary ready" data-start>${label}</button>
      ${R?.done ? `<button class="btn ghost wide" data-sum>看这一课的小结</button>` : ""}
      ${R?.skipped && !R.done ? `<button class="btn ghost wide" data-unskip>撤销跳过</button>` : !R?.done ? `<button class="btn ghost wide" data-skip>跳过这节课</button>` : ""}
    </article>
    <section class="setting">
      <div class="st-row"><div><b>学习节奏</b><p class="sub">精练：跳过部分辨认题和词汇复习，约 35 分钟，适合时间紧的日子。</p></div>
        <div class="seg2" role="radiogroup"><button data-pace="std" class="${db().settings.pace !== "fast" ? "on" : ""}">标准</button><button data-pace="fast" class="${db().settings.pace === "fast" ? "on" : ""}">精练</button></div></div>
      ${delN ? `<div class="st-row del-row"><div><b>已删除 ${delN} 道题</b><p class="sub">删掉的题在课时和复习里都不会再出现。</p></div><button class="btn ghost small" data-undel>全部恢复</button></div>` : ""}
      ${R ? `<button class="link danger" data-reset>清除这节课的进度</button>` : ""}
    </section>
    <footer class="hf">试课版 · 课程结构见 docs/REDESIGN.md</footer>
  </div>`;
  $("[data-start]", app).onclick = () => { const r = rec(L.id); if (r.done) { r.i = 0; delete r.curId; } startLesson(L); };
  $("[data-sum]", app)?.addEventListener("click", () => summary(L));
  const sk = $("[data-skip]", app);
  if (sk) sk.onclick = () => { if (sk.dataset.armed) skipLesson(L); else { sk.dataset.armed = 1; sk.textContent = "再点一次确认跳过"; } };
  $("[data-unskip]", app)?.addEventListener("click", () => { delete rec(L.id).skipped; save(); home(); });
  $("[data-undel]", app)?.addEventListener("click", () => { delete db().deleted[L.id]; save(); toast("已恢复全部题目"); home(); });
  $("[data-review]", app)?.addEventListener("click", () => startReview(L));
  $$("[data-pace]", app).forEach(b => b.onclick = () => { db().settings.pace = b.dataset.pace; save(); home(); });
  const rs = $("[data-reset]", app);
  if (rs) rs.onclick = () => { if (rs.dataset.armed) { resetLesson(L.id); toast("已清除"); home(); } else { rs.dataset.armed = 1; rs.textContent = "再点一次确认清除"; setTimeout(() => { if (rs.isConnected) { delete rs.dataset.armed; rs.textContent = "清除这节课的进度"; } }, 3000); } };
}

function reviewCard(L, R, K, due) {
  const flags = Object.keys(R.flags).length, cont = R.rv && R.rv.hi > 0;
  return `<article class="rcard ${due ? "due" : ""}">
    <div class="rc-top"><span class="pill">${due ? "到期复习" : "间隔复习"}</span><span class="sub">${K?.due ? `下次：${dueText(K.due)}（${K.due.slice(5)}）` : ""}</span></div>
    <h2>复习本课 · 约 5 分钟</h2>
    <p class="sub">${flags ? `先看你标了“没懂”的 ${flags} 屏，` : ""}再过一遍讲解，最后做 5 道没见过的产出题。成绩决定下次复习隔多久（1 → 3 → 7 → 15 → 30 天）。</p>
    <button class="primary ${due ? "ready" : "soft"}" data-review>${cont ? "继续复习" : due ? "开始复习" : "提前复习"}</button>
  </article>`;
}

// ---------- 课后小结 ----------
async function summary(L, extra = {}) {
  const R = rec(L.id), K = db().keys[L.keyId];
  const all = allScreens(L), ex = all.filter(s => s.exit);
  const flagged = all.filter(s => R.flags[s.id]);
  const wrong = all.filter(s => (R.ans[s.id] || R.ans[s.id + ".ask"])?.ok === false && !s.exit);
  const qs = all.filter(s => R.ans[s.id] && "ok" in R.ans[s.id] || R.ans[s.id + ".ask"]);
  const okN = qs.filter(s => (R.ans[s.id] || R.ans[s.id + ".ask"]).ok).length;
  const sc = extra.review || R.exit || { score: 0, n: ex.length };
  const carryN = db().carry.filter(c => c.from === L.id).length;
  app.innerHTML = `<div class="summary">
    <header class="sh"><button class="icon" data-home aria-label="回首页"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span>${extra.review ? "复习完成" : "这一课学完了"}</span></header>
    <div class="score-hero"><div class="ring" style="--p:${sc.score / sc.n}"><b>${sc.score}</b><span>/ ${sc.n}</span></div>
      <div><div class="sh-t">${extra.review ? "复习小测" : "出口小测"}</div><div class="sub">${sc.score === sc.n ? "全对，掌握得很好" : sc.score >= sc.n - 1 ? "基本掌握" : sc.score >= 3 ? "还有点不稳" : "需要再巩固"}</div>
      <div class="dots">${Array.from({ length: sc.n }, (_, i) => `<i class="${i < sc.score ? "on" : ""}" style="--d:${i}"></i>`).join("")}</div></div></div>
    <div class="stats">
      <div><b>${fmtMin(R.ms)}</b><span>分钟</span></div>
      <div><b>${okN}/${qs.length}</b><span>答对的题</span></div>
      <div><b>${K?.due ? dueText(K.due) : "—"}</b><span>下次复习</span></div>
    </div>
    ${flagged.length ? `<section class="list"><h3>标了“没懂”的 ${flagged.length} 屏</h3><p class="sub">复习本课时先讲这几屏${carryN ? `；其中 ${carryN} 道题会在下一课开场检索里先出` : ""}。</p>${flagged.map(s => `<div class="li">${esc(s.title || s.ins || s.q)}</div>`).join("")}</section>` : ""}
    ${wrong.length ? `<section class="list"><h3>答错的 ${wrong.length} 题</h3>${wrong.slice(0, 8).map(s => `<div class="li es">${esc(s.q || s.zh || s.title || s.ins)}</div>`).join("")}</section>` : ""}
    <section class="list"><h3>这一课的要点</h3>
      <div class="li">代词替代前面说过的直接宾语：<b class="es">lo · la · los · las</b>，性数看被替代的名词。</div>
      <div class="li">放在<b>变位动词前</b>：<span class="es">No la compro.</span> ¿<span class="es">La puedo devolver?</span></div>
      <div class="li">人作宾语也用：<span class="es">a Pedro → lo</span>；整件事用中性 <span class="es">lo</span>：<span class="es">Ya lo sé.</span></div>
    </section>
    <div class="sum-actions"><button class="primary ready" data-review>复习本课（约 5 分钟）</button><button class="btn ghost wide" data-home>回首页</button></div>
  </div>`;
  $$("[data-home]", app).forEach(b => b.onclick = home);
  $("[data-review]", app).onclick = () => { delete rec(L.id).rv; startReview(L); };
}

// 安卓返回键：播放器里回上一屏，首页退出
function androidBack() {
  if (player?.active) { player.back(); return; }
  if (!$(".home", app)) { home(); return; }
  AppPlugin?.exitApp();
}
const AppPlugin = Capacitor.isNativePlatform() ? registerPlugin("App") : null;
AppPlugin?.addListener("backButton", androidBack);
window.__babel = { home, db };
home();
