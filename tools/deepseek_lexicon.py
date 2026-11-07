#!/usr/bin/env python3
"""用 DeepSeek 批量补词库：生成补丁文件放进 lexicon_inbox/，再用 tools/lexicon_merge.py 校验合并。说明见 docs/LEXICON.md。

需要环境变量 DEEPSEEK_API_KEY（不要写进仓库）。

  python3 tools/deepseek_lexicon.py --lang es --task examples --limit 200
      给 es 词库里例句不足 3 句的词补例句（按词书顺序，已在 lexicon_inbox 里的词跳过，可反复运行接着做）
  python3 tools/deepseek_lexicon.py --lang es --task words --words b1.txt --book b1
      按 b1.txt（一行一个词）写完整新词条，放进词书 b1
可选：--batch 25（每次请求几个词）、--model deepseek-chat、--base-url https://api.deepseek.com、--dry-run（只打印提示词）"""
import argparse, glob, json, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = {"en": "data/words.json", "es": "es/words.json", "ja": "ja/words.json"}

COMMON = """你是一位资深外语教师兼词典编辑，为中国学习者编写词库例句。输出只能是一个 JSON 对象，不要任何解释。
例句要求：
- 自然、地道，是母语者真会说或写的句子；每句 6–18 个词（日语 15–45 字）；不要用省略号、___、括号注释。
- 每个新例句展示这个词的一个常用义项或常见搭配，尽量和已有例句的义项、场景不同，不要和已有例句雷同。
- 句子里必须出现这个词（可以是变位、复数等变化形式）。
- 中文译文用自然的简体中文，意思准确，不要逐字硬译。
- 不要引用书籍、歌词、新闻原文，不要出现真实名人的名字。"""
STYLE = {
    "en": "学习目标是托业（TOEIC）：例句多用职场、办公、出差、客户服务、购物、日常生活场景，用美式英语。",
    "es": "学习目标是西班牙语 A1–B1：例句只用简单常用的词和本级别学过的语法（现在时、过去时、将来时），场景是日常生活、旅行、学习、工作。用西班牙本土的说法。",
    "ja": "学习者已过 N1，目标是母语水平：例句用新闻、社论、评论、商务文书的书面语体，也可以有自然的口语句；汉字和假名的写法按日本报纸的标准。",
}
ENTRY = {
    "en": '词条格式：["/音标/", [["词性", "中文释义"], ...], [["例句", "中文"], ["例句", "中文"], ["例句", "中文"]]]。词性用 n. / v. / adj. / adv. / prep. / conj. / pron. / det. / num. / int. / phr. 之一；音标用美式 IPA。',
    "es": '词条格式：["性别", [["词性", "中文释义"], ...], [["例句", "中文"], ["例句", "中文"], ["例句", "中文"]], "级别", "英文释义（一两个词，可留空）", "学习注意（不规则变化、搭配、易错点，可留空）"]。性别：名词写 m / f / mf，其他词性写空字符串；词性用中文：名 / 动 / 形 / 副 / 介 / 连 / 代 / 短语；级别写大写，如 B1。',
    "ja": '词条格式：["读音（平假名）", [["词性", "中文释义"], ...], [["例句", "中文"], ["例句", "中文"], ["例句", "中文"]], "词性（名 / 名・サ変 / 動 / 形 / 形動 / 副 / 慣用句 / 四字熟語 等）", "常用搭配（用、分隔）", "学习注意（读音陷阱、中日同形异义、用法限制，可留空）"]。',
}


def load(lang):
    return json.load(open(os.path.join(ROOT, PATH[lang]), encoding="utf-8"))


def inbox_words(out, lang, key):
    seen = set()
    for f in glob.glob(os.path.join(out, "*.json")):
        try:
            p = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        if p.get("lang") == lang:
            seen |= set((p.get(key) or {}).keys())
    return seen


