// 判分：忽略大小写、标点、多余空格；只错重音符号算“对，但注意重音”
const strip = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = s => (s || "").normalize("NFC").toLowerCase().replace(/[’`]/g, "'").replace(/[¿¡.,!?;:"“”«»()—–\-]/g, " ").replace(/\s+/g, " ").trim();
export function judge(input, answers) {
  const n = norm(input); if (!n) return null;
  if (answers.some(a => norm(a) === n)) return { ok: true };
  if (answers.some(a => strip(norm(a)) === strip(n))) return { ok: true, near: true };
  return { ok: false };
}
