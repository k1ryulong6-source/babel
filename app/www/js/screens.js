// 每种屏的渲染、交互和底部主按钮。
// ctx: { ans(id) 取作答, set(id, v) 存作答, fresh: Set 刚作答的 id（播放反馈动画）, flow, refresh() 重画本屏, footer() 更新底部 }
import { esc, $, $$, order, hasCJK } from "./util.js";
import { judge } from "./judge.js";
import * as audio from "./audio.js";

const SPK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const SLOW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c0-4 3.5-7 8-7s7 2.5 7 5h2.5a1.5 1.5 0 0 1 0 3H4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="12.5" r="1.2" fill="currentColor"/></svg>`;
export const playBtn = (t, cls = "") => `<button class="play ${cls}" data-say="${esc(t)}" aria-label="播放">${SPK}</button>`;
const TYPED = new Set(["f", "tr", "rw", "dict", "free"]);
export const isQuestion = s => ["c", "f", "tr", "rw", "dict", "o", "match", "free"].includes(s.t);
const blankify = (q, inner) => esc(q).replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>").replace(/___/g, inner);
const heroCls = t => hasCJK(t) ? "hero zh" : "hero es";
// 去掉 HTML 标签（例句里有 <mark>）后再找录音
const plain = s => String(s).replace(/<[^>]+>/g, "");

// 作答是否完成（决定能不能“继续”）
export function done(s, ctx) {
  const a = ctx.ans(s.id);
  if (s.t === "teach") return !s.ask || !!ctx.ans(s.id + ".ask");
  if (s.t === "read") return true;
  if (s.t === "free") return !!a?.judged;
  if (s.t === "write" || s.t === "speak") return !!a?.done;
  return !!a;
}

// ---------- 渲染 ----------
export function render(s, ctx) {
  const R = RENDER[s.t]; if (!R) return `<p>未知屏：${esc(s.t)}</p>`;
  return R(s, ctx);
}

function head(s) {
  const tag = s.src ? `<span class="tag">${esc(s.src)}</span>` : s.lv ? `<span class="tag lv-${esc(s.lv)}">${{ 认: "辨认", 改: "半控制", 用: "自由产出" }[s.lv]}</span>` : "";
  return s.ins ? `<div class="ins">${tag}${esc(s.ins)}</div>` : tag ? `<div class="ins">${tag}</div>` : "";
}

function feedback(ok, html, fresh, extra = "") {
  return `<div class="fb ${ok ? "ok" : "bad"} ${fresh ? "anim" : ""}">${html}${extra}</div>`;
}

// 选择题（也用于“找规律”“讲解里的小问题”）
function choice(s, a, fresh, idp = s.id) {
  const ord = order(s.o.length, idp);
  const opts = ord.map((oi, k) => {
    const st = a ? (oi === s.a ? "right" : oi === a.v ? "wrong" : "dim") : "";
    const anim = fresh && a && (oi === a.v) ? (a.ok ? " pop" : " shake") : "";
    return `<button class="opt ${hasCJK(s.o[oi]) ? "zh" : "es"} ${st}${anim}" data-o="${oi}" ${a ? "disabled" : ""}><span class="key">${"ABCD"[k]}</span><span>${esc(s.o[oi])}</span></button>`;
  }).join("");
  let fb = "";
  if (a) {
    const why = s.why || [];
    fb = a.ok
      ? feedback(true, `<b class="verdict">✓ 答对了</b><p>${why[s.a] || s.e || ""}</p>`, fresh)
      : feedback(false, `<b class="verdict">✗ 你选了 ${esc(s.o[a.v])}</b>${why[a.v] ? `<p class="mis"><span>为什么会选它</span>${why[a.v]}</p>` : ""}<p><span class="lab">正确答案</span><b class="es-in">${esc(s.o[s.a])}</b>${why[s.a] ? "　" + why[s.a] : ""}</p>${s.e ? `<p>${s.e}</p>` : ""}`, fresh);
    if (s.reveal) fb += `<div class="reveal ${fresh ? "anim" : ""}"><span class="lab">规律</span>${s.reveal}</div>`;
  }
  const q = s.q === "🔊" ? `<div class="listen-hero">${playBtn(s.say, "big")}<button class="play slow" data-say="${esc(s.say)}" data-rate="0.7" aria-label="慢速播放">${SLOW}</button></div>`
    : `<div class="${heroCls(s.q)}">${blankify(s.q, `<span class="blank">${a ? esc(s.o[s.a]) : "＿＿"}</span>`)}</div>`;
  return `${q}<div class="opts">${opts}</div>${fb}`;
}

function typed(s, a, fresh, idp = s.id) {
  let hero = "", input = "";
  const ph = s.t === "dict" ? "写下听到的整句" : s.t === "f" ? "" : "写出整句";
  if (s.t === "f") {
    const inner = a ? `<span class="blank ${a.ok ? "right" : "wrong"}">${esc(a.v)}</span>` : `<input class="blank-in" data-in autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="填空">`;
    hero = `<div class="hero es">${blankify(s.q, inner)}</div>${s.zh ? `<div class="sub">${esc(s.zh)}</div>` : ""}`;
  } else if (s.t === "dict") {
    hero = `<div class="listen-hero">${playBtn(s.a, "big")}<button class="play slow" data-say="${esc(s.a)}" data-rate="0.7" aria-label="慢速播放">${SLOW}</button></div>`;
  } else if (s.t === "tr") {
    hero = `<div class="hero zh">${esc(s.zh)}</div>`;
  } else {
    hero = `<div class="hero es">${blankify(s.q, "")}${s.t === "free" ? playBtn(s.q) : ""}</div>`;
  }
  if (s.t !== "f") input = a ? `<div class="mine ${s.t === "free" ? "" : a.ok ? "right" : "wrong"}">${esc(a.v)}</div>` : `<textarea data-in rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${ph}"></textarea>`;
  let fb = "";
  if (a && s.t === "free") {
    fb = `<div class="fb neutral ${fresh ? "anim" : ""}"><span class="lab">参考答案</span><p class="model es-in">${esc(s.model)} ${playBtn(s.model)}</p><span class="lab">自己对照</span><ul class="checks">${s.check.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      ${a.judged ? `<p class="verdict ${a.ok ? "okc" : "badc"}">${a.ok ? "✓ 你判定：写对了" : "✗ 你判定：还没写对"}</p>` : `<div class="selfj"><button class="btn ghost" data-self="0">还没写对</button><button class="btn ok" data-self="1">我写对了</button></div>`}</div>`;
  } else if (a) {
    const model = s.t === "dict" ? s.a : s.a[0];
    const say = s.t === "f" ? "" : playBtn(model);
    if (a.ok) fb = feedback(true, `<b class="verdict">✓ ${a.self ? "按你的判断算对" : a.near ? "对了，注意重音符号" : "答对了"}</b>${a.near || (s.t !== "f" && s.t !== "dict") ? `<p><span class="lab">${a.near ? "标准写法" : "参考答案"}</span><span class="es-in">${esc(model)}</span> ${say}</p>` : ""}${s.e ? `<p>${s.e}</p>` : ""}`, fresh);
    else fb = feedback(false, `<b class="verdict">✗ 还不对</b><p><span class="lab">正确答案</span><span class="es-in">${esc(model)}</span> ${say}</p>${s.zh && s.t === "dict" ? `<p class="sub">${esc(s.zh)}</p>` : ""}${s.e ? `<p>${s.e}</p>` : ""}`, fresh,
      s.t === "tr" || s.t === "rw" ? `<button class="link" data-selfok>我的说法意思也对</button>` : "");
  }
  return `${hero}${input}${fb}`;
}

