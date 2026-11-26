#!/usr/bin/env python3
"""把选择题解析补丁合并进单元文件（只补空着的 e，不覆盖已有解析）。

补丁放在 expl_inbox/<单元>.json：
  {"unit": "es.1.1", "items": [{"q": "题干", "o": ["选项", ...], "say": "可选，听力原文", "e": "解析"}]}
按 题干 + 选项集合 + say 匹配单元里所有位置的选择题（课内练习、重点 drill、单元测验 extra、题库 bank）。

用法：python3 tools/expl_merge.py expl_inbox/es.1.1.json [...]   加 --dry 只检查不写入
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def key(q):
    return (q.get('q', '').strip(), tuple(sorted(q.get('o', []))), q.get('say') or '')


def choices(d):
    for l in d['lessons']:
        for s in l.get('steps', []):
            if s.get('t') in ('c', 'lq'):
                yield s
            for q in s.get('drill', []) if s.get('t') == 'key' else []:
                if q.get('t') in ('c', 'lq'):
                    yield q
    for q in d.get('test', {}).get('extra', []) + d.get('bank', []):
        if q.get('t') in ('c', 'lq'):
            yield q


def main():
    dry = '--dry' in sys.argv
    idx = json.loads((ROOT / 'curriculum/index.json').read_text())
    files = {u['id']: u['file'] for L in idx['langs'].values() for st in L['stages'] for u in st['units'] if 'file' in u}
    bad = 0
    for p in [a for a in sys.argv[1:] if not a.startswith('--')]:
        patch = json.loads(Path(p).read_text())
        f = ROOT / files[patch['unit']]
        d = json.loads(f.read_text())
        pool = {}
        for q in choices(d):
            pool.setdefault(key(q), []).append(q)
        filled = 0
        for it in patch['items']:
            e = it['e'].strip()
            if '…' in e or '...' in e or not e:
                print(f"  ✗ {patch['unit']} 解析为空或含省略号：{it['q']}"); bad += 1; continue
            hits = pool.get(key(it))
            if not hits:
                print(f"  ✗ {patch['unit']} 找不到题：{it['q']} {it['o']}"); bad += 1; continue
            for q in hits:
                if not q.get('e'):
                    q['e'] = e; filled += 1
        left = sum(1 for q in choices(d) if not q.get('e'))
        print(f"{patch['unit']}: 补了 {filled} 道，还剩 {left} 道选择题没有解析")
        if not dry:
            f.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
