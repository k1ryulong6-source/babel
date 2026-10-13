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
VOICE_ID = {"en": "gf_en", "es": "gf_es", "ja": "gf_ja"}  # --voice m / fb / mb 时换成 gm_* / gfb_* / gmb_*
# 录音包前缀：女声 gen / ges / gja（沿用），其他声音 gmen、gfben、gmben、gmes……
bpre = lambda lang: "g" + VOICE_ID[lang].split("_")[0][1:].replace("f", "", VOICE_ID[lang].startswith("gf_")) + lang
# 听力材料里早期 Kokoro 声音 → 对应的 Google 声音（App 里 AudioBank.gv 是同一张表）
KOKORO = {"af": "gf_en", "am": "gm_en", "bf": "gfb_en", "bm": "gmb_en", "ef": "gf_es", "em": "gm_es"}
# 单词用 Studio（单词发音最好），句子用 Chirp3-HD（句子自然、比 Studio 便宜很多）。Neural2 的 /ɪ/ 偏开，不再使用。
VOICE_SETS = {
    # 日语没有 Studio 声音，单词和句子都用 Chirp3-HD（读音指定对日语无效，多音词改送假名，见 ja_input）
    "f": {"en": ("en-US-Studio-O", "en-US-Chirp3-HD-Kore"), "es": ("es-ES-Studio-C", "es-ES-Chirp3-HD-Kore"), "ja": ("ja-JP-Chirp3-HD-Kore", "ja-JP-Chirp3-HD-Kore")},
    "m": {"en": ("en-US-Studio-Q", "en-US-Chirp3-HD-Charon"), "es": ("es-ES-Studio-F", "es-ES-Chirp3-HD-Charon"), "ja": ("ja-JP-Chirp3-HD-Charon", "ja-JP-Chirp3-HD-Charon")},
    # 英音（托业听力有美、英等口音）：只用于听力台词
    "fb": {"en": ("en-GB-Studio-C", "en-GB-Chirp3-HD-Aoede")},
    "mb": {"en": ("en-GB-Studio-B", "en-GB-Chirp3-HD-Orus")},
}
GOOGLE_VOICE = VOICE_SETS["f"]
# 单独出现时 TTS 会读错或读得不确定的词：固定成课程想要的读音
# 同形异音词按词典第一个义项的读音（与 data/words.json 里显示的音标一致）
WORD_IPA = {"en": {
    "read": "ɹiːd", "live": "lɪv", "lead": "liːd", "close": "kloʊz", "use": "juːz", "tear": "tɛɹ", "wind": "wɪnd",
    "wound": "wuːnd", "record": "ˈɹɛkɚd", "present": "ˈpɹɛzənt", "object": "ˈɑbdʒɛkt", "project": "ˈpɹɑdʒɛkt",
    "subject": "ˈsʌbdʒɪkt", "content": "ˈkɑntɛnt", "desert": "ˈdɛzɚt", "minute": "ˈmɪnɪt", "contract": "ˈkɑntɹækt",
    "conduct": "kənˈdʌkt", "progress": "ˈpɹɑɡɹɛs", "perfect": "ˈpɝfɪkt", "excuse": "ɪkˈskjuːs", "estimate": "ˈɛstəmeɪt",
    "separate": "ˈsɛpəɹət", "attribute": "əˈtɹɪbjuːt", "convert": "kənˈvɝt", "produce": "pɹəˈduːs", "permit": "pɚˈmɪt",
    "refuse": "ɹɪˈfjuːz", "suspect": "səˈspɛkt", "row": "ɹoʊ", "house": "haʊs", "conflict": "ˈkɑnflɪkt",
    "contest": "ˈkɑntɛst", "entrance": "ˈɛntɹəns", "transfer": "tɹænsˈfɝ", "upset": "ʌpˈsɛt",
}}
# 句子里的同形异音词：按上下文规则指定读音
SENT_IPA = {"en": [(re.compile(r"\b(?:have|has|had|'ve|'d|already|just|never|ever)\s+read\b|\bread\b[^.?!]*\b(?:yesterday|last|ago)\b", re.I), "read", "ɹɛd")]}
PER_BUNDLE = 100
REBUILD = False
_cut = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence={}:detection=peak"
TRIM = ",".join([_cut.format(0.1), "areverse", _cut.format(0.2), "areverse"])
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