def call(args, system, user):
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        sys.exit("缺少环境变量 DEEPSEEK_API_KEY")
    body = {"model": args.model, "temperature": 0.7, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    req = urllib.request.Request(args.base_url.rstrip("/") + "/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                txt = json.load(r)["choices"][0]["message"]["content"]
            return json.loads(txt)
        except Exception as ex:
            print(f"  请求失败（{ex}），{2 ** attempt * 5} 秒后重试")
            time.sleep(2 ** attempt * 5)
    return None


def task_examples(args, d):
    lex = d["e"]
    order = [w for b in d["books"].values() for w in b] + list(lex)
    done = inbox_words(args.out, args.lang, "add_examples")
    todo, seen = [], set()
    for w in order:
        if w in seen or w not in lex:
            continue
        seen.add(w)
        if len(lex[w][2]) < 3 and w not in done:
            todo.append(w)
    todo = todo[:args.limit]
    print(f"[{args.lang}] 要补例句的词：{len(todo)} 个（每 {args.batch} 个一批）")
    system = COMMON + "\n" + STYLE[args.lang] + '\n输出格式：{"add_examples": {"词": [["例句", "中文"], ...], ...}}，每个词正好给出要求的句数。'
    for i in range(0, len(todo), args.batch):
        part = todo[i:i + args.batch]
        items = [{"word": w, "reading_or_ipa": lex[w][0], "senses": lex[w][1], "existing_examples": lex[w][2], "need": 3 - len(lex[w][2])} for w in part]
        user = "给下面每个词补充 need 句新例句：\n" + json.dumps(items, ensure_ascii=False, indent=0)
        yield part, system, user, "add_examples"


def task_words(args, d):
    if not args.words or not args.book:
        sys.exit("--task words 需要 --words 词表文件 和 --book 词书名")
    lex = d["e"]
    words = [ln.strip() for ln in open(args.words, encoding="utf-8") if ln.strip() and not ln.startswith("#")]
    done = inbox_words(args.out, args.lang, "new_words")
    todo = [w for w in dict.fromkeys(words) if w not in lex and w not in done][:args.limit]
    skipped = [w for w in words if w in lex]
    if skipped:
        print(f"  已在词库里、跳过：{'、'.join(skipped[:20])}{' 等' if len(skipped) > 20 else ''}")
    print(f"[{args.lang}] 要写的新词：{len(todo)} 个")
    sample = next(iter(lex.items()))
    level = args.book.upper()
    system = (COMMON + "\n" + STYLE[args.lang] + "\n" + ENTRY[args.lang] +
              f"\n参考现有词条：{json.dumps({sample[0]: sample[1]}, ensure_ascii=False)}" +
              ("\n级别字段统一写 " + level if args.lang == "es" else "") +
              '\n每个词给 2–4 个最常用的义项、正好 3 句例句。输出格式：{"new_words": {"词": [词条], ...}}')
    for i in range(0, len(todo), args.batch):
        part = todo[i:i + args.batch]
        yield part, system, "为下面这些词写完整词条：\n" + "\n".join(part), "new_words"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", required=True, choices=PATH)
    ap.add_argument("--task", required=True, choices=["examples", "words"])
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument("--words")
    ap.add_argument("--book")
    ap.add_argument("--out", default=os.path.join(ROOT, "lexicon_inbox"))
    ap.add_argument("--model", default="deepseek-chat")
    ap.add_argument("--base-url", default="https://api.deepseek.com")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    d = load(args.lang)
    gen = task_examples(args, d) if args.task == "examples" else task_words(args, d)
    for n, (part, system, user, key) in enumerate(gen, 1):
        if args.dry_run:
            print("=== system ===\n" + system + "\n=== user ===\n" + user[:3000])
            return
        print(f"  第 {n} 批：{part[0]} … {part[-1]}")
        res = call(args, system, user)
        if not isinstance(res, dict) or not isinstance(res.get(key), dict):
            print("  返回格式不对，跳过这一批")
            continue
        got = {w: v for w, v in res[key].items() if w in part}
        patch = {"lang": args.lang, key: got}
        if key == "new_words":
            patch["book"] = args.book
        f = os.path.join(args.out, f"{args.lang}_{args.task}_{time.strftime('%Y%m%d_%H%M%S')}_{n:03d}.json")
        json.dump(patch, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  写入 {os.path.relpath(f, ROOT)}（{len(got)} 个词）")
    print("完成。下一步：python3 tools/lexicon_merge.py lexicon_inbox/*.json")


if __name__ == "__main__":
    main()