function orderQ(s, a, fresh, ctx) {
  const toks = s.p || s.a.split(" "), ord = order(toks.length, s.id);
  const built = a ? a.v : (ctx.tmp[s.id] ||= []);
  const used = new Set(built);
  const ans = built.map((ti, j) => `<button class="tok es" data-rm="${j}" ${a ? "disabled" : ""}>${esc(toks[ti])}</button>`).join("") || `<span class="ph">点下面的词，按顺序组成句子</span>`;
  const bank = a ? "" : `<div class="bank">${ord.map(ti => `<button class="tok es ${used.has(ti) ? "used" : ""}" data-add="${ti}" ${used.has(ti) ? "disabled" : ""}>${esc(toks[ti])}</button>`).join("")}</div>`;
  const fb = a ? (a.ok ? feedback(true, `<b class="verdict">✓ 答对了</b> ${playBtn(s.a)}${s.e ? `<p>${s.e}</p>` : ""}`, fresh) : feedback(false, `<b class="verdict">✗ 顺序不对</b><p><span class="lab">正确答案</span><span class="es-in">${esc(s.a)}</span> ${playBtn(s.a)}</p>${s.e ? `<p>${s.e}</p>` : ""}`, fresh)) : "";
  return `<div class="hero zh">${esc(s.zh)}</div><div class="built ${a ? (a.ok ? "right" : "wrong") : ""} ${fresh && a ? (a.ok ? "pop" : "shake") : ""}">${ans}</div>${bank}${fb}`;
}