HAN_ONLY_ZH = re.compile(r"[们这么还说给对吗呢让过从为时习]")  # 简体中文常用字：用来排除混进日语里的中文译文


def speakable(t, lang="en"):
    """App 里显示（也是录音的键）的文本；不该录的返回 None。"""
    t = norm(strip_tags(t))
    if not t or "___" in t or "…" in t or len(t) > 400:
        return None
    if lang == "ja":
        if t.startswith("〜") or HAN_ONLY_ZH.search(t) or not CJK.search(t):
            return None
        return t
    if CJK.search(t) or "/" in t:
        return None
    return t


# 日语单词：只有一种读法的送汉字（音调更自然）；有几种读法的（市場、端……）送假名，保证读对
_JA = {}
def ja_input(t):
    if not _JA:
        _JA["e"] = J("ja/words.json")["e"]
        n = {}
        for ln in open(os.path.join(ROOT, "ja/accent.txt"), encoding="utf-8"):
            w = ln.split("\t", 1)[0]
            n[w] = n.get(w, 0) + 1
        _JA["n"] = n
    e = _JA["e"].get(t)
    if e and e[0] and _JA["n"].get(t, 1) > 1:
        return e[0]
    return t


def tts_input(t, lang="en"):
    """送给语音合成的文本：去掉对话破折号、音标、括注。"""
    if lang == "ja":
        return ja_input(t) if is_word(t, lang) else t
    t = re.sub(r"(^|\s)[—–-]\s*", r"\1", t)
    t = re.sub(r"/[^/\s][^/]*/", "", t)
    return norm(t)


def is_word(t, lang=None):
    """单词和短词组（不超过 3 个词、不以句末标点结尾）用单词声音，其余用句子声音。日语：没有句读、不超过 8 个字算单词。"""
    if lang == "ja" or CJK.search(t):
        return len(t) <= 8 and not re.search(r"[。、！？!?]", t)
    return len(t.split()) <= 3 and not re.search(r"[.?!¿¡]", t)


def voice_for(lang, t):
    return GOOGLE_VOICE[lang][0 if is_word(t, lang) else 1]


def prons_for(lang, t):
    if lang == "ja":
        return []
    if is_word(t):
        ipa = WORD_IPA.get(lang, {}).get(t.lower())
        return [(t, ipa)] if ipa else []
    return [(w, ipa) for rx, w, ipa in SENT_IPA.get(lang, []) if rx.search(t)]


# ---------- 收集文本 ----------
def lexicon(lang):
    return J({"en": "data/words.json", "es": "es/words.json", "ja": "ja/words.json"}[lang])["e"]


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
                    elif t == "key":
                        # 重点：例句、常错里的正确句
                        out += [x[0] for x in s.get("ex", [])] + [x[1] for x in s.get("err", []) if len(x) > 1]
                qs = l.get("exercises", []) + [s for s in l.get("steps", []) if s.get("t") in ("c", "f", "o", "tr", "dict")] + [s["check"] for s in l.get("steps", []) if s.get("check")]
                qs += [d for s in l.get("steps", []) if s.get("t") == "key" for d in s.get("drill", [])]
                for x in qs:
                    if x.get("say"):
                        out.append(x["say"])
                    if x.get("t") == "o":
                        out.append(x.get("a", ""))
                    if x.get("t") in ("tr", "dict"):
                        a = x.get("a")
                        out.append(a[0] if isinstance(a, list) else a)
            for x in d.get("test", {}).get("extra", []):
                if x.get("say"):
                    out.append(x["say"])
                if x.get("t") in ("tr", "dict"):
                    a = x.get("a")
                    out.append(a[0] if isinstance(a, list) else a)
    return out


def en_listen_data():
    """英语听力和 Part 2 材料写在 index.html 里（LISTENINGS / PART2），用 node 取出来。"""
    s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    a = s.index("const LISTENINGS = [")
    js = [s[a:s.index("\nconst LEVELS", a)]]
    js += re.findall(r"^(?:LISTENINGS\.unshift|const PART2 = |PART2\.push).*$", s, re.M)
    js.append("process.stdout.write(JSON.stringify({L: LISTENINGS, P: PART2}))")
    return json.loads(subprocess.run(["node", "-e", "\n".join(js)], capture_output=True, text=True, check=True).stdout)


