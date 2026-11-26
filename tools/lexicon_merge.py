#!/usr/bin/env python3
"""词库补丁：校验并合并 DeepSeek（或任何人）写的词库补丁文件。说明见 docs/LEXICON.md。

  python3 tools/lexicon_merge.py lexicon_inbox/*.json            只校验，不改词库
  python3 tools/lexicon_merge.py --apply lexicon_inbox/*.json    校验通过的条目合并进词库

补丁文件格式（一个 JSON 对象）：
  {"lang": "es",                                  en / es / ja
   "add_examples": {"casa": [["例句", "中文"], ...]},   给已有词加例句（每词合计最多 3 句）
   "new_words": {"词": [词条，格式同 words.json]},     新词（词库里没有的）
   "book": "b1"}                                  新词放进哪本词书（en: b1–b3；es: a1/a2/b1…；ja: n1/n0）
有错误的条目整条跳过；--apply 只合并没有错误的条目。"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = {"en": "data/words.json", "es": "es/words.json", "ja": "ja/words.json"}
MAX_EX = 3
CJK = re.compile(r"[一-鿿]")
KANA = re.compile(r"[぀-ヿ]")
HAN_ZH = re.compile(r"[们这么还说给对吗呢让过从为时习]")  # 只在简体中文里出现、日语里不用的字
BAD = ("…", "...", "___", "<", ">", "\n")
END = {"en": ".?!\"”'", "es": ".?!»\"”", "ja": "。？！」』"}
MAXLEN = {"en": 28, "es": 22, "ja": 70}  # 英西按词数，日语按字数
EN_POS = {"n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "det.", "num.", "int.", "phr.", "phr. v.", "aux.", "modal"}


def norm(s):
    return " ".join(str(s).split())


def check_example(lang, w, x, have):
    """返回错误列表；空列表表示这句可以用"""
    if not (isinstance(x, list) and len(x) == 2 and all(isinstance(t, str) and t.strip() for t in x)):
        return ["例句应为 [原文, 中文]"]
    t, zh = norm(x[0]), norm(x[1])
    errs = []
    if any(b in t or b in zh for b in BAD):
        errs.append("不能有省略号、___、尖括号或换行")
    if t in have:
        errs.append("和已有例句重复")
    if not CJK.search(zh):
        errs.append("中文译文里没有汉字")
    if KANA.search(zh):
        errs.append("中文译文里混进了假名")
    if lang in ("en", "es"):
        if CJK.search(t) or KANA.search(t):
            errs.append("原文里混进了中日文字")
        if len(t.split()) > MAXLEN[lang]:
            errs.append(f"原文太长（超过 {MAXLEN[lang]} 词）")
        if lang == "en" and w.lower().split()[0][:4] not in t.lower():
            errs.append("原文里看不到这个词（连词形变化也算在内）")
    else:
        if not KANA.search(t):
            errs.append("日语原文里没有假名")
        if HAN_ZH.search(t):
            errs.append("日语原文里混进了简体中文")
        if len(t) > MAXLEN["ja"]:
            errs.append(f"原文太长（超过 {MAXLEN['ja']} 字）")
    if t and t[-1] not in END[lang]:
        errs.append("原文没有以句末标点结尾")
    return errs


def check_entry(lang, w, e, book, lex):
    if w in lex:
        return ["词库里已经有这个词，请改用 add_examples"]
    errs = []
    n = {"en": (3, 4), "es": (6, 6), "ja": (6, 6)}[lang]
    if not isinstance(e, list) or not n[0] <= len(e) <= n[1]:
        return [f"词条应为 {n[0]}{'–' + str(n[1]) if n[1] != n[0] else ''} 个字段的数组"]
    senses, exs = e[1], e[2]
    if not (isinstance(senses, list) and senses and all(isinstance(s, list) and len(s) == 2 and CJK.search(str(s[1])) for s in senses)):
        errs.append("释义应为 [[词性, 中文释义], ...]")
    if not (isinstance(exs, list) and 1 <= len(exs) <= MAX_EX):
        errs.append(f"例句应有 1–{MAX_EX} 句")
    else:
        seen = set()
        for x in exs:
            for m in check_example(lang, w, x, seen):
                errs.append("例句：" + m)
            if isinstance(x, list) and x:
                seen.add(norm(x[0]))
    if lang == "en":
        if not re.fullmatch(r"/[^/]+/", str(e[0])):
            errs.append("音标应写成 /…/")
        if isinstance(senses, list) and any(isinstance(s, list) and s and s[0] not in EN_POS for s in senses):
            errs.append("词性请用 n. / v. / adj. / adv. / prep. / conj. / pron. / det. / num. / int. / phr. 之一")
    elif lang == "es":
        if e[0] not in ("", "m", "f", "mf"):
            errs.append("性别字段只能是 m / f / mf / 空")
        if isinstance(senses, list) and senses and senses[0][0] == "名" and not e[0]:
            errs.append("名词要写性别 m / f / mf")
        if e[3] != book.upper():
            errs.append(f"第 4 个字段（级别）应为 {book.upper()}")
    else:
        if not re.fullmatch(r"[぀-ヿー・]+", str(e[0])):
            errs.append("读音只能是假名")
        if not e[3]:
            errs.append("第 4 个字段（词性，如 名・サ変 / 動 / 形）不能空")
    return errs


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if not args:
        sys.exit(__doc__)
    data, changed = {}, set()
    tot = {"ex_ok": 0, "ex_bad": 0, "w_ok": 0, "w_bad": 0}
    for f in args:
        try:
            p = json.load(open(f, encoding="utf-8"))
        except Exception as ex:
            print(f"✗ {f}: 不是合法的 JSON（{ex}）")
            continue
        lang = p.get("lang")
        if lang not in PATH:
            print(f"✗ {f}: lang 应为 en / es / ja")
            continue
        if lang not in data:
            data[lang] = json.load(open(os.path.join(ROOT, PATH[lang]), encoding="utf-8"))
        d = data[lang]
        lex = d["e"]
        print(f"— {f}（{lang}）")
        for w, xs in (p.get("add_examples") or {}).items():
            if w not in lex:
                print(f"  ✗ {w}: 词库里没有这个词（新词请放 new_words）")
                tot["ex_bad"] += 1
                continue
            have = {norm(x[0]) for x in lex[w][2]}
            for x in xs if isinstance(xs, list) else []:
                errs = check_example(lang, w, x, have)
                if not errs and len(lex[w][2]) >= MAX_EX:
                    errs = [f"已经有 {MAX_EX} 句例句了"]
                if errs:
                    print(f"  ✗ {w}: {x[0] if isinstance(x, list) and x else x} —— {'；'.join(errs)}")
                    tot["ex_bad"] += 1
                    continue
                tot["ex_ok"] += 1
                have.add(norm(x[0]))
                if apply:
                    lex[w][2].append([norm(x[0]), norm(x[1])])
                    changed.add(lang)
        book = p.get("book", "")
        nw = p.get("new_words") or {}
        if nw and book not in d["books"] and not (lang == "es" and re.fullmatch(r"[abc][12]", book or "")):
            print(f"  ✗ new_words 需要合法的 book（现有：{', '.join(d['books'])}）")
            tot["w_bad"] += len(nw)
            nw = {}
        for w, e in nw.items():
            errs = check_entry(lang, w, e, book, lex)
            if errs:
                print(f"  ✗ 新词 {w}: {'；'.join(errs)}")
                tot["w_bad"] += 1
                continue
            tot["w_ok"] += 1
            if apply:
                e[2] = [[norm(x[0]), norm(x[1])] for x in e[2]]
                lex[w] = e
                d["books"].setdefault(book, [])
                if w not in d["books"][book]:
                    d["books"][book].append(w)
                changed.add(lang)
    print(f"\n例句：可用 {tot['ex_ok']}，有错 {tot['ex_bad']}；新词：可用 {tot['w_ok']}，有错 {tot['w_bad']}")
    if not apply:
        print("（只做了校验。确认后加 --apply 合并。）")
        return
    for lang in changed:
        p = os.path.join(ROOT, PATH[lang])
        json.dump(data[lang], open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))  # 三个词库都是紧凑格式
        print("已写入", PATH[lang])
    if changed:
        print("下一步：python3 tools/check_curriculum.py → 录音 → python3 tools/update_manifest.py（见 docs/LEXICON.md）")


if __name__ == "__main__":
    main()
