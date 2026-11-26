#!/usr/bin/env python3
"""给 App 里的课时预录音（Google TTS，增量）。

收集课时 JSON 里所有会出现播放键的西语句子，合成 mp3 到 www/audio/，并写 www/audio/index.json（句子 → 文件名）。
密钥用环境变量 GOOGLE_TTS_API_KEY（不要写进仓库）。
用法：python3 app/tools/build_audio.py
"""
import base64, glob, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(HERE, "..", "www")
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from tts_google import synth  # noqa: E402

plain = lambda s: re.sub(r"<[^>]+>", "", s)


def texts(L):
    out = []
    add = lambda t: t and out.append(plain(t).strip())
    def q(s):
        t = s.get("t")
        if t == "read":
            for l in s["lines"]: add(l[1])
        if s.get("lines") and t != "read":
            for l in s["lines"]: add(l[0])
        for e in s.get("ex", []): add(e[0])
        if t == "dict": add(s["a"])
        if t in ("tr", "rw"): add(s["a"][0])
        if t == "o": add(s["a"])
        if t == "free": add(s["q"]); add(s["model"])
        if t in ("write", "speak"): add(s["model"])
        if t == "match":
            for p in s["pairs"]: add(p[0])
        if s.get("say"): add(s["say"])
        if s.get("ask"): q(s["ask"])
        if s.get("recall"): q(s["recall"])
    for sec in L["sections"]:
        for s in sec["screens"]: q(s)
    for b in L.get("bank", []): q(b)
    return out


def main():
    idx_path = os.path.join(WWW, "audio", "index.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    want = []
    for f in sorted(glob.glob(os.path.join(WWW, "lessons", "*.json"))):
        for t in texts(json.load(open(f))):
            if t not in want: want.append(t)
    new = 0
    for i, t in enumerate(want):
        name = hashlib.sha1(t.encode()).hexdigest()[:12] + ".mp3"
        path = os.path.join(WWW, "audio", name)
        if not os.path.exists(path):
            # 对话里女声为主；讲解例句同一个声音，避免分心
            open(path, "wb").write(synth(t, "es"))
            new += 1
        idx[t] = name
    # 只保留现在还用得到的句子
    idx = {t: idx[t] for t in want}
    for f in glob.glob(os.path.join(WWW, "audio", "*.mp3")):
        if os.path.basename(f) not in idx.values(): os.remove(f)
    json.dump(idx, open(idx_path, "w"), ensure_ascii=False, indent=0)
    print(f"{len(want)} 句，新合成 {new} 句")


if __name__ == "__main__":
    main()
