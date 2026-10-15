"""单元阅读：每个单元最后加一课「单元阅读」—— 一篇只用学过的词和重点写的短文 + 理解题。
STORY(uid, title, note, lines, qs, sum)
  lines: [(原文, 中文), ..., "" 表示分段]
  qs: Q(问题, [正确, 干扰…], 解析) / TR(...)；选择题选项会按固定种子打乱"""
import json, os, random, hashlib
from h import ROOT, TR, SUM

def Q(q, o, e=""):
    return {"t": "c", "q": q, "o": list(o), "a": 0, "e": e}

def STORY(uid, title, note, lines, qs, points):
    lang, st, u = uid.split(".")
    path = f"{ROOT}/curriculum/{lang}/{st}-{u}.json"
    d = json.load(open(path, encoding="utf-8"))
    rnd = random.Random(int(hashlib.md5(uid.encode()).hexdigest(), 16))
    steps = [{"t": "read", "title": title, "note": note, "lines": [["", ""] if x == "" else list(x) for x in lines]}]
    for q in qs:
        q = dict(q, rdq=True)
        if q["t"] == "c":
            right = q["o"][0]; o = q["o"][:]; rnd.shuffle(o); q["o"] = o; q["a"] = o.index(right)
        steps.append(q)
    steps.append(SUM(*points))
    d["lessons"] = [l for l in d["lessons"] if not l.get("story")]
    d["lessons"].append({"id": f"{uid}.{len(d['lessons']) + 1}", "title": f"单元阅读：{title}", "story": True, "steps": steps})
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ip = f"{ROOT}/curriculum/index.json"; idx = json.load(open(ip, encoding="utf-8"))
    for s in idx["langs"][lang]["stages"]:
        for x in s["units"]:
            if x["id"] == uid: x["n"] = len(d["lessons"])
    json.dump(idx, open(ip, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    n = sum(len(x[0].split()) if lang != "ja" else len(x[0]) for x in lines if x)
    print(f"{uid} story「{title}」{len([x for x in lines if x])} 句 · {n} {'字' if lang == 'ja' else '词'} · {len(qs)} 题")
