# 课纲编写辅助：用短函数写题，输出成单元 JSON
import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # 仓库根目录
def C(q, o, a, e="", say=None):
    d = {"t": "c", "q": q, "o": o, "a": a}
    if say: d["say"] = say
    if e: d["e"] = e
    return d
def F(q, a, e=""):
    d = {"t": "f", "q": q, "a": a if isinstance(a, list) else [a]}
    if e: d["e"] = e
    return d
def O(a, zh="", p=None):
    d = {"t": "o", "a": a}
    if p: d["p"] = p
    if zh: d["zh"] = zh
    return d
def G(title, points, ex=()):
    return {"title": title, "points": points, "examples": [list(x) for x in ex]}
def R(ref): return {"ref": ref}
def SP(w, t, zh, x=None, p="", pos=""):
    d = {"w": w, "t": t, "s": [[pos, zh]]}
    if p: d["p"] = p
    if x: d["x"] = [list(x)]
    return d
def L(title, words, grammar, special, exercises): return dict(title=title, words=words, grammar=grammar, special=special, exercises=exercises)
def unit(uid, title, goal, lessons, extra, n=20):
    out = {"id": uid, "title": title, "goal": goal, "lessons": [], "test": {"n": n, "extra": extra}}
    for i, l in enumerate(lessons, 1):
        out["lessons"].append({"id": f"{uid}.{i}", **l})
    lang, st, u = uid.split(".")
    path = f"{ROOT}/curriculum/{lang}/{st}-{u}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 单元阅读（story 课）由 story.py 另外写入，重写单元时保留在最后
    if os.path.exists(path):
        for l in json.load(open(path, encoding="utf-8"))["lessons"]:
            if l.get("story"):
                out["lessons"].append({**l, "id": f"{uid}.{len(out['lessons']) + 1}"})
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", path, len(lessons), "lessons", sum(len(l.get("exercises", l.get("steps", []))) for l in lessons) + len(extra), "q/steps")
B1 = json.load(open(f"{ROOT}/data/words.json"))["books"]["b1"]
def W(i, n=12): return B1[i * n:(i + 1) * n]

# ---- v2 步骤 ----
def I(title, lines, note=""):
    d = {"t": "intro", "title": title, "lines": [list(x) for x in lines]}
    if note: d["note"] = note
    return d
def T(title, body, ex=(), tip="", check=None, tipTitle=""):
    d = {"t": "teach", "title": title, "body": body if isinstance(body, list) else [body], "ex": [list(x) for x in ex]}
    if tip: d["tip"] = tip
    if tipTitle: d["tipTitle"] = tipTitle
    if check: d["check"] = check
    return d
def Wd(w, hint="", x=None):
    d = {"t": "word", "w": w}
    if hint: d["hint"] = hint
    if x: d["x"] = list(x)
    return d
def SPW(w, zh, x, t="固定搭配", hint="", p=""):
    d = {"t": "word", "w": w, "sp": True, "s": [["", zh]], "x": list(x), "tt": t}
    if hint: d["hint"] = hint
    if p: d["p"] = p
    return d
def SK(text, zh="", focus=""):
    d = {"t": "speak", "text": text, "zh": zh}
    if focus: d["focus"] = focus
    return d
def SUM(*points): return {"t": "sum", "points": list(points)}
def L2(title, steps): return dict(title=title, steps=steps)

# ---- v4 步骤 ----
def K(title, what, why=(), zh=(), ex=(), err=(), sum="", drill=()):
    d = {"t": "key", "title": title, "what": list(what) if not isinstance(what, str) else [what]}
    if why: d["why"] = [why] if isinstance(why, str) else list(why)
    if zh: d["zh"] = [zh] if isinstance(zh, str) else list(zh)
    if ex: d["ex"] = [list(x) for x in ex]
    if err: d["err"] = [list(x) for x in err]
    if sum: d["sum"] = sum
    d["drill"] = list(drill)
    return d