function match(s, a, fresh, ctx) {
  const T = (ctx.tmp[s.id] ||= { got: [], sel: null, miss: 0 });
  const got = a ? s.pairs.map((_, i) => i) : T.got;
  const right = order(s.pairs.length, s.id + "r");
  const L = s.pairs.map((p, i) => `<button class="mt es ${got.includes(i) ? "got" : ""} ${T.sel === i && !a ? "sel" : ""}" data-l="${i}" ${got.includes(i) || a ? "disabled" : ""}>${esc(p[0])}</button>`).join("");
  const Rr = right.map(i => `<button class="mt zh ${got.includes(i) ? "got" : ""}" data-r="${i}" ${got.includes(i) || a ? "disabled" : ""}>${esc(s.pairs[i][1])}</button>`).join("");
  const fb = a ? feedback(true, `<b class="verdict">${a.miss ? `配完了（错配 ${a.miss} 次）` : "✓ 全部配对，一次没错"}</b>${s.e ? `<p>${s.e}</p>` : ""}`, fresh) : "";
  return `<div class="match"><div class="col">${L}</div><div class="col">${Rr}</div></div>${fb}`;
}

function linesBlock(lines) {
  return `<div class="exlines">${lines.map(([es, zh]) => `<div class="exl"><div class="es-l"><span>${es}</span>${playBtn(plain(es))}</div>${zh ? `<div class="sub">${esc(zh)}</div>` : ""}</div>`).join("")}</div>`;
}

