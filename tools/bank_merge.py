#!/usr/bin/env python3
"""单元题库补丁：校验并合并题库题目（unit.bank）。说明见 docs/QUESTION_BANK.md。

  python3 tools/bank_merge.py bank_inbox/*.json            只校验，不改课程文件
  python3 tools/bank_merge.py --apply bank_inbox/*.json    把校验通过的题追加进单元文件的 bank

补丁文件格式（一个 JSON 对象）：
  {"unit": "en.2.5",
   "questions": [
     {"l": 1, "t": "c", "q": "题干", "o": ["正确答案", "干扰1", "干扰2", "干扰3"], "e": "中文解析"},
     {"l": 2, "t": "c", "q": "🎧 What is the man asked to do?", "say": "录音原文", "o": ["正确", "干扰", "干扰"], "e": "解析"},
     {"l": 3, "t": "f", "q": "含 ___ 的句子", "a": ["答案", "其他可接受答案"], "e": "解析"},
     {"l": 4, "t": "tr", "zh": "中文句子", "a": ["译文一", "译文二"]},
     {"l": 5, "t": "o", "a": "Words in the right order.", "zh": "中文提示"},
     {"l": 5, "t": "o", "a": "私は毎朝新聞を読む", "p": ["私は", "毎朝", "新聞を", "読む"], "zh": "我每天早上看报纸。"},
     {"l": 1, "t": "dict", "a": "A sentence to write down after listening."}]}
- l：题目考的是第几课（1 起，只用讲解课，不用单元阅读课）。
- 选择题把正确答案写在 o 的第一个，不写 a；合并时按题目固定打乱。
- 题库只追加不改删：应用按题目在 bank 里的位置记录做题情况。"""
import hashlib, json, os, random, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from check_curriculum import check_ex  # noqa: E402

CJK = re.compile(r"[一-鿿]")
KANA = re.compile(r"[぀-ヿ]")
TYPES = {"c", "f", "o", "tr", "dict"}


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def qkey(x):
    """判重用的键：同类型、同题干（含录音原文）、同答案"""
    t = x.get("t")
    if t == "c":
        return ("c", norm(x.get("q")), norm(x.get("say")), norm(sorted(map(str, x.get("o", [])))))
    if t == "tr":
        return ("tr", norm(x.get("zh")))
    if t in ("o", "dict"):
        return (t, norm(x.get("a")))
    return (t, norm(x.get("q")))


def shuffle_c(x):
    """正确答案写在第一个 → 按题目固定打乱，算出 a"""
    o = list(x["o"])
    r = random.Random(int(hashlib.md5((x.get("q", "") + (x.get("say") or "")).encode()).hexdigest(), 16))
    oo = o[:]
    r.shuffle(oo)
    return {**x, "o": oo, "a": oo.index(o[0])}


def unit_file(uid):
    lang, st, u = uid.split(".")
    return os.path.join(ROOT, "curriculum", lang, f"{st}-{u}.json")


def existing_questions(d):
    out = []
    for l in d.get("lessons", []):
        for s in l.get("steps", []) + l.get("exercises", []):
            if s.get("t") in TYPES:
                out.append(s)
            if s.get("t") == "key":
                out += s.get("drill", [])
            if s.get("check"):
                out.append(s["check"])
    return out + d.get("test", {}).get("extra", []) + d.get("bank", [])


