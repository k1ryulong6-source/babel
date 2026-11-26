// 入口：首页 → 课时播放器 → 课后小结 → 课后复习 / 间隔复习；跳过课程（以后再学 / 我已经会了）、删除题目
import { esc, $, $$, addDays, daysUntil, dayStr, today, toast } from "./util.js";
import { db, save, rec, resetLesson } from "./store.js";
import { openPlayer } from "./player.js";
import { Capacitor, registerPlugin } from "../vendor/capacitor-core.js";

const app = document.getElementById("app");
// 第一个是试课；后面的是按新结构做的其他课
const LESSONS = ["es.1.2.1", "es.2.5.1"];
const cache = {};
let player = null;
const INTERVALS = [1, 3, 7, 15, 30];
const REASONS = { bad: "题目有错", easy: "太简单", skip: "不想做" };

async function lesson(id) { return cache[id] ||= await (await fetch(`lessons/${id}.json`)).json(); }

// ---------- 删除题目：deleted[课时id][题目id] = 原因 ----------
function delMap(L) {
  const D = (db().deleted ||= {});
  if (Array.isArray(D[L.id])) D[L.id] = Object.fromEntries(D[L.id].map(id => [id, "skip"])); // 旧格式
  return (D[L.id] ||= {});
}
const isDel = (L, id) => !!(db().deleted?.[L.id] && delMap(L)[id]);
function delQuestion(L, flow, id, reason) {
  const s = flow.sections.flatMap(x => x.screens).find(x => x.id === id) || {};
  const real = s.bankId || s.srcId || id;
  delMap(L)[real] = reason || "skip"; save();
  toast(`已删除（${REASONS[reason] || "不想做"}），首页可以恢复`);
}
const allScreens = L => L.sections.flatMap(s => s.screens).filter(s => !isDel(L, s.id));
const findQ = (L, id) => L.sections.flatMap(s => s.screens).concat(L.bank).find(s => s.id === id);

// 课时 → 播放器用的 flow：按节奏去掉可选屏；把别的课标了“没懂”的题塞进开场检索
function lessonFlow(L) {
  const pace = db().settings.pace;
  const carry = db().carry.filter(c => c.from !== L.id).slice(0, 3);
  const sections = L.sections.map(sec => {
    let screens = sec.screens.filter(s => (pace !== "fast" || !s.opt) && !isDel(L, s.id));
    if (sec.id === "warm" && carry.length) screens = [...carry.map((c, k) => ({ ...c.item, id: "carry" + k, src: "之前没懂的地方" })), ...screens];
    return { ...sec, screens };
  }).filter(sec => sec.screens.length);
  return { id: L.id, title: `${L.unit} · ${L.title}`, sections };
}
const passageOf = L => L.sections.flatMap(s => s.screens).find(s => s.t === "read");

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
  for (const s of exitWrong) if (quiz.length < 3) quiz.push({ ...s, id: "ew-" + s.id + "-" + n, srcId: s.id, src: "上次小测错的" });
  const pool = L.bank.filter(b => !isDel(L, b.id));
  const bank = [...pool.filter(b => !seen.has(b.id)), ...pool.filter(b => seen.has(b.id))];
  for (const b of bank) if (quiz.length < 5) quiz.push({ ...b, id: b.id + "-" + n, bankId: b.id });
  quiz.forEach(q => q.exit = true);
  const mk = (s, p) => ({ ...s, id: p + s.id });
  const sections = [];
  if (flagged.length) sections.push({ id: "rf", name: "没懂的地方", short: "没懂", intro: "你标了“没懂”的屏，先再看一遍，小问题重新答。", screens: flagged.map(s => mk(s, "f-")) });
  if (rest.length) sections.push({ id: "rt", name: "讲解回顾", short: "回顾", intro: "把这一课的讲解快速过一遍，小问题再答一次。", screens: rest.map(s => mk(s, "t-")) });
  sections.push({ id: "rq", name: "出口小测（新题）", short: "小测", intro: "5 道没见过的产出题，不给提示。", screens: quiz });
  return { id: L.id + ".review", title: `复习 · ${L.title}`, sections };
}

// “我已经会了”：只做出口小测，答对 n-1 道以上算学完
function placementFlow(L) {
  const quiz = allScreens(L).filter(s => s.exit).map(s => ({ ...s, id: "pl-" + s.id, srcId: s.id }));
  return { id: L.id + ".placement", title: `测一测 · ${L.title}`, sections: [{ id: "pl", name: "测一测", short: "测试", min: 3, intro: `${quiz.length} 道出口小测题，答对 ${quiz.length - 1} 道以上就算学完这一课。`, screens: quiz }] };
}

