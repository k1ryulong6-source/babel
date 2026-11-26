#!/usr/bin/env python3
"""给出题的人（或 WorkBuddy / DeepSeek）生成单元简报：每课的重点、新词、已有题目示例。说明见 docs/QUESTION_BANK.md。

  python3 tools/bank_brief.py en.2.5                 打印一个单元的简报
  python3 tools/bank_brief.py --all bank_inbox/briefs 把所有已写好的单元各写一份简报到这个目录"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = re.compile(r"<[^>]+>")
NEED = 60  # 每单元题库目标题数（每课约 12 题）


def clean(s):
    return TAG.sub("", str(s)).strip()


def brief(uid):
    lang, st, u = uid.split(".")
    path = os.path.join(ROOT, "curriculum", lang, f"{st}-{u}.json")
    d = json.load(open(path, encoding="utf-8"))
    bank = d.get("bank", [])
    teach = [l for l in d["lessons"] if not l.get("story")]
    out = [f"# 单元简报：{uid} {d['title']}", "", f"单元目标：{d.get('goal', '')}", f"讲解课 {len(teach)} 课；题库现有 {len(bank)} 题，目标 {NEED} 题（每课约 {NEED // len(teach)} 题）。", ""]
    by_l = {}
    for x in bank:
        by_l[x.get("l")] = by_l.get(x.get("l"), 0) + 1
    for i, l in enumerate(teach, 1):
        steps = l.get("steps", [])
        out.append(f"## 第 {i} 课（l = {i}）：{l['title']}　题库已有 {by_l.get(i, 0)} 题")
        intro = next((s for s in steps if s["t"] == "intro"), None)
        if intro and intro.get("note"):
            out.append(f"情境：{clean(intro['note'])}")
        words = [s["w"] for s in steps if s["t"] == "word" and not s.get("sp")]
        sp = [s["w"] for s in steps if s["t"] == "word" and s.get("sp")]
        if words:
            out.append("新词：" + "、".join(words))
        if sp:
            out.append("搭配 / 表达：" + "、".join(sp))
        for s in steps:
            if s["t"] != "key":
                continue
            out.append(f"- 重点：{clean(s['title'])}")
            for w in s.get("what", []):
                out.append(f"  - {clean(w)}")
            if s.get("sum"):
                out.append(f"  - 一句话：{clean(s['sum'])}")
            for e in s.get("err", [])[:2]:
                out.append(f"  - 常错：{e[0]} → {e[1]}（{e[2] if len(e) > 2 else ''}）")
        ex = [s for s in steps if s["t"] in ("c", "f", "o", "tr")][:3]
        if ex:
            out.append("已有题目示例（不要重复，也不要只换几个词）：")
            for x in ex:
                if x["t"] == "c":
                    out.append(f"  - [c] {x['q']}　选项：{' / '.join(x['o'])}　答案：{x['o'][x['a']]}")
                elif x["t"] == "f":
                    out.append(f"  - [f] {x['q']}　答案：{x['a'][0]}")
                elif x["t"] == "tr":
                    out.append(f"  - [tr] {x['zh']} → {x['a'][0]}")
                else:
                    out.append(f"  - [o] {x['a']}")
        out.append("")
    return "\n".join(out)


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "--all":
        outdir = a[1] if len(a) > 1 else os.path.join(ROOT, "bank_inbox", "briefs")
        os.makedirs(outdir, exist_ok=True)
        idx = json.load(open(os.path.join(ROOT, "curriculum", "index.json"), encoding="utf-8"))
        n = 0
        for lang, L in idx["langs"].items():
            for st in L["stages"]:
                for u in st["units"]:
                    if u.get("file"):
                        open(os.path.join(outdir, u["id"] + ".md"), "w", encoding="utf-8").write(brief(u["id"]))
                        n += 1
        print(f"写了 {n} 份简报到 {outdir}")
    else:
        print(brief(a[0]))


if __name__ == "__main__":
    main()
