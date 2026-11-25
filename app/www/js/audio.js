// 录音：优先用预录的 mp3（audio/index.json：句子 → 文件），没有时退回系统语音
let map = {}; const ready = fetch("audio/index.json").then(r => r.ok ? r.json() : {}).then(m => { map = m; }).catch(() => { });
let cur = null, token = 0;
export const has = async t => { await ready; return !!map[t]; };
export function stop() {
  token++; if (cur) { cur.pause(); cur = null; }
  try { speechSynthesis.cancel(); } catch { }
  document.querySelectorAll(".playing").forEach(e => e.classList.remove("playing"));
}
async function play(text, rate) {
  const f = map[text];
  if (f) {
    const a = cur = new Audio("audio/" + f); a.playbackRate = rate;
    await new Promise(res => { a.onended = a.onerror = res; a.play().catch(res); });
  } else if ("speechSynthesis" in window) {
    await new Promise(res => { const u = new SpeechSynthesisUtterance(text); u.lang = "es-ES"; u.rate = rate * 0.95; u.onend = u.onerror = res; speechSynthesis.speak(u); setTimeout(res, 12000); });
  }
}
export async function say(text, { rate = 1, btn } = {}) {
  await ready; stop(); const my = token; btn?.classList.add("playing");
  await play(text, rate);
  if (my === token) btn?.classList.remove("playing");
}
// 整篇播放：逐句播放并回调高亮；中途点别的（会调用 stop）就停
export async function sayAll(texts, onLine) {
  await ready; stop(); const my = token;
  for (let i = 0; i < texts.length; i++) {
    if (!texts[i]) continue;
    if (my !== token) return; onLine(i);
    await play(texts[i], 1);
    if (my !== token) return;
    await new Promise(r => setTimeout(r, 280));
  }
  if (my === token) onLine(-1);
}