def listen_lines(lang):
    """听力台词：每句按材料里分配的声音，只取当前 --voice 对应的那些。"""
    pairs = []
    if lang == "es":
        for it in J("packs/es-listening.json"):
            pairs += [(it["voices"].get(l["sp"], "ef_"), l["es"]) for l in it["lines"]]
    if lang == "en":
        d = en_listen_data()
        for m in d["L"]:
            pairs += [((m.get("voices") or {}).get(sp, "af_bella"), t) for sp, t, *_ in m["lines"]]
        for st in d["P"]:
            for it in st["items"]:
                pairs.append((it["qv"], it["q"]))
                pairs += [(it["ov"], f"{'ABC'[j]}. {o}") for j, o in enumerate(it["o"])]
    return [t for v, t in pairs if KOKORO.get(v[:2]) == VOICE_ID[lang]]


def collect(lang, sets):
    texts = []
    if "cur" in sets:
        texts += collect_curriculum(lang)
    if "words" in sets:
        texts += [w for w, e in lexicon(lang).items() if not (lang == "ja" and e[3] == "文型")]
    if "examples" in sets:
        texts += [x[0] for e in lexicon(lang).values() for x in e[2]]
        if lang == "es":
            texts += [x[0] for xs in J("packs/es-examples.json").values() for x in xs]
    if "listen" in sets:
        texts += listen_lines(lang)
    seen, out = set(), []
    for t in texts:
        t = speakable(t, lang)
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


# ---------- 合成 ----------
def cache_path(lang, t):
    # 按实际使用的 Google 声音分目录缓存，换声音不会误用旧录音；指定了读音的再带上读音的哈希，改规则会自动重录
    pr = prons_for(lang, t)
    return os.path.join(CACHE, voice_for(lang, t), key(lang, t) + (f"_{fnv(repr(pr))}" if pr else "") + ".mp3")


def synth_one(lang, t, kbps):
    p = cache_path(lang, t)
    if os.path.exists(p):
        return p
    from tts_google import synth
    raw = synth(tts_input(t, lang), lang, voice_for(lang, t), prons=prons_for(lang, t))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(raw)
        tmp = f.name
    # 压成单声道小码率 MP3（语音够用），控制仓库体积；同时把开头和结尾的静音裁到约 0.1 / 0.2 秒
    # （Chirp3-HD 的句子开头常有 0.4–0.7 秒静音，点播放后会明显卡一下）
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-af", TRIM, "-ac", "1", "-ar", "22050", "-b:a", f"{kbps}k", "-f", "mp3", p + ".part"], check=True)
    os.replace(p + ".part", p)
    os.unlink(tmp)
    return p


def seed_cache(lang, texts):
    """从仓库里现有的录音包恢复缓存（换了机器 / 会话后不必重录已有的录音）。"""
    pre = bpre(lang)
    want = {key(lang, t): t for t in texts if not os.path.exists(cache_path(lang, t))}
    n = 0
    for f in os.listdir(os.path.join(ROOT, "audio")):
        if not re.match(rf"{pre}_\d+\.json$", f) or not want:
            continue
        for k, b64 in json.load(open(os.path.join(ROOT, "audio", f))).items():
            t = want.pop(k, None)
            if t is None:
                continue
            p = cache_path(lang, t)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").write(base64.b64decode(b64))
            n += 1
    if n:
        print(f"[{lang}] 从现有录音包恢复缓存 {n} 条")