function scheduleKey(L, score, n, start) {
  const K = (db().keys[L.keyId] ||= { step: -1 });
  const good = score >= n - 1, ok = score >= Math.ceil(n * 0.6);
  if (start != null) K.step = start;
  else K.step = good ? Math.min(K.step + (K.step < 0 && score === n ? 2 : 1), INTERVALS.length - 1) : ok ? Math.max(K.step, 0) : 0;
  K.due = addDays(INTERVALS[K.step]); K.last = dayStr(today()); save();
  return K;
}

function finishLesson(L) {
  const R = rec(L.id);
  const ex = allScreens(L).filter(s => s.exit), score = ex.filter(s => R.ans[s.id]?.ok).length;
  R.done ||= dayStr(today()); delete R.skipped; R.exit = { score, n: ex.length, at: dayStr(today()) };
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

function finishPlacement(L, PL) {
  const R = rec(L.id), quiz = placementFlow(L).sections[0].screens;
  const score = quiz.filter(s => PL.ans[s.id]?.ok).length, pass = score >= quiz.length - 1;
  R.placement = { at: dayStr(today()), score, n: quiz.length, pass }; delete R.pl;
  if (pass) { R.done = dayStr(today()); R.tested = true; delete R.skipped; scheduleKey(L, score, quiz.length, 2); } // 测过的从 7 天开始复习
  save(); placementResult(L, score, quiz.length, pass);
}

function startLesson(L) {
  const R = rec(L.id), F = lessonFlow(L);
  player = openPlayer(app, F, R, { onExit: home, onFinish: () => finishLesson(L), passage: passageOf(L),
    onDelete: (id, reason) => { delQuestion(L, F, id, reason); startLesson(L); }, onSkipLesson: () => skipSheet(L) });
}
function startReview(L) {
  const R = rec(L.id); R.rv ||= { i: 0, hi: 0, ans: {}, flags: {}, ms: 0, secSeen: {} };
  const F = reviewFlow(L, R);
  player = openPlayer(app, F, R.rv, { onExit: home, onFinish: () => finishReview(L, R.rv), passage: passageOf(L),
    onDelete: (id, reason) => { delQuestion(L, F, id, reason); startReview(L); } });
}
function startPlacement(L) {
  const R = rec(L.id); R.pl = { i: 0, hi: 0, ans: {}, flags: {}, ms: 0 };
  player = openPlayer(app, placementFlow(L), R.pl, { onExit: home, onFinish: () => finishPlacement(L, R.pl) });
}

// 跳过这节课：两个选项
function skipSheet(L) {
  player = null;
  const w = document.createElement("div"); w.className = "sheet-wrap fixed";
  w.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-label="跳过这节课"><div class="grab"></div><h3>跳过「${esc(L.title)}」</h3>
    <button class="mi" data-k="later"><b>以后再学</b><span>先放着，解锁后面的课；这一课仍显示为没学，随时可以回来。</span></button>
    <button class="mi" data-k="know"><b>我已经会了</b><span>先做这一课的 5 道出口小测，答对 4 道以上就算学完，从 7 天后开始复习。</span></button>
    <button class="mi" data-x><b>取消</b></button></div>`;
  document.body.appendChild(w); requestAnimationFrame(() => w.classList.add("open"));
  const close = () => { w.classList.remove("open"); setTimeout(() => w.remove(), 260); };
  $$("[data-x]", w).forEach(b => b.onclick = () => { close(); if (!$(".home", app)) home(); });
  $('[data-k="later"]', w).onclick = () => { close(); const R = rec(L.id); R.skipped = dayStr(today()); save(); toast("已跳过，想学随时回来"); home(); };
  $('[data-k="know"]', w).onclick = () => { close(); startPlacement(L); };
}

const fmtMin = ms => Math.max(1, Math.round((ms || 0) / 60000));
const dueText = d => { const n = daysUntil(d); return n <= 0 ? "今天" : n === 1 ? "明天" : `${n} 天后`; };

// ---------- 首页 ----------
async function home() {
  player = null;
  const Ls = await Promise.all(LESSONS.map(lesson));
  const delAll = Ls.flatMap(L => Object.entries(db().deleted?.[L.id] ? delMap(L) : {}).map(([id, r]) => ({ L, id, r })));
  app.innerHTML = `<div class="home">
    <header class="hh"><div class="brand">巴别塔</div><div class="date">${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}</div></header>
    ${Ls.map(L => { const R = db().lessons[L.id], K = db().keys[L.keyId]; return R?.done && K ? reviewCard(L, R, K) : ""; }).join("")}
    ${Ls.map((L, k) => (k === 1 ? `<h2 class="more-h">更多按新结构做的课</h2>` : "") + lessonCard(L, k === 0)).join("")}
    <section class="setting">
      <div class="st-row"><div><b>学习节奏</b><p class="sub">精练：跳过部分辨认题和词汇复习，约 35 分钟，适合时间紧的日子。</p></div>
        <div class="seg2" role="radiogroup"><button data-pace="std" class="${db().settings.pace !== "fast" ? "on" : ""}">标准</button><button data-pace="fast" class="${db().settings.pace === "fast" ? "on" : ""}">精练</button></div></div>
      ${delAll.length ? `<div class="del-box"><b>已删除 ${delAll.length} 道题</b><p class="sub">删掉的题在课时和复习里都不会再出现。点一道恢复它。</p>
        <div class="del-list">${delAll.map(d => { const q = findQ(d.L, d.id) || {}; return `<button class="del-i" data-undel="${esc(d.L.id)}|${esc(d.id)}"><span class="r r-${d.r}">${REASONS[d.r] || ""}</span><span class="q">${esc(q.q || q.zh || q.ins || d.id)}</span><span class="u">恢复</span></button>`; }).join("")}</div>
        <div class="row2">${delAll.some(d => d.r === "bad") ? `<button class="btn ghost small" data-export>复制“题目有错”的题</button>` : ""}<button class="btn ghost small" data-undelall>全部恢复</button></div></div>` : ""}
    </section>
    <footer class="hf">试课版 · 课程结构见 docs/REDESIGN.md</footer>
  </div>`;
  for (const L of Ls) bindCard(L);
  $$("[data-pace]", app).forEach(b => b.onclick = () => { db().settings.pace = b.dataset.pace; save(); home(); });
  $$("[data-undel]", app).forEach(b => b.onclick = () => { const [lid, id] = b.dataset.undel.split("|"); delete db().deleted[lid][id]; save(); toast("已恢复"); home(); });
  $("[data-undelall]", app)?.addEventListener("click", () => { db().deleted = {}; save(); toast("已恢复全部题目"); home(); });
  $("[data-export]", app)?.addEventListener("click", async () => {
    const bad = delAll.filter(d => d.r === "bad").map(d => ({ lesson: d.L.id, id: d.id, question: findQ(d.L, d.id) }));
    const text = JSON.stringify(bad, null, 1);
    try { await navigator.clipboard.writeText(text); toast(`已复制 ${bad.length} 道题，可以发给写课的人`); } catch { toast("复制失败"); console.log(text); }
  });
}

function lessonCard(L, trial) {
  const R = db().lessons[L.id];
  const total = lessonFlow(L).sections.reduce((n, s) => n + s.screens.length, 0);
  const pct = R ? Math.min(100, Math.round(((R.hi || 0) + (R.done ? 1 : 0)) / total * 100)) : 0;
  const skipped = R?.skipped && !R.done;
  const label = skipped ? "还是学一下" : !R?.hi && !R?.done ? (trial ? "开始试课" : "开始") : R.done ? "从头再学一遍" : `继续 · 第 ${R.i + 1} 屏`;
  const status = R?.tested ? `测试通过 ${R.placement.score}/${R.placement.n}` : R?.done ? "已学完" : R?.hi ? `已学 ${pct}%` : "";
  return `<article class="lcard ${R?.done ? "done" : ""} ${trial ? "" : "compact"}" data-lesson="${esc(L.id)}">
      <div class="unit">${esc(L.unit)}${trial ? " · 试课" : ""}${skipped ? `<span class="skipped">已跳过</span>` : ""}</div>
      <h1 class="es">${esc(L.title)}</h1>
      <p class="lsub">${esc(L.subtitle)}</p>
      ${trial ? `<ol class="struct">${L.sections.map((s, i) => `<li><span class="n">${"①②③④⑤⑥⑦"[i]}</span><span class="nm">${esc(s.name)}</span><span class="m">${s.min} 分</span></li>`).join("")}</ol>` : ""}
      <div class="meta"><span>约 ${L.minutes} 分钟 · ${total} 屏</span><span>${status}${R?.ms ? ` · 用时 ${fmtMin(R.ms)} 分` : ""}</span></div>
      ${R?.hi && !R.done ? `<div class="bar"><i style="transform:scaleX(${pct / 100})"></i></div>` : ""}
      <button class="primary ready" data-start>${label}</button>
      ${R?.done && R.exit ? `<button class="btn ghost wide" data-sum>看这一课的小结</button>` : ""}
      ${skipped ? `<button class="btn ghost wide" data-unskip>撤销跳过</button>` : !R?.done ? `<button class="btn ghost wide" data-skip>跳过这节课</button>` : ""}
      ${R ? `<button class="link danger" data-reset>清除这节课的进度</button>` : ""}
    </article>`;
}

function bindCard(L) {
  const c = $(`[data-lesson="${L.id}"]`, app); if (!c) return;
  $("[data-start]", c).onclick = () => { const r = rec(L.id); if (r.done) { r.i = 0; delete r.curId; } startLesson(L); };
  $("[data-sum]", c)?.addEventListener("click", () => summary(L));
  $("[data-skip]", c)?.addEventListener("click", () => skipSheet(L));
  $("[data-unskip]", c)?.addEventListener("click", () => { delete rec(L.id).skipped; save(); home(); });
  $(`[data-review="${L.id}"]`, app)?.addEventListener("click", () => startReview(L));
  const rs = $("[data-reset]", c);
  if (rs) rs.onclick = () => { if (rs.dataset.armed) { resetLesson(L.id); toast("已清除"); home(); } else { rs.dataset.armed = 1; rs.textContent = "再点一次确认清除"; setTimeout(() => { if (rs.isConnected) { delete rs.dataset.armed; rs.textContent = "清除这节课的进度"; } }, 3000); } };
}

function reviewCard(L, R, K) {
  const due = K?.due && daysUntil(K.due) <= 0, flags = Object.keys(R.flags).length, cont = R.rv && R.rv.hi > 0;
  return `<article class="rcard ${due ? "due" : ""}">
    <div class="rc-top"><span class="pill">${due ? "到期复习" : "间隔复习"}</span><span class="sub">${K?.due ? `下次：${dueText(K.due)}（${K.due.slice(5)}）` : ""}</span></div>
    <h2><span class="es">${esc(L.title)}</span> · 复习约 5 分钟</h2>
    <p class="sub">${flags ? `先看你标了“没懂”的 ${flags} 屏，` : ""}再过一遍讲解，最后做 5 道没见过的产出题。成绩决定下次复习隔多久（1 → 3 → 7 → 15 → 30 天）。</p>
    <button class="primary ${due ? "ready" : "soft"}" data-review="${esc(L.id)}">${cont ? "继续复习" : due ? "开始复习" : "提前复习"}</button>
  </article>`;
}

// ---------- “我已经会了”的结果 ----------
function placementResult(L, score, n, pass) {
  app.innerHTML = `<div class="summary">
    <header class="sh"><button class="icon" data-home aria-label="回首页">${BACK}</button><span>测一测 · ${esc(L.title)}</span></header>
    <div class="score-hero"><div class="ring" style="--p:${score / n}"><b>${score}</b><span>/ ${n}</span></div>
      <div><div class="sh-t">${pass ? "通过了，这一课算学完" : "还差一点"}</div><div class="sub">${pass ? "词和重点进入间隔复习，7 天后第一次复习。" : `答对 ${n - 1} 道才算通过。建议学一遍，大约 ${L.minutes} 分钟。`}</div></div></div>
    <div class="sum-actions">${pass ? `<button class="primary ready" data-home>回首页</button>` : `<button class="primary ready" data-learn>学一遍</button><button class="btn ghost wide" data-force>坚持跳过（以后再学）</button>`}</div>
  </div>`;
  $$("[data-home]", app).forEach(b => b.onclick = home);
  $("[data-learn]", app)?.addEventListener("click", () => startLesson(L));
  $("[data-force]", app)?.addEventListener("click", () => { rec(L.id).skipped = dayStr(today()); save(); home(); });
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
    <header class="sh"><button class="icon" data-home aria-label="回首页">${BACK}</button><span>${extra.review ? "复习完成" : "这一课学完了"}</span></header>
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
    ${L.points ? `<section class="list"><h3>这一课的要点</h3>${L.points.map(p => `<div class="li">${p}</div>`).join("")}</section>` : ""}
    <div class="sum-actions"><button class="primary ready" data-review>复习本课（约 5 分钟）</button><button class="btn ghost wide" data-home>回首页</button></div>
  </div>`;
  $$("[data-home]", app).forEach(b => b.onclick = home);
  $("[data-review]", app).onclick = () => { delete rec(L.id).rv; startReview(L); };
}
const BACK = `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 安卓返回键：播放器里回上一屏，首页退出
function androidBack() {
  const sh = document.querySelector("body > .sheet-wrap.open [data-x]"); if (sh) { sh.click(); return; }
  if (player?.active) { player.back(); return; }
  if (!$(".home", app)) { home(); return; }
  AppPlugin?.exitApp();
}
const AppPlugin = Capacitor.isNativePlatform() ? registerPlugin("App") : null;
AppPlugin?.addListener("backButton", androidBack);
window.__babel = { home, db };
home();
