// 课时播放器：一屏一个任务；可往回翻（答过的只读）、课内目录、“没懂”标记、段落过场
import { esc, $, $$, reduced, toast } from "./util.js";
import * as S from "./screens.js";
import * as audio from "./audio.js";
import { save } from "./store.js";

const FLAGGABLE = new Set(["teach", "read"]);
const flaggable = s => FLAGGABLE.has(s.t) || (s.t === "c" && s.reveal);
const KIND = { read: "短文", c: "选择", f: "填空", tr: "翻译", rw: "改写", dict: "听写", o: "连句", match: "配对", teach: "讲解", write: "写作", speak: "口语", free: "回答" };

// flow = { id, title, sections: [{id, name, short, intro, screens}] }
// store = { i, hi, ans, flags, ms }（课时记录，或复习记录）
export function openPlayer(app, flow, store, { onExit, onFinish, passage, onDelete, onSkipLesson }) {
  const list = []; flow.sections.forEach((sec, si) => sec.screens.forEach(s => list.push({ ...s, si })));
  const at = id => list.findIndex(x => x.id === id);
  if (store.curId) { const k = at(store.curId); store.i = k >= 0 ? k : Math.min(store.i || 0, list.length - 1); }
  if (store.hiId) { const k = at(store.hiId); if (k >= 0) store.hi = k; }
  store.i = Math.min(store.i || 0, list.length - 1); store.hi = Math.min(Math.max(store.hi || 0, store.i), list.length - 1);
  const fresh = new Set(), tmp = {};
  let t0 = performance.now(), busy = false, sheet = null;

  app.innerHTML = `<div class="player">
    <header class="ph">
      <button class="icon" data-close aria-label="退出">${X}</button>
      <button class="prog" data-toc aria-label="课内目录">${flow.sections.map((sec, si) => `<span class="seg" style="flex:${sec.screens.length}"><i data-seg="${si}"></i></span>`).join("")}</button>
      <button class="icon" data-menu aria-label="更多">${MORE}</button>
    </header>
    <div class="crumb"><span data-crumb></span><span class="cnt" data-cnt></span></div>
    <main class="stage"></main>
    <footer class="pf">
      <button class="back" data-back aria-label="上一屏">${BACK}</button>
      <button class="flag" data-flag hidden>没懂</button>
      <button class="primary" data-primary>继续</button>
    </footer>
    <button class="jump" data-jump hidden></button>
  </div>`;
  const root = $(".player", app), stage = $(".stage", root), btnP = $("[data-primary]", root), btnF = $("[data-flag]", root), btnB = $("[data-back]", root), jump = $("[data-jump]", root);

  const ctx = {
    tmp, fresh,
    ans: id => store.ans[id],
    set(id, v, quiet) { store.ans[id] = v; save(); if (quiet) return; fresh.add(id); paint(); },
    refresh: () => paint(),
    footer: () => footer(),
    passage: () => passage && openPassage(passage),
    entering: false,
  };
  const cur = () => list[store.i];

  function tick() { const now = performance.now(); store.ms = (store.ms || 0) + Math.min(now - t0, 5 * 60e3); t0 = now; }

  function header() {
    const s = cur(), sec = flow.sections[s.si];
    $$("[data-seg]", root).forEach(el => {
      const si = +el.dataset.seg, idx = list.map((x, i) => [x, i]).filter(([x]) => x.si === si);
      const reached = idx.filter(([, i]) => i <= store.hi).length, n = idx.length;
      el.style.transform = `scaleX(${reached / n})`;
      el.parentElement.classList.toggle("on", si === s.si);
    });
    const inSec = list.filter(x => x.si === s.si), k = inSec.indexOf(s) + 1;
    $("[data-crumb]", root).innerHTML = `<b>${"①②③④⑤⑥⑦⑧⑨"[s.si] || ""} ${esc(sec.name)}</b>`;
    $("[data-cnt]", root).textContent = `${k} / ${inSec.length}`;
  }

  function footer() {
    const s = cur(), el = $(".screen.cur", stage); if (!el) return;
    const p = S.primary(s, ctx, el), last = store.i === list.length - 1;
    const label = p.label === "继续" && last ? "完成" : p.label;
    btnP.textContent = label; btnP.disabled = !p.enabled; btnP.classList.toggle("ready", p.enabled);
    btnP.onclick = () => { if (!p.enabled) return; if (p.run) p.run(); else next(); };
    btnF.hidden = !flaggable(s); btnF.classList.toggle("on", !!store.flags[s.id]); btnF.textContent = store.flags[s.id] ? "已标没懂" : "没懂";
    btnB.disabled = store.i === 0;
    // 往回翻时，提供“回到当前进度”
    const behind = store.hi - store.i;
    jump.hidden = behind < 2; jump.textContent = `回到第 ${store.hi + 1} 屏 ›`;
  }

  // 重画当前屏（作答后），不做翻页动画
  function paint() {
    const el = $(".screen.cur", stage); if (!el) return;
    const st = stage.scrollTop;
    el.classList.add("static"); el.innerHTML = S.render(cur(), ctx); ctx.entering = false; S.bind(el, cur(), ctx);
    stage.scrollTop = st;
    const fb = $(".fb.anim, .reveal.anim", el);
    if (fb) setTimeout(() => { const r = fb.getBoundingClientRect(), sr = stage.getBoundingClientRect(); if (r.bottom > sr.bottom) stage.scrollBy({ top: r.bottom - sr.bottom + 24, behavior: reduced() ? "auto" : "smooth" }); }, 120);
    fresh.clear(); footer(); header();
  }

  function show(dir) {
    audio.stop(); const s = cur();
    if (s.t === "read" && !store.ans[s.id]) { store.ans[s.id] = { seen: true }; }
    const old = $(".screen.cur", stage);
    const el = document.createElement("section");
    el.className = "screen cur t-" + s.t; el.setAttribute("aria-label", KIND[s.t] || "");
    el.innerHTML = S.render(s, ctx);
    stage.appendChild(el); ctx.entering = true; S.bind(el, s, ctx); ctx.entering = false;
    stage.scrollTop = 0;
    if (old) {
      old.classList.remove("cur");
      const dx = dir === 0 ? 0 : (dir > 0 ? 1 : -1);
      const rm = reduced();
      const ease = "cubic-bezier(.22,.8,.24,1)";
      const outA = old.animate(rm || !dx ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-dx * 22}%)` }], { duration: 200, easing: ease, fill: "forwards" });
      outA.onfinish = () => old.remove(); setTimeout(() => old.remove(), 400);
      el.animate(rm || !dx ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${dx * 28}%)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: ease });
    }
    store.curId = s.id; store.hiId = list[store.hi].id;
    header(); footer(); save();
    const inp = $("[data-in]", el); if (inp && !matchMedia("(pointer:coarse)").matches) setTimeout(() => inp.focus({ preventScroll: true }), 260);
  }

  async function go(i, dir) {
    if (busy || i < 0 || i >= list.length || i > store.hi) return;
    tick();
    const d = dir ?? (i > store.i ? 1 : -1);
    const enteringNew = i > store.i && list[i].si !== list[store.i].si && !(store.secSeen ||= {})[list[i].si];
    store.i = i; store.hi = Math.max(store.hi, i);
    if (enteringNew) await secIntro(list[i].si);
    show(d);
  }

  function next() {
    const s = cur();
    if (!S.done(s, ctx)) return;
    if (store.i === list.length - 1) { tick(); save(); close(); onFinish?.(); return; }
    const i = store.i + 1;
    store.hi = Math.max(store.hi, i);
    go(i, 1);
  }
  function back() { if (sheet) return closeSheet(); if (store.i > 0) go(store.i - 1, -1); }

  function secIntro(si) {
    (store.secSeen ||= {})[si] = 1; save();
    const sec = flow.sections[si];
    return new Promise(res => {
      busy = true;
      const ov = document.createElement("div"); ov.className = "secintro";
      ov.innerHTML = `<div class="si-in"><div class="si-n">${"①②③④⑤⑥⑦⑧⑨"[si]}</div><div class="si-name">${esc(sec.name)}</div>${sec.min ? `<div class="si-min">约 ${sec.min} 分钟</div>` : ""}<p>${esc(sec.intro || "")}</p><div class="si-tap">点任意处继续</div></div>`;
      root.appendChild(ov);
      let t; const end = () => { clearTimeout(t); ov.classList.add("out"); setTimeout(() => ov.remove(), reduced() ? 120 : 320); busy = false; res(); };
      ov.onclick = end; t = setTimeout(end, 2600);
    });
  }

  // ---- 课内目录 ----
  function openToc() {
    if (sheet) return closeSheet();
    const rows = flow.sections.map((sec, si) => {
      const items = list.map((s, i) => [s, i]).filter(([s]) => s.si === si);
      const reached = items.filter(([, i]) => i <= store.hi);
      const chips = items.map(([s, i]) => {
        const a = store.ans[s.id] || store.ans[s.id + ".ask"];
        const st = i > store.hi ? "lock" : i === store.i ? "now" : a?.ok === false ? "bad" : a ? "ok" : "seen";
        return `<button class="chip-s ${st} ${store.flags[s.id] ? "flagged" : ""}" data-go="${i}" ${i > store.hi ? "disabled" : ""} title="${KIND[s.t] || ""}">${i + 1}</button>`;
      }).join("");
      return `<div class="toc-sec ${reached.length ? "" : "locked"}"><button class="toc-h" data-go="${items[0][1]}" ${items[0][1] > store.hi ? "disabled" : ""}><span class="n">${"①②③④⑤⑥⑦⑧⑨"[si]}</span><span class="nm">${esc(sec.name)}</span><span class="c">${reached.length}/${items.length}</span></button><div class="toc-chips">${chips}</div></div>`;
    }).join("");
    sheet = document.createElement("div"); sheet.className = "sheet-wrap";
    sheet.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-label="课内目录"><div class="grab"></div><h3>${esc(flow.title)}</h3><p class="sub">已学过的屏都可以点回去复看。答过的题只显示你的作答和解析。</p>${rows}<div class="legend"><span class="chip-s ok">✓</span>答对 <span class="chip-s bad">✗</span>答错 <span class="chip-s flagged seen"> </span>标了没懂</div></div>`;
    root.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("open"));
    $$("[data-go]", sheet).forEach(b => b.onclick = () => { const i = +b.dataset.go; closeSheet(); if (i !== store.i) go(i, i > store.i ? 1 : -1); });
    $("[data-x]", sheet).onclick = closeSheet;
  }
  function openPassage(p) {
    if (sheet) closeSheet();
    sheet = document.createElement("div"); sheet.className = "sheet-wrap";
    sheet.innerHTML = `<div class="scrim" data-x></div><div class="sheet tall" role="dialog" aria-label="短文"><div class="grab"></div><h3 class="es">${esc(p.title)}</h3>${p.lines.map(l => l[1] ? `<p class="pl"><span class="spk">${esc(l[0])}</span> <span class="es-r">${esc(l[1])}</span></p>` : "<br>").join("")}</div>`;
    root.appendChild(sheet); requestAnimationFrame(() => sheet.classList.add("open"));
    $("[data-x]", sheet).onclick = closeSheet;
  }
  // ---- 更多：目录 / 删除这道题 / 跳过这一段 / 跳过整节课 ----
  function openMenu() {
    if (sheet) return closeSheet();
    const s = cur(), canDel = !!onDelete && S.isQuestion(s), nextSec = list.findIndex(x => x.si > s.si);
    const items = [
      ["toc", "课内目录", "看所有段落，跳回学过的屏"],
      canDel && ["del", "删除这道题", "这道题以后不再出现（可在首页恢复）"],
      nextSec > 0 && ["skipsec", "跳过这一段", `直接去「${flow.sections[list[nextSec].si].name}」`],
      onSkipLesson && ["skiples", "跳过整节课", "标记为已跳过，回到首页（可撤销）"],
    ].filter(Boolean);
    sheet = document.createElement("div"); sheet.className = "sheet-wrap";
    sheet.innerHTML = `<div class="scrim" data-x></div><div class="sheet" role="dialog" aria-label="更多"><div class="grab"></div>${items.map(([k, t, d]) => `<button class="mi ${k === "del" || k === "skiples" ? "warn" : ""}" data-m="${k}"><b>${t}</b><span>${d}</span></button>`).join("")}</div>`;
    root.appendChild(sheet); requestAnimationFrame(() => sheet.classList.add("open"));
    $("[data-x]", sheet).onclick = closeSheet;
    $$("[data-m]", sheet).forEach(b => b.onclick = () => {
      const k = b.dataset.m;
      if ((k === "del" || k === "skiples") && !b.dataset.armed) { b.dataset.armed = 1; b.querySelector("b").textContent = k === "del" ? "再点一次确认删除" : "再点一次确认跳过这节课"; return; }
      closeSheet();
      if (k === "toc") setTimeout(openToc, 280);
      if (k === "del") { tick(); close(); onDelete(s.id, store.i); }
      if (k === "skipsec") { (store.skipped ||= {})[flow.sections[s.si].id] = 1; store.hi = Math.max(store.hi, nextSec); toast(`已跳过「${flow.sections[s.si].name}」，想补可以从目录点回去`); go(nextSec, 1); }
      if (k === "skiples") { close(); onSkipLesson(); }
    });
  }
  function closeSheet() {
    if (!sheet) return; const s = sheet; sheet = null; s.classList.remove("open"); setTimeout(() => s.remove(), reduced() ? 50 : 260);
  }

  function close() { tick(); save(); audio.stop(); document.removeEventListener("keydown", onKey); P.active = false; }

  // 事件
  $$("[data-toc]", root).forEach(b => b.onclick = openToc);
  $("[data-menu]", root).onclick = openMenu;
  $("[data-close]", root).onclick = () => { close(); onExit?.(); };
  btnB.onclick = back;
  jump.onclick = () => go(store.hi, 1);
  btnF.onclick = () => {
    const s = cur(); store.flags[s.id] = !store.flags[s.id]; if (!store.flags[s.id]) delete store.flags[s.id]; save(); footer();
    if (store.flags[s.id]) toast("记下了：课后复习会先讲这一屏，下一课开场也会先考它");
    btnF.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 260 });
  };
  // 右滑返回上一屏
  let sx = 0, sy = 0, st = 0;
  stage.addEventListener("touchstart", e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
  stage.addEventListener("touchend", e => { const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (dx > 80 && Math.abs(dy) < 50 && Date.now() - st < 600 && sx < innerWidth * 0.6) back(); }, { passive: true });
  const onKey = e => { if (e.target.matches("input,textarea")) return; if (e.key === "ArrowLeft") back(); if (e.key === "ArrowRight" && S.done(cur(), ctx)) next(); };
  document.addEventListener("keydown", onKey);

  const P = { active: true, back: () => { if (sheet) { closeSheet(); return true; } if (store.i > 0) { back(); return true; } close(); onExit?.(); return true; } };
  // 第一次打开：第一段的过场
  if (store.i === 0 && !store.secSeen?.[0]) secIntro(0).then(() => show(0)); else show(0);
  return P;
}

const X = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MORE = `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>`;
const LIST = `<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