def run(lang, texts, kbps, workers):
    seed_cache(lang, texts)
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
    """增量写录音包：已有的包原样保留（不让仓库和 App 的离线下载整包重来），新录音放进新编号的包；
    不再用到的录音只从 audio/index.json 里去掉。--rebuild 时才整包重写。"""
    vid = VOICE_ID[lang]
    pre = bpre(lang)  # gen / ges / gja（男声 gmen / gmes / gmja）
    adir = os.path.join(ROOT, "audio")
    index_p = os.path.join(adir, "index.json")
    index = json.load(open(index_p, encoding="utf-8"))
    want = {key(lang, t): t for t in texts}
    if REBUILD:
        for f in os.listdir(adir):
            if re.match(rf"{pre}_\d+\.json$", f):
                os.remove(os.path.join(adir, f))
        index = {k: v for k, v in index.items() if not v.startswith(pre + "_")}
    have = {k for k, v in index.items() if v.startswith(pre + "_")}
    dropped = have - set(want)
    if len(dropped) > max(100, len(have) // 5) and not REBUILD:
        sys.exit(f"[{lang}] 这次会停用 {len(dropped)} 条已有录音，多半是 --sets 少写了（女声要带上 cur,words,examples,listen）。确认无误请加 --rebuild。")
    for k in dropped:
        del index[k]
    new = sorted(set(want) - have)
    nums = [int(m.group(1)) for f in os.listdir(adir) for m in [re.match(rf"{pre}_(\d+)\.json$", f)] if m]
    nxt = max(nums) + 1 if nums else 0
    for b in range(0, len(new), PER_BUNDLE):
        name, bundle = f"{pre}_{nxt}", {}
        for k in new[b:b + PER_BUNDLE]:
            bundle[k] = base64.b64encode(open(cache_path(lang, want[k]), "rb").read()).decode()
            index[k] = name
        json.dump(bundle, open(os.path.join(adir, name + ".json"), "w"), separators=(",", ":"))
        nxt += 1
    json.dump(index, open(index_p, "w"), separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(adir, f)) for f in os.listdir(adir) if f.startswith(pre + "_"))
    print(f"[{lang}] 共 {len(want)} 条：新增 {len(new)} 条（{(len(new) + PER_BUNDLE - 1) // PER_BUNDLE} 个新包），停用 {len(dropped)} 条；录音包合计 {size / 1e6:.1f} MB")


SAMPLE = {
    "en": ["ship", "sheep", "sip", "seat", "sit", "cap", "cup", "stop", "keep", "help", "map", "live", "read", "take off", "Our company has a new system.", "I read the report yesterday.", "I read the news every morning.", "Where do you live?", "Each team will try it this week.", "Please stop and help me keep the map."],
    "es": ["pero", "perro", "caro", "carro", "cinco", "ciudad", "calle", "Me llamo Ana. ¿Cómo te llamas?", "El perro corre por la calle.", "Tengo diez años."],
    "ja": ["検挙", "市場", "一段落", "箸", "橋", "示談", "逝去", "警察は昨日、会社の資金を着服した疑いで元社長を検挙した。", "本日をもって、当店は三十年の歴史に幕を下ろしました。", "一概に若者が悪いとは言えない。"],
}


def sample(kbps):
    rows = []
    for lang, ts in SAMPLE.items():
        for t in ts:
            p = synth_one(lang, t, kbps)
            rows.append(f'<tr><td>{lang}</td><td>{html.escape(t)}{"（送：" + html.escape(tts_input(t, lang)) + "）" if tts_input(t, lang) != t else ""}</td><td><audio controls preload="none" src="../{voice_for(lang, t)}/{os.path.basename(p)}"></audio></td></tr>')
    out = os.path.join(CACHE, "sample", "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(f'<!doctype html><meta charset="utf-8"><title>样音</title><table>{"".join(rows)}</table>')
    print("样音页：", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", default="cur,words", help="cur（课纲句子）, words（单词）, examples（词典例句）, listen（听力台词，按 --voice 取女声或男声的台词）")
    ap.add_argument("--langs", default="en,es")
    ap.add_argument("--kbps", type=int, default=32)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--voice", choices=sorted(VOICE_SETS), default="f", help="f 女声 / m 男声")
    ap.add_argument("--rebuild", action="store_true", help="整包重写录音包（一般不需要，会让仓库和离线下载变大）")
    a = ap.parse_args()
    REBUILD = a.rebuild
    GOOGLE_VOICE = VOICE_SETS[a.voice]
    VOICE_ID = {k: f"g{a.voice}_{k}" for k in VOICE_ID}
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
