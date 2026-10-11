#!/usr/bin/env python3
"""批量预录：用 Google 神经语音把课纲句子、单词、例句录成 App 的录音包（audio/g*_N.json + audio/index.json）。

App 里 AudioBank 按 fnv(声音id + "|" + 文本) 找录音；新录音的声音 id 是 gf_en / gf_es，
有新录音就用新的，没有就退回旧录音或浏览器朗读（见 index.html 的 AudioBank.pick）。

需要环境变量 GOOGLE_TTS_API_KEY（云端环境设置里添加，不要写进仓库）和 ffmpeg。
每条录音先缓存在 tools/.tts_cache/（不进仓库），重跑不会重复计费。

  python3 tools/tts_batch.py --dry-run                     只统计条数和字数
  python3 tools/tts_batch.py --sample                      先录一小组样音（tools/.tts_cache/sample/index.html），确认音色
  加 --voice m 换成男声（默认 f 女声）；单词用 Studio 声音，句子用 Chirp3-HD 声音，见 VOICE_SETS
  python3 tools/tts_batch.py --sets cur,words              录课纲句子和单词，写入录音包
  python3 tools/tts_batch.py --sets cur,words,examples     再加上词典例句（体积大）
"""
import argparse, base64, concurrent.futures as cf, html, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".tts_cache")
VOICE_ID = {"en": "gf_en", "es": "gf_es"}
# 单词用 Studio（单词发音最好），句子用 Chirp3-HD（句子自然、比 Studio 便宜很多）。Neural2 的 /ɪ/ 偏开，不再使用。
VOICE_SETS = {
    "f": {"en": ("en-US-Studio-O", "en-US-Chirp3-HD-Kore"), "es": ("es-ES-Studio-C", "es-ES-Chirp3-HD-Kore")},
    "m": {"en": ("en-US-Studio-Q", "en-US-Chirp3-HD-Charon"), "es": ("es-ES-Studio-F", "es-ES-Chirp3-HD-Charon")},
}
GOOGLE_VOICE = VOICE_SETS["f"]
# 单独出现时 TTS 会读错或读得不确定的词：固定成课程想要的读音
WORD_IPA = {"en": {"read": "ɹiːd", "live": "lɪv"}}
# 句子里的同形异音词：按上下文规则指定读音
SENT_IPA = {"en": [(re.compile(r"\b(?:have|has|had|'ve|'d|already|just|never|ever)\s+read\b|\bread\b[^.?!]*\b(?:yesterday|last|ago)\b", re.I), "read", "ɹɛd")]}
PER_BUNDLE = 100
J = lambda p: json.load(open(os.path.join(ROOT, p), encoding="utf-8"))


def fnv(s):
    h = 0x811c9dc5
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


norm = lambda t: " ".join(str(t).split())
key = lambda lang, t: fnv(VOICE_ID[lang] + "|" + norm(t))
CJK = re.compile(r"[぀-ヿ一-鿿]")


def strip_tags(t):
    return html.unescape(re.sub(r"<[^>]+>", "", str(t)))


def speakable(t):
    """App 里显示（也是录音的键）的文本；不该录的返回 None。"""
    t = norm(strip_tags(t))
    if not t or CJK.search(t) or "___" in t or "…" in t or "/" in t or len(t) > 400:
        return None
    return t


def tts_input(t):
    """送给语音合成的文本：去掉对话破折号、音标、括注。"""
    t = re.sub(r"(^|\s)[—–-]\s*", r"\1", t)
    t = re.sub(r"/[^/\s][^/]*/", "", t)
    return norm(t)


def is_word(t):
    """单词和短词组（不超过 3 个词、不以句末标点结尾）用单词声音，其余用句子声音。"""
    return len(t.split()) <= 3 and not re.search(r"[.?!¿¡]", t)


def voice_for(lang, t):
    return GOOGLE_VOICE[lang][0 if is_word(t) else 1]


