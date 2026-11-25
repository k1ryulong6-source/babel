// 本机存档（localStorage）。试课阶段够用；正式版换成 Capacitor Preferences / SQLite。
const KEY = "babel.app.v1";
let S = null;
export function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { S = {}; }
  S.lessons ||= {}; S.keys ||= {}; S.carry ||= []; S.settings ||= { pace: "std" };
  return S;
}
export const db = () => S || load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { } }
export const rec = id => (db().lessons[id] ||= { i: 0, hi: 0, ans: {}, flags: {}, ms: 0 });
export function resetLesson(id) { delete db().lessons[id]; const S = db(); for (const k of Object.keys(S.keys)) if (k.startsWith(id)) delete S.keys[k]; S.carry = S.carry.filter(c => c.from !== id); save(); }