def TR(zh, a, e=""):
    d = {"t": "tr", "zh": zh, "a": a if isinstance(a, list) else [a]}
    if e: d["e"] = e
    return d
def DI(a, e=""):
    d = {"t": "dict", "a": a}
    if e: d["e"] = e
    return d
def WR(prompt, model="", hint="", focus=""):
    d = {"t": "write", "prompt": prompt}
    if hint: d["hint"] = hint
    if focus: d["focus"] = focus
    if model: d["model"] = model
    return d

# ---- 旧格式（v1）课时 → 新格式：单词、特殊词汇、题目、自写语法要点自动搬，重点等手写 ----
def V1LOAD(uid):
    """读旧格式单元；第一次读时备份原文件，之后重跑脚本都从备份读"""
    lang, st, u = uid.split(".")
    bak = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "v1", f"{lang}-{st}-{u}.json")
    if not os.path.exists(bak):
        os.makedirs(os.path.dirname(bak), exist_ok=True)
        src = open(f"{ROOT}/curriculum/{lang}/{st}-{u}.json", encoding="utf-8").read()
        assert '"steps"' not in src, f"{uid} 已经是新格式，找不到旧版备份"
        open(bak, "w", encoding="utf-8").write(src)
    return json.load(open(bak, encoding="utf-8"))
def _wstep(o, sp=False):
    if isinstance(o, str):
        d = {"t": "word", "w": o}
    else:
        d = {"t": "word", "w": o["w"], "s": o["s"]}
        if o.get("p"): d["p"] = o["p"]
        if o.get("x"): d["x"] = list(o["x"][0])
        if o.get("t"): d["tt"] = o["t"]
        if o.get("n"): d["hint"] = o["n"]
    if sp: d["sp"] = True
    return d
def V1(l, intro, keys=(), teach=None, keep_g=True, extra=(), sum=(), sk=None, split=6, hints=None, drop_ex=()):
    """l：旧课时；teach：额外讲解步骤；keep_g：是否把旧的自写语法要点转成讲解屏；hints：{词: 记忆提示}"""
    hints = hints or {}
    ws = [_wstep(o) for o in l.get("words", [])]
    for w in ws:
        if w["w"] in hints: w["hint"] = hints[w["w"]]
    sps = [_wstep(o, True) for o in l.get("special", [])]
    ts = list(teach or [])
    if keep_g:
        ts = [T(g["title"], g["points"], g.get("examples", [])) for g in l.get("grammar", []) if "ref" not in g] + ts
    ks = list(keys)
    steps = [intro, *ts[:1], *ws[:split]]
    if ks: steps.append(ks[0])
    steps += ts[1:] + ws[split:] + ks[1:] + sps
    if sk: steps.append(sk)
    steps += [x for i, x in enumerate(l.get("exercises", [])) if i not in drop_ex] + list(extra)
    steps.append(SUM(*sum))
    return dict(title=l["title"], steps=steps)
def unitV(uid, lessons, extra_test=(), title=None, goal=None):
    old = V1LOAD(uid)
    unit(uid, title or old["title"], goal or old.get("goal", ""), lessons, old.get("test", {}).get("extra", []) + list(extra_test), old.get("test", {}).get("n", 20))

# ---- 日语文型 → 重点（意思、接续、原例句从文型库取，其余手写）----
_BK = {}
def BKK(ref, *a, title=None):
    """BKK(文型, [补充说明], why, zh, ex, err, sum, drill)：补充说明可省略"""
    if not _BK:
        for b in json.load(open(f"{ROOT}/ja/words.json", encoding="utf-8"))["bunkei"]: _BK[b[0]] = b
    more = []
    if len(a) == 7: more, a = list(a[0]), a[1:]
    why, zh, ex, err, sm, drill = (list(a) + [(), (), (), (), "", ()])[:6] if len(a) < 6 else a
    b = _BK[ref.split(" / ")[0]]
    k = K(title or ref, [f"<b>意思</b>：{b[2]}", f"<b>接续</b>：{b[5]}", *more], why, zh, [(b[3], b[4]), *ex], err, sm, drill)
    assert all(isinstance(d, dict) for d in k["drill"]), ref
    return k

