#!/usr/bin/env python3
"""重新计算 files.json 与 sw.js 里的文件哈希（SHA1 前 10 位），并更新 BUILD 号。

数据文件改动后运行一次：  python3 tools/update_manifest.py
- files.json / sw.js 的 FILES：按仓库里现有文件重算；新增的数据文件按 TRACK 里的目录自动收录
- sw.js 与 index.html 里的 BUILD 号换成当前时间 + index.html 哈希
"""
import hashlib, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACK = ["index.html", "manifest.webmanifest", "ja", "es", "audio", "icons", "data", "packs", "vendor", "dict", "curriculum"]
SKIP = {"ja/yomi.txt.gz"}


def sha(p):
    with open(os.path.join(ROOT, p), "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


def tracked():
    out = []
    for t in TRACK:
        full = os.path.join(ROOT, t)
        if os.path.isfile(full):
            out.append(t)
        elif os.path.isdir(full):
            for d, _, fs in os.walk(full):
                for f in sorted(fs):
                    rel = os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, "/")
                    if rel not in SKIP and not f.startswith(".") and not f.endswith(".md"):
                        out.append(rel)
    return out


def main():
    old = json.load(open(os.path.join(ROOT, "files.json"), encoding="utf-8"))
    files = {p: sha(p) for p in old if os.path.exists(os.path.join(ROOT, p))}
    for p in tracked():
        files.setdefault(p, sha(p))
    for p in list(files):
        files[p] = sha(p)
    changed = sorted(p for p in files if old.get(p) != files[p])
    build = time.strftime("%Y%m%d.%H%M") + "-" + files["index.html"][:6]
    text = json.dumps(files, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "files.json"), "w", encoding="utf-8") as f:
        f.write(text)
    sw = open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()
    sw = re.sub(r"const FILES = \{.*?\};", lambda m: "const FILES = " + text + ";", sw, count=1, flags=re.S)
    sw = re.sub(r'const BUILD = "[^"]*";', f'const BUILD = "{build}";', sw, count=1)
    sw = re.sub(r"版本 [0-9.]+-[0-9a-f]+", f"版本 {build}", sw, count=1)
    open(os.path.join(ROOT, "sw.js"), "w", encoding="utf-8").write(sw)
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    html2 = re.sub(r'window\.BABEL_BUILD="[^"]*"', f'window.BABEL_BUILD="{build}"', html, count=1)
    if html2 != html:
        open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(html2)
        # BUILD 号写进了 index.html，哈希随之变化，再记一次
        files["index.html"] = sha("index.html")
        text = json.dumps(files, ensure_ascii=False, separators=(",", ":"))
        open(os.path.join(ROOT, "files.json"), "w", encoding="utf-8").write(text)
        sw = re.sub(r"const FILES = \{.*?\};", lambda m: "const FILES = " + text + ";", sw, count=1, flags=re.S)
        open(os.path.join(ROOT, "sw.js"), "w", encoding="utf-8").write(sw)
    print("BUILD", build)
    print("changed:", ", ".join(changed) or "(none)")


if __name__ == "__main__":
    sys.exit(main())