def prons_for(lang, t):
    if is_word(t):
        ipa = WORD_IPA.get(lang, {}).get(t.lower())
        return [(t, ipa)] if ipa else []
    return [(w, ipa) for rx, w, ipa in SENT_IPA.get(lang, []) if rx.search(t)]


# ---------- 收集文本 ----------
def lexicon(lang):
    return J({"en": "data/words.json", "es": "es/words.json"}[lang])["e"]


def collect_curriculum(lang):
    out = []
    idx = J("curriculum/index.json")["langs"][lang]
    lex = lexicon(lang)
    for st in idx["stages"]:
        for u in st["units"]:
            if not u.get("file"):
                continue
            d = J(u["file"])
            for l in d.get("lessons", []):
                for o in l.get("words", []) + l.get("special", []):
                    w = o if isinstance(o, str) else o.get("w", "")
                    out.append(w)
                    xs = (lex.get(w) or [None, None, []])[2] if isinstance(o, str) else o.get("x", [])
                    out += [x[0] for x in xs[:1]]
                for g in l.get("grammar", []):
                    out += [x[0] for x in g.get("examples", [])]
                for s in l.get("steps", []):
                    t = s.get("t")
                    if t == "intro":
                        out += [x[1] for x in s.get("lines", [])]
                    elif t == "teach":
                        out += [x[0] for x in s.get("ex", [])]
                    elif t == "word":
                        out.append(s.get("w", ""))
                        x = s.get("x") or ((lex.get(s.get("w")) or [None, None, []])[2] or [None])[0]
                        if x:
                            out.append(x[0])
                    elif t == "speak":
                        out.append(s.get("text", ""))
                for x in l.get("exercises", []) + [s for s in l.get("steps", []) if s.get("t") in ("c", "f", "o")] + [s["check"] for s in l.get("steps", []) if s.get("check")]:
                    if x.get("say"):
                        out.append(x["say"])
                    if x.get("t") == "o" and not x.get("p"):
                        out.append(x.get("a", ""))
            for x in d.get("test", {}).get("extra", []):
                if x.get("say"):
                    out.append(x["say"])
    return out


def collect(lang, sets):
    texts = []
    if "cur" in sets:
        texts += collect_curriculum(lang)
    if "words" in sets:
        texts += list(lexicon(lang))
    if "examples" in sets:
        texts += [x[0] for e in lexicon(lang).values() for x in e[2]]
        if lang == "es":
            texts += [x[0] for xs in J("packs/es-examples.json").values() for x in xs]
    seen, out = set(), []
    for t in texts:
        t = speakable(t)
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


# ---------- 合成 ----------
def cache_path(lang, t):
    # 按实际使用的 Google 声音分目录缓存，换声音不会误用旧录音
    return os.path.join(CACHE, voice_for(lang, t), key(lang, t) + ".mp3")


def synth_one(lang, t, kbps):
    p = cache_path(lang, t)
    if os.path.exists(p):
        return p
    from tts_google import synth
    raw = synth(tts_input(t), lang, voice_for(lang, t), prons=prons_for(lang, t))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(raw)
        tmp = f.name
    # 压成单声道小码率 MP3（语音够用），控制仓库体积
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-ac", "1", "-ar", "22050", "-b:a", f"{kbps}k", "-f", "mp3", p + ".part"], check=True)
    os.replace(p + ".part", p)
    os.unlink(tmp)
    return p


def run(lang, texts, kbps, workers):
    todo = [t for t in texts if not os.path.exists(cache_path(lang, t))]
    print(f"[{lang}] {len(texts)} 条，需新合成 {len(todo)} 条（{sum(len(t) for t in todo)} 字）")
    fails = []
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(synth_one, lang, t, kbps): t for t in todo}
        for i, f in enumerate(cf.as_completed(futs), 1):
            try:
                f.result()
            except Exception as e:
                fails.append((futs[f], str(e)[:120]))
            if i % 200 == 0:
                print(f"  {i}/{len(todo)}")
    for t, e in fails[:10]:
        print("  失败:", t[:60], e)
    return [t for t in texts if os.path.exists(cache_path(lang, t))]