const RENDER = {
  c(s, ctx) {
    const a = ctx.ans(s.id), fresh = ctx.fresh.has(s.id);
    return `${head(s)}${s.lines ? linesBlock(s.lines) : ""}${s.rd ? `<button class="chip" data-passage>回看短文</button>` : ""}${choice(s, a, fresh)}`;
  },
  f: (s, ctx) => head(s) + typed(s, ctx.ans(s.id), ctx.fresh.has(s.id)),
  tr: (s, ctx) => head(s) + typed(s, ctx.ans(s.id), ctx.fresh.has(s.id)),
  rw: (s, ctx) => head(s) + typed(s, ctx.ans(s.id), ctx.fresh.has(s.id)),
  dict: (s, ctx) => head(s) + typed(s, ctx.ans(s.id), ctx.fresh.has(s.id)),
  free: (s, ctx) => head(s) + typed(s, ctx.ans(s.id), ctx.fresh.has(s.id)),
  o: (s, ctx) => head(s) + orderQ(s, ctx.ans(s.id), ctx.fresh.has(s.id), ctx),
  match: (s, ctx) => head(s) + match(s, ctx.ans(s.id), ctx.fresh.has(s.id), ctx),
  read(s) {
    const lines = s.lines.map((l, i) => l[1] ? `<div class="rl" data-line="${i}"><span class="spk">${esc(l[0])}</span><span class="es-r">${esc(l[1])}</span><span class="zh-r"><span>${esc(l[2])}</span></span></div>` : `<div class="para"></div>`).join("");
    return `<div class="read-head"><div class="hero es title">${esc(s.title)}</div><p class="sub">${esc(s.note)}</p>
      <div class="read-tools"><button class="btn small accent" data-playall>${SPK}<span>整篇播放</span></button><button class="btn small ghost" data-allzh>显示全部中文</button></div></div>
      <div class="passage">${lines}</div>`;
  },
  teach(s, ctx) {
    const askA = s.ask && ctx.ans(s.id + ".ask"), fresh = ctx.fresh.has(s.id + ".ask");
    const body = (s.body || []).map(p => `<p>${p}</p>`).join("");
    const table = s.table ? `<table class="ptab">${s.table.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join("")}</tr>`).join("")}</table>` : "";
    const steps = s.steps ? `<ol class="wsteps">${s.steps.map(([k, v], i) => `<li style="--d:${i}"><b>${k}</b><span>${v}</span></li>`).join("")}</ol>` : "";
    const errs = s.errs ? `<div class="errs">${s.errs.map(([w, r, why]) => `<div class="err"><div class="w es-in">✗ ${esc(w)}</div><div class="r es-in">✓ ${esc(r)}</div><div class="why">${esc(why)}</div></div>`).join("")}</div>` : "";
    const ex = s.ex ? `<div class="exlines teach-ex">${s.ex.map(([es, zh]) => `<div class="exl"><div class="es-l"><span>${esc(es)}</span>${playBtn(es)}</div><div class="sub">${esc(zh)}</div></div>`).join("")}</div>` : "";
    let ask = "";
    if (s.ask) {
      const q = { ...s.ask, id: s.id + ".ask" };
      ask = `<div class="ask ${askA ? "answered" : ""}"><div class="ask-lab">${askA ? "小问题" : "先猜一猜"}</div>${q.ins ? `<div class="ins">${esc(q.ins)}</div>` : ""}${q.t === "c" ? choice(q, askA, fresh) : typed(q, askA, fresh)}</div>`;
    }
    return `<h2 class="t-title">${esc(s.title)}</h2><div class="t-body">${body}</div>${table}${steps}${errs}${ex}${ask}`;
  },
  write(s, ctx) {
    const a = ctx.ans(s.id), fresh = ctx.fresh.has(s.id);
    const input = a ? `<div class="mine long es-in">${esc(a.v)}</div>` : `<textarea data-in class="long" rows="6" autocapitalize="sentences" spellcheck="false" placeholder="Escribe aquí…">${esc(ctx.tmp[s.id] || "")}</textarea>`;
    const need = `<div class="need" data-need>${needText(s, a ? a.v : ctx.tmp[s.id] || "")}</div>`;
    const fb = a ? `<div class="fb neutral ${fresh ? "anim" : ""}"><span class="lab">参考范文</span><p class="model es-in">${esc(s.model)} ${playBtn(s.model)}</p><span class="lab">逐条自查（点一下打勾）</span><ul class="checks tick">${s.check.map((c, i) => `<li class="${a.checks?.[i] ? "on" : ""}" data-chk="${i}">${esc(c)}</li>`).join("")}</ul></div>` : "";
    return `${head(s)}<div class="prompt">${esc(s.prompt)}</div>${input}${need}${fb}`;
  },
  speak(s, ctx) {
    const a = ctx.ans(s.id), fresh = ctx.fresh.has(s.id), T = ctx.tmp[s.id] || {};
    const rec = `<div class="rec-row"><button class="recbtn ${T.recording ? "on" : ""}" data-rec>${T.recording ? "停止录音" : T.url ? "重新录" : "开始录音"}</button>${T.url ? `<button class="btn ghost small" data-mine>听我的录音</button>` : ""}</div>${T.err ? `<p class="sub">${esc(T.err)}</p>` : ""}`;
    const fb = a ? `<div class="fb neutral ${fresh ? "anim" : ""}"><span class="lab">参考说法</span><p class="model es-in">${esc(s.model)} ${playBtn(s.model)}</p><span class="lab">对照检查</span><ul class="checks">${s.check.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>` : "";
    return `${head(s)}<div class="prompt">${esc(s.prompt)}</div>${rec}${fb}`;
  },
};

function needText(s, text) {
  if (!s.need) return "";
  const n = (text.toLowerCase().match(new RegExp(s.need.re, "g")) || []).length;
  return `<span class="${n >= s.need.n ? "okc" : ""}">${s.need.label} ${Math.min(n, 99)} / ${s.need.n}</span>`;
}

// ---------- 交互 ----------
export function bind(root, s, ctx) {
  $$("[data-say]", root).forEach(b => b.onclick = e => { e.stopPropagation(); audio.say(b.dataset.say, { rate: +(b.dataset.rate || 1), btn: b }); });
  const askId = s.t === "teach" ? s.id + ".ask" : s.id, q = s.t === "teach" ? s.ask : s;
  // 选择
  $$("[data-o]", root).forEach(b => b.onclick = () => { if (ctx.ans(askId)) return; const v = +b.dataset.o; ctx.set(askId, { v, ok: v === q.a }); });
  // 输入框：回车提交
  const inp = $("[data-in]", root);
  if (inp) {
    inp.oninput = () => { if (s.t === "write") { ctx.tmp[s.id] = inp.value; const n = $("[data-need]", root); if (n) n.innerHTML = needText(s, inp.value); } ctx.footer(); };
    inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && s.t !== "write") { e.preventDefault(); primary(s, ctx, root).run?.(); } };
  }
  $("[data-selfok]", root)?.addEventListener("click", () => { const a = ctx.ans(askId); ctx.set(askId, { ...a, ok: true, self: true }); });
  $$("[data-self]", root).forEach(b => b.onclick = () => { const a = ctx.ans(s.id); ctx.set(s.id, { ...a, judged: true, ok: b.dataset.self === "1" }); });
  // 连词成句
  $$("[data-add]", root).forEach(b => b.onclick = () => { ctx.tmp[s.id].push(+b.dataset.add); ctx.refresh(); });
  $$("[data-rm]", root).forEach(b => b.onclick = () => { if (ctx.ans(s.id)) return; ctx.tmp[s.id].splice(+b.dataset.rm, 1); ctx.refresh(); });
  // 配对
  if (s.t === "match" && !ctx.ans(s.id)) {
    const T = ctx.tmp[s.id];
    $$("[data-l]", root).forEach(b => b.onclick = () => { T.sel = +b.dataset.l; $$("[data-l]", root).forEach(x => x.classList.toggle("sel", x === b)); audio.say(s.pairs[T.sel][0].replace(/^(el|la|los|las) /, m => m)); });
    $$("[data-r]", root).forEach(b => b.onclick = () => {
      if (T.sel == null) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); return; }
      const r = +b.dataset.r, l = $(`[data-l="${T.sel}"]`, root);
      if (r === T.sel) {
        T.got.push(r); T.sel = null; [l, b].forEach(x => { x.classList.remove("sel"); x.classList.add("got", "pop"); x.disabled = true; });
        if (T.got.length === s.pairs.length) setTimeout(() => ctx.set(s.id, { miss: T.miss, ok: T.miss === 0 }), 350);
      } else { T.miss++; [l, b].forEach(x => { x.classList.remove("shake"); void x.offsetWidth; x.classList.add("shake"); }); }
    });
  }
  // 短文
  if (s.t === "read") {
    const texts = s.lines.map(l => l[1]);
    $$(".rl", root).forEach(el => el.onclick = () => { el.classList.toggle("open"); audio.say(texts[+el.dataset.line]); });
    const all = $("[data-playall]", root);
    all.onclick = () => {
      if (all.classList.contains("on")) { audio.stop(); all.classList.remove("on"); $$(".rl.cur", root).forEach(x => x.classList.remove("cur")); return; }
      all.classList.add("on");
      audio.sayAll(texts, i => { $$(".rl", root).forEach(x => x.classList.toggle("cur", +x.dataset.line === i)); const c = $(".rl.cur", root); c?.scrollIntoView({ block: "center", behavior: "smooth" }); if (i < 0) all.classList.remove("on"); });
    };
    $("[data-allzh]", root).onclick = e => { const on = root.classList.toggle("allzh"); e.currentTarget.textContent = on ? "隐藏中文" : "显示全部中文"; };
  }
  // 写作自查
  $$("[data-chk]", root).forEach(li => li.onclick = () => { const a = ctx.ans(s.id); const c = [...(a.checks || [])]; c[+li.dataset.chk] = !c[+li.dataset.chk]; ctx.set(s.id, { ...a, checks: c }, true); li.classList.toggle("on"); });
  // 录音
  if (s.t === "speak") bindRec(root, s, ctx);
  $("[data-passage]", root)?.addEventListener("click", () => ctx.passage());
  // 自动播放：听力题、听写第一次出现时
  if ((s.say || s.t === "dict") && !ctx.ans(s.id) && ctx.entering) setTimeout(() => $(".play.big", root)?.click(), 380);
}

function bindRec(root, s, ctx) {
  const T = (ctx.tmp[s.id] ||= {});
  $("[data-rec]", root).onclick = async () => {
    if (T.recording) { T.mr?.stop(); return; }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(st), chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => { st.getTracks().forEach(t => t.stop()); T.recording = false; if (T.url) URL.revokeObjectURL(T.url); T.url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })); ctx.refresh(); };
      mr.start(); T.mr = mr; T.recording = true; T.err = ""; ctx.refresh();
    } catch { T.err = "没能打开麦克风（可能没有授权）。可以对着参考说法大声说一遍，再点“看参考说法”。"; ctx.refresh(); }
  };
  $("[data-mine]", root)?.addEventListener("click", () => { audio.stop(); new Audio(T.url).play(); });
}

// ---------- 底部主按钮 ----------
// 返回 { label, enabled, run }；run 不存在时由播放器执行“继续”
export function primary(s, ctx, root) {
  const id = s.t === "teach" ? s.id + ".ask" : s.id, q = s.t === "teach" ? s.ask : s;
  if (done(s, ctx)) return { label: "继续", enabled: true };
  if (s.t === "teach") return q.t === "c" ? { label: "先选一个答案", enabled: false } : checkTyped(q, id, ctx, root);
  if (s.t === "c") return { label: "选一个答案", enabled: false };
  if (s.t === "match") return { label: "把每一对都配上", enabled: false };
  if (s.t === "o") {
    const toks = s.p || s.a.split(" "), b = ctx.tmp[s.id] || [];
    return { label: "检查", enabled: b.length === toks.length, run: () => ctx.set(s.id, { v: b.slice(), ok: b.map(i => toks[i]).join(" ") === s.a }) };
  }
  if (s.t === "free") {
    const a = ctx.ans(s.id);
    if (a) return { label: "对照后判一下对错", enabled: false };
    const inp = $("[data-in]", root), v = inp?.value.trim() || "";
    return { label: "提交", enabled: !!v, run: () => v && ctx.set(s.id, { v }) };
  }
  if (s.t === "write") {
    const v = (ctx.tmp[s.id] || "").trim();
    return { label: v ? "提交，看范文" : "先写几句", enabled: v.length > 10, run: () => ctx.set(s.id, { v, done: true, checks: [] }) };
  }
  if (s.t === "speak") return { label: "看参考说法", enabled: !ctx.tmp[s.id]?.recording, run: () => ctx.set(s.id, { done: true, rec: !!ctx.tmp[s.id]?.url }) };
  if (TYPED.has(s.t)) return checkTyped(s, id, ctx, root);
  return { label: "继续", enabled: true };
}

function checkTyped(q, id, ctx, root) {
  const inp = $("[data-in]", root), v = inp?.value.trim() || "";
  const ans = q.t === "dict" ? [q.a] : q.a;
  return { label: "检查", enabled: !!v, run: () => { if (!v) return; const r = judge(v, ans); ctx.set(id, { v, ...r }); } };
}
