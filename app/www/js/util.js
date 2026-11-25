// 小工具：转义、确定性打乱、日期
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const hasCJK = s => /[㐀-鿿]/.test(s || "");

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// 按 id 固定打乱：同一题每次打开顺序一样（回看时不会变），但正确答案不总在第一个
export function order(n, seed) {
  const a = [...Array(n).keys()]; let h = hash(seed) || 1;
  for (let i = n - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift());
  return a;
}
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (n, from = today()) => { const d = new Date(from); d.setDate(d.getDate() + n); return dayStr(d); };
export const daysUntil = s => Math.round((new Date(s + "T00:00:00") - today()) / 864e5);
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export function toast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