def write_bundles(lang, texts):
    """把缓存里的录音按 100 条一包写进 audio/，并更新 audio/index.json（只替换本声音的旧条目）。"""
    vid = VOICE_ID[lang]
    pre = "g" + vid.split("_")[1]  # gen / ges
    for f in os.listdir(os.path.join(ROOT, "audio")):
        if re.match(rf"{pre}_\d+\.json$", f):
            os.remove(os.path.join(ROOT, "audio", f))
    index_p = os.path.join(ROOT, "audio", "index.json")
    index = json.load(open(index_p, encoding="utf-8"))
    index = {k: v for k, v in index.items() if not v.startswith(pre + "_")}
    texts = sorted(set(texts), key=lambda t: key(lang, t))
    for b in range(0, len(texts), PER_BUNDLE):
        name, bundle = f"{pre}_{b // PER_BUNDLE}", {}
        for t in texts[b:b + PER_BUNDLE]:
            k = key(lang, t)
            bundle[k] = base64.b64encode(open(cache_path(lang, t), "rb").read()).decode()
            index[k] = name
        json.dump(bundle, open(os.path.join(ROOT, "audio", name + ".json"), "w"), separators=(",", ":"))
    json.dump(index, open(index_p, "w"), separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(ROOT, "audio", f)) for f in os.listdir(os.path.join(ROOT, "audio")) if f.startswith(pre + "_"))
    print(f"[{lang}] 写入 {len(texts)} 条录音，{(len(texts) + PER_BUNDLE - 1) // PER_BUNDLE} 包，{size / 1e6:.1f} MB")


SAMPLE = {
    "en": ["ship", "sheep", "sip", "seat", "sit", "cap", "cup", "stop", "keep", "help", "map", "live", "read", "take off", "Our company has a new system.", "I read the report yesterday.", "I read the news every morning.", "Where do you live?", "Each team will try it this week.", "Please stop and help me keep the map."],
    "es": ["pero", "perro", "caro", "carro", "cinco", "ciudad", "calle", "Me llamo Ana. ¿Cómo te llamas?", "El perro corre por la calle.", "Tengo diez años."],
}


def sample(kbps):
    rows = []
    for lang, ts in SAMPLE.items():
        for t in ts:
            p = synth_one(lang, t, kbps)
            rows.append(f'<tr><td>{lang}</td><td>{html.escape(t)}</td><td><audio controls preload="none" src="../{voice_for(lang, t)}/{os.path.basename(p)}"></audio></td></tr>')
    out = os.path.join(CACHE, "sample", "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(f'<!doctype html><meta charset="utf-8"><title>样音</title><table>{"".join(rows)}</table>')
    print("样音页：", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", default="cur,words", help="cur（课纲句子）, words（单词）, examples（词典例句）")
    ap.add_argument("--langs", default="en,es")
    ap.add_argument("--kbps", type=int, default=32)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--voice", choices=sorted(VOICE_SETS), default="f", help="f 女声 / m 男声")
    a = ap.parse_args()
    GOOGLE_VOICE = VOICE_SETS[a.voice]
    if a.sample:
        sample(a.kbps)
        sys.exit()
    sets = set(a.sets.split(","))
    for lang in a.langs.split(","):
        texts = collect(lang, sets)
        if a.dry_run:
            by = {}
            for t in texts:
                by[voice_for(lang, t)] = by.get(voice_for(lang, t), 0) + len(t)
            print(f"[{lang}] {len(texts)} 条 · {sum(len(t) for t in texts)} 字（{'，'.join(f'{v} {n} 字' for v, n in by.items())}）· 已缓存 {sum(os.path.exists(cache_path(lang, t)) for t in texts)}")
            continue
        write_bundles(lang, run(lang, texts, a.kbps, a.workers))
    if not a.dry_run:
        print("记得运行 python3 tools/update_manifest.py")
