# 交接说明：第二学期课程内容（续写）

> 给接手的会话：先完整读完这份说明，再动手。所有工具都在仓库里，不需要上一个会话的任何临时文件。

## 1. 项目和用户要求

- 「巴别塔」：个人用的英 / 日 / 西三语学习 PWA，界面中文。单文件应用 `index.html`，GitHub Pages 从 `main` 发布。
- 用户是中国学习者：英语从基础补到托业 800；日语已过 N1，向 N0 走；西语 A1→A2。
- **教学方针（用户原话的要点）**：像资深老师一样设计课程；内容要深入，**重点要标出来、讲透**，不必拘泥课时数；每日计划以课程为主（约 70%），背单词等复习为辅。
- **这一阶段的工作方式（用户明确要求）**：
  - **全部写完再统一测试、录音、提交推送一次**，中途不要每写一个单元就跑测试、录音、推送（省额度）。
  - 只有用户说“合并”才把分支合并到 `main`。
  - 用中文汇报。
- 规矩：
  - 不要让用户在聊天里贴任何密钥。Google TTS 的密钥在环境变量 `GOOGLE_TTS_API_KEY`，不要写进仓库。
  - 提交信息、PR、代码里不写模型名称。
  - 有版权的书和题目只能作参考，不能放进应用。
  - 提交信息以这两行结尾：
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: <本会话链接>
    ```

## 2. 现在的进度

第一学期：三门语言全部完成（v4 新版课时 + 每单元一篇单元阅读 + 录音）。

第二学期：

| 单元 | 状态 |
|---|---|
| en.2.1–en.2.8（职场词汇 / Part 1 / Part 2 / Part 5 / Part 3·4 / Part 6 / Part 7 / 600 冲刺） | ✅ 已完成（含阅读、录音） |
| es.2.1–es.2.8（过去时 ×4 / 宾格与格代词 / 旅行与住宿 / 健康与身体 / A2 综合） | ✅ 已完成（含阅读、录音） |
| ja.2.1–ja.2.6（報道 / 論説 / 政治 / 経済 / 成句と故事 / N0 慣用句） | ✅ 已完成（含阅读、录音） |

**第二学期全部完成。** 各单元脚本：`tools/authoring/en25.py … en28.py`、`es25.py … es28.py`、`ja25.py`、`ja26.py`；阅读在 `st_en2.py` / `st_es2.py` / `st_ja2.py`。
下一步是第三学期（`curriculum/index.json` 里还有 todo 的单元），写法同上。日语第二学期没用过的文型（书信敬语类：〜の段、〜かたがた、〜所存です、ご〜のほど 等）可留给第三学期。

## 3. 写课的工具（都在 `tools/authoring/`）

```
tools/authoring/
  h.py          写课助手（步骤构造函数、单元写入、词库追加）
  story.py      单元阅读（每单元最后一课）
  en21.py … en24.py / es21.py … es24.py / ja21.py … ja24.py   已写单元的脚本＝最好的范例
  st_en2.py / st_es2.py / st_ja2.py                          第二学期各单元的阅读
  st_en.py / st_es.py / st_ja.py                             第一学期的阅读
  pw/lib.js, pw/t23.js                                       浏览器自动走课测试
