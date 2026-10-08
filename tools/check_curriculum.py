#!/usr/bin/env python3
"""检查课纲文件：格式、课时 id、引用的词条与语法课是否存在、题目是否完整。

用法：python3 tools/check_curriculum.py        （有错误时退出码为 1）
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda p: json.load(open(os.path.join(ROOT, p), encoding="utf-8"))


def lexicon(lang):
    j = J({"en": "data/words.json", "es": "es/words.json", "ja": "ja/words.json"}[lang])
    words = {w.lower() for w in j["e"]}
    if lang == "ja":
        words |= {b[0].lower() for b in j.get("bunkei", [])}
    return words


def grammar_refs(lang):
    if lang == "en":
        html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        return set(re.findall(r'\{ ?"?id"?: ?"((?:b_|t_)[a-z]*|tense|perfect|passive|relative|noun|adverbial|subjunctive|nonfinite|inversion)"', html))
    if lang == "es":
        return {l["topic"] for l in J("packs/es-lesson.json")}
    return {b[0] for b in J("ja/words.json").get("bunkei", [])}


def check_ex(x, where, errs):
    t = x.get("t")
    if t == "c":
        if not x.get("q") or not isinstance(x.get("o"), list) or len(x["o"]) < 2 or not isinstance(x.get("a"), int) or not 0 <= x["a"] < len(x["o"]):
            errs.append(f"{where}: 选择题不完整 {x}")
        elif len(set(x["o"])) != len(x["o"]):
            errs.append(f"{where}: 选项重复 {x['o']}")
    elif t == "f":
        if not x.get("q") or "___" not in x["q"] or not isinstance(x.get("a"), list) or not x["a"]:
            errs.append(f"{where}: 填空题不完整 {x}")
    elif t == "o":
        parts = x.get("p") or str(x.get("a", "")).split()
        if not x.get("a") or len(parts) < 2:
            errs.append(f"{where}: 连词成句不完整 {x}")
        elif x.get("p") and "".join(x["p"]).replace(" ", "") != str(x["a"]).replace(" ", ""):
            errs.append(f"{where}: 片段拼起来和答案不一致 {x}")
    else:
        errs.append(f"{where}: 未知题型 {t}")


def main():
    idx = J("curriculum/index.json")
    errs, warns, stats = [], [], {}
    for lang, L in idx["langs"].items():
        lex, gram = lexicon(lang), grammar_refs(lang)
        seen_units, n_les, n_ex, n_words = set(), 0, 0, 0
        word_owner = {}
        for st in L["stages"]:
            for u in st["units"]:
                if u["id"] in seen_units:
                    errs.append(f"单元 id 重复 {u['id']}")
                seen_units.add(u["id"])
                if not u.get("file"):
                    if not u.get("todo"):
                        errs.append(f"{u['id']}: 既没有 file 也没有 todo")
                    continue
                if not os.path.exists(os.path.join(ROOT, u["file"])):
                    errs.append(f"{u['id']}: 文件不存在 {u['file']}")
                    continue
                d = J(u["file"])
                if d.get("id") != u["id"]:
                    errs.append(f"{u['file']}: id 应为 {u['id']}")
                for i, l in enumerate(d.get("lessons", []), 1):
                    n_les += 1
                    lid = f"{u['id']}.{i}"
                    if l.get("id") != lid:
                        errs.append(f"{u['file']}: 第 {i} 课 id 应为 {lid}，实为 {l.get('id')}")
                    if not l.get("title"):
                        errs.append(f"{lid}: 缺标题")
                    for o in l.get("words", []) + l.get("special", []):
                        if isinstance(o, str):
                            if o.lower() not in lex:
                                errs.append(f"{lid}: 词库里没有「{o}」")
                            w = o
                        else:
                            if not o.get("w") or not o.get("s"):
                                errs.append(f"{lid}: 自写词条缺 w 或 s {o}")
                            w = o.get("w", "")
                        if w.lower() in word_owner and word_owner[w.lower()] != lid:
                            warns.append(f"{lid}: 「{w}」已在 {word_owner[w.lower()]} 出现")
                        word_owner.setdefault(w.lower(), lid)
                    n_words += len(l.get("words", []))
                    for g in l.get("grammar", []):
                        if "ref" in g and g["ref"] not in gram:
                            errs.append(f"{lid}: 找不到语法课 {g['ref']}")
                        if "ref" not in g and not (g.get("title") and g.get("points")):
                            errs.append(f"{lid}: 语法点缺 title / points")
                    exs = l.get("exercises", [])
                    if len(exs) < 5:
                        warns.append(f"{lid}: 只有 {len(exs)} 道练习")
                    for k, x in enumerate(exs):
                        check_ex(x, f"{lid} 第{k + 1}题", errs)
                    n_ex += len(exs)
                for k, x in enumerate(d.get("test", {}).get("extra", [])):
                    check_ex(x, f"{u['id']} 测验第{k + 1}题", errs)
                    n_ex += 1
                if len(d.get("lessons", [])) != u.get("n", 5):
                    warns.append(f"{u['id']}: 课时数 {len(d.get('lessons', []))} 与目录 n={u.get('n')} 不一致")
        stats[lang] = f"{n_les} 课 · {n_words} 新词 · {n_ex} 题"
    for w in warns:
        print("提醒:", w)
    for e in errs:
        print("错误:", e)
    for k, v in stats.items():
        print(k, v)
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