def check_q(x, lang, nteach):
    errs, warns = [], []
    if not isinstance(x, dict) or x.get("t") not in TYPES:
        return ["题型 t 应为 c / f / o / tr / dict"], warns
    t = x["t"]
    if not (isinstance(x.get("l"), int) and 1 <= x["l"] <= nteach):
        errs.append(f"l 应为 1–{nteach}（考第几课）")
    if t == "c":
        if "a" in x and x["a"] != 0:
            errs.append("选择题请把正确答案写在 o 的第一个，不要写 a")
        o = x.get("o") or []
        if not (isinstance(o, list) and 3 <= len(o) <= 4):
            errs.append("选择题要有 3–4 个选项")
        if not x.get("e"):
            warns.append("选择题最好写解析 e")
        y = {**x, "a": 0}
    else:
        y = x
    tmp = []
    check_ex(y, "", tmp)
    errs += [m.split(": ", 1)[-1] for m in tmp]
    texts = []
    if t == "tr":
        if not CJK.search(str(x.get("zh", ""))):
            errs.append("tr 的 zh 应为中文")
        texts = x.get("a") if isinstance(x.get("a"), list) else [x.get("a")]
    elif t in ("o", "dict"):
        texts = [x.get("a")]
    if x.get("say"):
        texts.append(x["say"])
        if len(x["say"]) > 400:
            errs.append("录音原文 say 超过 400 字符")
    for s in filter(None, map(str, texts)):
        if "…" in s or "..." in s or "___" in s:
            errs.append("录音或答案句里不能有省略号或 ___（录音工具会跳过）")
        if lang in ("en", "es") and (CJK.search(s) or KANA.search(s)):
            errs.append("外语答案或录音里混进了中日文字")
        if lang == "ja" and not KANA.search(s) and t != "o":
            warns.append("日语句子里没有假名，确认一下")
    if t == "dict" and lang == "ja":
        warns.append("日语听写判分要求汉字完全一致，慎用")
    return errs, warns


def main():
    files = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if not files:
        sys.exit(__doc__)
    units, changed, ok_n, bad_n = {}, set(), 0, 0
    for f in files:
        try:
            p = json.load(open(f, encoding="utf-8"))
        except Exception as ex:
            print(f"✗ {f}: 不是合法的 JSON（{ex}）")
            continue
        uid = p.get("unit", "")
        path = unit_file(uid) if re.fullmatch(r"(en|es|ja)\.\d+\.\d+", uid) else ""
        if not path or not os.path.exists(path):
            print(f"✗ {f}: 找不到单元 {uid!r}（单元还没写，或 id 写错）")
            continue
        if uid not in units:
            d = json.load(open(path, encoding="utf-8"))
            units[uid] = (d, {qkey(x) for x in existing_questions(d)})
        d, seen = units[uid]
        lang = uid.split(".")[0]
        nteach = len([l for l in d["lessons"] if not l.get("story")])
        print(f"— {f}（{uid}，讲解课 {nteach} 课，题库现有 {len(d.get('bank', []))} 题）")
        for i, x in enumerate(p.get("questions") or [], 1):
            errs, warns = check_q(x, lang, nteach)
            if not errs and qkey(x) in seen:
                errs = ["和单元里已有的题重复"]
            head = str(x.get("q") or x.get("zh") or x.get("a") or "")[:50] if isinstance(x, dict) else ""
            if errs:
                print(f"  ✗ 第{i}题「{head}」：{'；'.join(dict.fromkeys(errs))}")
                bad_n += 1
                continue
            for w in warns:
                print(f"  · 第{i}题「{head}」：{w}")
            ok_n += 1
            seen.add(qkey(x))
            if apply:
                y = {k: v for k, v in x.items() if v not in ("", None)}
                d.setdefault("bank", []).append(shuffle_c(y) if y["t"] == "c" else y)
                changed.add(uid)
    print(f"\n可用 {ok_n} 题，有错 {bad_n} 题")
    if not apply:
        print("（只做了校验。确认后加 --apply 合并。）")
        return
    for uid in changed:
        json.dump(units[uid][0], open(unit_file(uid), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("已写入", os.path.relpath(unit_file(uid), ROOT), f"（题库共 {len(units[uid][0]['bank'])} 题）")
    if changed:
        print("下一步：python3 tools/check_curriculum.py → 录音 → python3 tools/update_manifest.py（见 docs/QUESTION_BANK.md）")


if __name__ == "__main__":
    main()