```

脚本都可以重复运行（会覆盖生成同一个单元文件）。在 `tools/authoring/` 目录里运行：

```bash
cd tools/authoring
python3 en25.py .                 # 写单元：生成 curriculum/en/2-5.json，并在 curriculum/index.json 里把 todo 换成 file
python3 st_en2.py . en.2.5        # 给这个单元加单元阅读（第 6 课）
cd ../.. && python3 tools/check_curriculum.py   # 校验；有“错误”必须改
```

### h.py 里的关键函数

- `NEWUNIT(uid, [lesson, …], extra=[…])`：写一个新单元。`extra` 是单元测验额外题（8–10 题）。
- `NL(title, intro, words, keys, ex=[…], sk=SK(…), sum=[…])`：一课。播放顺序：情境 → 前一半新词 → 重点 1 → 后一半新词 → 重点 2 → 跟读 → 练习 → 小结。
- `I(title, [(说话人, 原文, 中文), …], note)`：情境导入。
- `K(title, what, why, zh, ex, err, sum, drill)`：**重点**，每课 2 个。播放器把它拆成“是什么 / 为什么”“和中文比 + 例句由易到难”“常犯的错”三屏，再加练到对为止的 drill（2–4 题）。
  - `err` 的格式是 `(错句, 正确句, 一句解释)`，**正确句必须是真正的目标语句子**（会显示播放键），不要写成“（不用于……）”这类说明文字。
- `BKK(文型, [补充说明], why, zh, ex, err, sum, drill)`：日语专用。意思、接续、原例句自动从 `ja/words.json` 的 bunkei 里取。补充说明（第一个列表）可省略，不省略时一共 7 个参数。
- `CS(问题, [正确, 干扰1, 干扰2, …], 解析, say=None)`：选择题。**正确答案写在第一个**，会按题目固定打乱。
- `LQ(问句, [正确, 干扰…], 解析)`：英语 Part 2 听力题。只放录音，播放器会自动播。
- `F(题干含___, [答案…])` 填空、`O(答案, 中文, [片段…])` 连词成句（片段连起来必须等于答案）、`TR(中文, [可接受答案…])` 中译外、`DI(句子)` 听写、`SK(句子, 中文, 发音提示)` 跟读、`WR(题目, 范文, 提示, 关注点)` 写作。
- `SPW(词组, 中文, (例句, 中文), 类型)`：固定搭配 / 常用表达词卡。
- `NW(词, 音标, 词性, 中文, 例句, 例句中文)`：英语词库（`data/words.json`）里没有的新词。
- `ESLEX("a2", [(词, 性别 m/f/'', 词性, 中文, 例句, 例句中文, 备注), …])`：把西语新词写进 `es/words.json` 的 A2 词书，返回词列表，直接放进 `NL` 的 words。
- `STORY(uid, 标题, 读前提示, [(原文, 中文) 或 "" 分段], [Q(…)/TR(…)], [要点…])`：单元阅读。`Q(问题, [正确, 干扰…], 解析)`。

### 选词

- **英语**：托业词书 `data/words.json` 的 `books.b3`。用下面的命令查还没用过的词，按话题挑，每课 12 个：
  ```bash
  python3 -c "
  import json,glob
  d=json.load(open('data/words.json')); used=set()
  for f in glob.glob('curriculum/en/*.json'):
    for l in json.load(open(f))['lessons']:
      for s in l.get('steps',[]):
        if s['t']=='word': used.add(s['w'])
  print(', '.join(w for w in d['books']['b3'] if w not in used))"
  ```
- **西语**：A2 词自己写，用 `ESLEX` 加进词库，每课 12 个。不要和 A1 词书（`books.a1`）重复。
- **日语**：N0 词书 `ja/words.json` 的 `books.n0`，每课 14–15 个。把上面命令里的 `en` 换成 `ja`、`b3` 换成 `n0`，就能查出没用过的词。查没用过的文型（作重点用），按每个文型是否在 `curriculum/ja/*.json` 里出现过来判断：
  ```bash
  python3 -c "
  import json,glob
  B=json.load(open('ja/words.json'))['bunkei']; txt=''.join(open(f).read() for f in glob.glob('curriculum/ja/*.json'))
  for b in B:
    if b[0] not in txt: print(b[0],'|',b[2],'|',b[5])"
  ```

## 4. 质量标准（照已完成单元的水平）

- 每课：情境 4–6 句 → 新词 12–15 → **重点 2 个讲透** → 跟读 → 练习 8–10 题 → 小结 3–4 条（重点用 `<b>重点</b>` 标出）。
- 每个重点：是什么（规则、搭配）、为什么这样用（语感、和近义说法的区别）、和中文比（中国学生为什么会错）、例句由易到难、常犯的错 1–2 条、一句话记住、drill 2–4 题。
- 英语第二学期按托业题型组织，讲**解题方法 + 常考陷阱**（同义替换、近音词、时态和语态、介词和连词……），题目用托业风格的英文。Part 3/4 可以用 `I()` 写对话或独白，再出“预读题干”类的选择题。
- 西语：每单元一个语法主线，配一个生活话题。
- 日语：N0 词汇（新闻、社论、评论文体）+ 每课 2 个书面文型；阅读用社论或专栏，题目按 N1 读解的问法出。
- 单元阅读：英语 120–200 词（托业 Part 7 风格：邮件、通知、报道），西语 110–150 词，日语 300–400 字；4–6 题，最后一题常为 TR。
- 注意：
  - 句子里不要用省略号“…”，录音工具会跳过带省略号的句子。
  - `O()` 的片段拼起来必须和答案一字不差。
  - 选择题干扰项要像样，不要出“viví mañana”这种一看就错的。

## 5. 全部写完后：统一测试、录音、推送

```bash
# 1) 校验
python3 tools/check_curriculum.py

# 2) 浏览器走课测试（每次只测同一种语言的课；输出里不能有 ✗、STUCK、undefined、errors 非空）
cd tools/authoring/pw
export NODE_PATH=$(npm root -g)   # playwright 装在全局
node t23.js en.2.5.1 en.2.5.2 en.2.5.3 en.2.5.4 en.2.5.5 en.2.5.6
node t23.js es.2.5.1 …          # 各单元依次跑
node t23.js ja.2.4.6 ja.2.5.1 … # 日语
cd ../../..
# 正常情况下每课最后会显示 done true；ok 比 n 少 1 是测试故意答错一题（检验“练到对”）

# 3) 录音（Google TTS；增量，只合成新句子）
python3 tools/tts_batch.py --sets cur,words,examples,listen --langs en,es --workers 4
python3 tools/tts_batch.py --sets cur,words,examples --langs ja --workers 4
#   女声这一遍 --sets 必须带全（cur,words,examples,listen），否则工具会拒绝（防止误删已有录音）

# 4) 更新清单并提交推送
python3 tools/update_manifest.py
git add -A curriculum audio es data ja index.html files.json sw.js tools docs
git commit -m "…"   # 结尾加上第 1 节的两行
git push -u origin <本会话的分支>
```

然后用中文向用户汇报写了什么，并问是否“合并”。合并时如果 `main` 上有别人推的新提交，先把 `main` 合进分支（冲突一般只在 `index.html` 第 6 行的构建号和 `sw.js` 开头，取自己这边的，再运行 `python3 tools/update_manifest.py`），再开 PR 合并。

## 6. 其他背景（需要时再看）

- 课纲格式：`curriculum/README.md`（含 v4 重点、整句题、写作、单元阅读的格式）。
- 播放器、排课、FSRS 复习、课程页都在 `index.html`；改应用代码前先读相关函数（`v2Flow`、`v2Render`、`lessonShape`、`VIEWS.course`、`_planEnsureToday`）。
- `main` 上另有 Intermission 新闻导入（`integrations/intermission.js`、`docs/INTERMISSION_IMPORT.md`），由别的会话维护，不要动。
