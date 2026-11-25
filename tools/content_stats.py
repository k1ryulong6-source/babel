#!/usr/bin/env python3
"""统计各单元的内容量，对照 docs/REDESIGN.md 的新课标准。

用法（在仓库根目录）：
    python3 tools/content_stats.py            # 打印每单元一行的 Markdown 表
    python3 tools/content_stats.py --totals   # 只打印各语言合计

口径（都按“讲解课”算，不含每单元最后一节单元阅读课）：
- 词/课：word 步骤数。
- 重点/课：key 步骤数。
- 输入量/课：情境（intro）里目标语的词数，日语按字数。新标准 150–250 词，日语 400–600 字。
- 练习/课：独立练习题 + 重点里的 drill 题。
- 产出占比：填空、连词成句、中译外、听写、写作 占全部练习的比例。新标准 ≥ 50%。
- 选择题解析：选择题里带解析（e）的比例。新标准 100%，而且每个干扰项都要解析。
- 新词进情境：新词在情境原文里出现的比例（按词干粗略匹配，只作参考）。
- 写作：整个单元的写作任务数。新标准每课 1 个。
- 例句：本单元新词在词库里的平均例句数。新标准 3 句。
- 题库：bank 题数。新标准每单元 60 题。
"""
import json, re, sys, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROD = {'f', 'o', 'tr', 'dict', 'write'}
LEX = {'en': 'data/words.json', 'es': 'es/words.json', 'ja': 'ja/words.json'}


def count_words(lang, s):
    s = re.sub(r'<[^>]+>', '', s)
    if lang == 'ja':
        return len(re.sub(r'\s', '', s))
    return len(re.findall(r"[\wáéíóúñü'’-]+", s, re.I))


def unit_stats(lang, path, lex):
    d = json.loads((ROOT / path).read_text())
    lessons = [l for l in d['lessons'] if not l.get('story')]
    story = [l for l in d['lessons'] if l.get('story')]
    c = collections.Counter()
    r = collections.Counter()
    ex_n = []
    for l in lessons:
        steps = l.get('steps', [])
        r['screens'] += len(steps)
        intro = ' '.join(x[1] for s in steps if s['t'] == 'intro' for x in s['lines'])
        r['input'] += count_words(lang, intro)
        low = intro.lower()
        for s in steps:
            t = s['t']
            c[t] += 1
            qs = [s] if t in PROD | {'c', 'lq'} else (s.get('drill', []) if t == 'key' else [])
            for q in qs:
                r['ex'] += 1
                r['prod'] += q['t'] in PROD
                if q['t'] in ('c', 'lq'):
                    r['choice'] += 1
                    r['expl'] += bool(q.get('e'))
            if t == 'word':
                w = (s.get('w') or '')
                e = lex.get(w)
                ex_n.append(len(e[2]) if e else len(s.get('x', [])))
                wl = w.lower()
                r['w_in'] += bool(wl) and wl[:max(3, len(wl) - 2)] in low
    read = sum(count_words(lang, x[0]) for l in story for s in l['steps'] if s['t'] == 'read' for x in s['lines'])
    n = len(lessons) or 1
    return dict(unit=d['id'], title=d['title'], n=len(lessons),
                words=c['word'] / n, keys=c['key'] / n, input=r['input'] / n,
                ex=r['ex'] / n, prod=r['prod'] / max(r['ex'], 1),
                expl=r['expl'] / max(r['choice'], 1), choice_noexpl=r['choice'] - r['expl'],
                w_in=r['w_in'] / max(c['word'], 1), write=c['write'],
                lexx=sum(ex_n) / max(len(ex_n), 1), bank=len(d.get('bank', [])),
                read=read, screens=r['screens'] / n)


def main():
    idx = json.loads((ROOT / 'curriculum/index.json').read_text())
    totals = '--totals' in sys.argv
    if not totals:
        print('| 单元 | 标题 | 词/课 | 重点/课 | 输入量/课 | 练习/课 | 产出占比 | 选择题解析 | 新词进情境 | 写作 | 例句 | 单元阅读 | 题库 |')
        print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for lang, L in idx['langs'].items():
        lex = json.loads((ROOT / LEX[lang]).read_text())['e']
        agg = collections.Counter()
        for st in L['stages']:
            for u in st['units']:
                if 'file' not in u:
                    agg['todo_units'] += 1
                    agg['todo_lessons'] += u.get('n', 0)
                    continue
                s = unit_stats(lang, u['file'], lex)
                agg['units'] += 1
                agg['lessons'] += s['n']
                agg['choice_noexpl'] += s['choice_noexpl']
                agg['write'] += s['write']
                if not totals:
                    print(f"| {s['unit']} | {s['title']} | {s['words']:.0f} | {s['keys']:.1f} | {s['input']:.0f} | "
                          f"{s['ex']:.0f} | {s['prod']:.0%} | {s['expl']:.0%} | {s['w_in']:.0%} | {s['write']} | "
                          f"{s['lexx']:.1f} | {s['read']} | {s['bank']} |")
        if totals:
            print(lang, dict(agg))


if __name__ == '__main__':
    main()