# ---- 第二学期起：从零写的新课时 ----
def NL(title, intro, words, keys, ex=(), sk=None, teach=(), sum=(), extra=()):
    """intro → (讲解1) → 前一半新词 → 重点1 → (其余讲解) → 后一半新词 → 其余重点 → 跟读 → 练习 → 小结"""
    ws = [Wd(w) if isinstance(w, str) else w for w in words]
    half = (len(ws) + 1) // 2
    teach, keys = list(teach), list(keys)
    steps = [intro, *teach[:1], *ws[:half]]
    if keys: steps.append(keys[0])
    steps += teach[1:] + ws[half:] + keys[1:]
    if sk: steps.append(sk)
    steps += list(ex) + list(extra) + [SUM(*sum)]
    return L2(title, steps)
def NEWUNIT(uid, lessons, extra=(), n=20, title=None, goal=None):
    """写新单元文件，并在 curriculum/index.json 里把 todo 换成 file"""
    lang, st, u = uid.split(".")
    ip = f"{ROOT}/curriculum/index.json"; idx = json.load(open(ip, encoding="utf-8"))
    meta = next(x for s in idx["langs"][lang]["stages"] for x in s["units"] if x["id"] == uid)
    unit(uid, title or meta["title"], goal or meta.get("goal", ""), lessons, list(extra), n)
    d = json.load(open(f"{ROOT}/curriculum/{lang}/{st}-{u}.json", encoding="utf-8"))
    idx = json.load(open(ip, encoding="utf-8"))
    for s in idx["langs"][lang]["stages"]:
        for x in s["units"]:
            if x["id"] == uid:
                x["file"] = f"curriculum/{lang}/{st}-{u}.json"; x["n"] = len(d["lessons"])
                if title: x["title"] = title
                if goal: x["goal"] = goal
                x.pop("todo", None); x.pop("plan", None)
    json.dump(idx, open(ip, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
import random as _rnd, hashlib as _hl
def CS(q, o, e="", say=None):
    """选择题：o 里第一个是正确答案，按题目固定打乱"""
    r = _rnd.Random(int(_hl.md5((q + (say or "")).encode()).hexdigest(), 16)); oo = list(o); r.shuffle(oo)
    return C(q, oo, oo.index(o[0]), e, say)
def ESLEX(book, rows):
    """往 es/words.json 加词条并放进词书 book。rows: (词, 性别 m/f/'', 词性, 中文, 例句, 例句中文, 备注)"""
    p = f"{ROOT}/es/words.json"; d = json.load(open(p, encoding="utf-8"))
    bk = d["books"].setdefault(book, [])
    for w, g, pos, zh, ex, exzh, *note in rows:
        old = d["e"].get(w)
        assert not old or old[3] == book.upper(), f"{w} 已在 {old[3]} 词书里"
        d["e"][w] = [g, [[pos, zh]], [[ex, exzh]] if ex else [], book.upper(), "", note[0] if note else ""]
        if w not in bk: bk.append(w)
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return [r[0] for r in rows]
def NW(w, ipa, pos, zh, ex, exzh, hint=""):
    """词库里没有的新词：自带音标、释义、例句"""
    d = {"t": "word", "w": w, "p": ipa, "s": [[pos, zh]], "x": [ex, exzh]}
    if hint: d["hint"] = hint
    return d

def LQ(question, o, e=""):
    """Part 2 听力题：只放录音，看不到问句；解析里给出原句"""
    return CS("🎧 听问句，选最合适的回答", o, ("问句：" + question + ("　" + e if e else "")), say=question)
