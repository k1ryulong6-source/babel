# 词库扩充：补例句、加新词

> 给负责这项工作的人或 AI（例如 DeepSeek）。从头读完再动手。这项工作只改三个词库文件，不碰课程、应用代码和录音包。

## 1. 现状和目标

| 词库 | 文件 | 词数 | 每词例句 | 目标 |
|---|---|---|---|---|
| 英语（托业） | `data/words.json` | 3934（b1 1598 · b2 1768 · b3 568） | 2 句 | 每词 3 句（补约 3900 句） |
| 西语 | `es/words.json` | 995（a1 515 · a2 480） | 1 句 | 每词 3 句（补约 2000 句） |
| 日语（N1 / N0） | `ja/words.json` | 2925（n1 2036 · n0 889） | 1 句 | 每词 3 句（补约 5900 句） |

单词卡最多显示 3 句例句，所以每词补到 3 句为止。

**优先级**（按顺序做，做完一项可以先合并一次）：

1. **西语补例句**：词最少、最常用，最先做。
2. **日语补例句**。
3. **英语补例句**。
4. **西语 B1 新词**（约 600–800 个，放进词书 `b1`；第三学期 B1 课程要用）。
5. **英语托业 800 新词**（约 800 个，放进 `b3`；第三学期要用）。加完后把 `index.html` 里 `BOOKS.b3.desc` 的“TOEIC 商务 568 词”改成新的数字（这一处改应用代码，交给维护应用的人做也可以）。

## 2. 词条格式（三种语言不同）

三个文件都是 `{"books": {词书: [词, ...]}, "e": {词: 词条}}`，紧凑 JSON（不缩进）。词书里的顺序就是学习顺序。

**英语** `["/音标/", [["词性", "中文释义"], ...], [["例句", "中文"], ...]]`，可选第 4 个字段是话题（如“出差与旅行”）。

```json
"say": ["/seɪ/", [["v.", "说；讲"], ["v.", "（文字、标志等）写着"]], [["What did the customer say about the shoes?", "顾客对这双鞋说了什么？"], ["The sign says the store opens at ten.", "牌子上写着商店十点开门。"]]]
```

**西语** `["性别", [["词性", "中文释义"]], [["例句", "中文"]], "级别", "英文释义", "学习注意"]`。性别：名词写 `m` / `f` / `mf`，其他写 `""`；级别大写（A1 / A2 / B1）。

```json
"casa": ["f", [["名", "房子；家"]], [["Mi casa es pequeña.", "我家很小。"]], "A1", "", ""]
```

**日语** `["读音", [["词性", "中文释义"]], [["例句", "中文"]], "词性", "常用搭配", "学习注意"]`。读音只用假名。

```json
"暗礁": ["あんしょう", [["名", "暗礁；（比喻）意外的障碍、僵局"]], [["用地買収が難航し、再開発計画は暗礁に乗り上げた。", "由于征地困难，再开发计划陷入了僵局。"]], "名", "暗礁に乗り上げる", "比喻义远比字面义常用"]
```

## 3. 例句的质量要求

学习者是中国人：英语目标托业 800，日语已过 N1、目标母语水平，西语 A1→B1。

- **自然、地道**：母语者真会说、会写的句子；英西每句 6–18 个词，日语 15–45 字。
- **一句一个义项**：新例句尽量展示和已有例句**不同的义项、搭配或场景**，不要换几个词重复同一个意思。
- **句子里要出现这个词**（变位、复数等变化形式可以）。
- **难度合适**：西语 A1/A2 词的例句只用简单常用词和现在时、过去时；英语多用职场、出差、客户服务、购物场景；日语用新闻、社论、商务书面语，也可以有自然口语。
- **中文译文**：自然的简体中文，意思准确，不要逐字硬译。
- **禁止**：省略号（“…”“...”，录音工具会跳过这句）、`___`、括号注释、引用书籍歌词新闻原文、真实名人名字、敏感或冒犯内容。
- 新词每词 2–4 个最常用的义项，正好 3 句例句；“学习注意”写真正有用的提醒（不规则变化、易错搭配、读音陷阱、中日同形异义），没有就留空。

## 4. 工作方式：补丁文件 → 校验 → 合并

**不要直接改 words.json。** 把产出写成补丁文件放进 `lexicon_inbox/`（这个目录不进仓库），再用脚本校验、合并。

补丁文件（一个 JSON 对象，一批 20–50 个词）：

```json
{"lang": "es",
 "add_examples": {"casa": [["Esta tarde limpiamos toda la casa.", "今天下午我们把整个房子打扫了一遍。"], ["¿Vienes a mi casa a cenar?", "你来我家吃晚饭吗？"]]},
 "new_words": {"aprovechar": ["", [["动", "利用；趁机"]], [["Aprovecho el fin de semana para descansar.", "我趁周末休息。"], ["Hay que aprovechar el buen tiempo.", "得趁着好天气。"], ["Aprovechó la oferta y compró dos.", "他趁打折买了两个。"]], "B1", "to take advantage of", "aprovechar + 名词，不加 de"]},
 "book": "b1"}
```

- `add_examples`：给已有词加例句，加完每词合计不超过 3 句。
- `new_words`：词库里没有的新词，写完整词条；`book` 指定放进哪本词书。

### 方式 A：用脚本调用 DeepSeek API（推荐，批量）

需要环境变量 `DEEPSEEK_API_KEY`（**不要写进仓库或聊天**），运行的机器要能访问 `api.deepseek.com`。

```bash
# 补例句：按词书顺序挑例句不足 3 句的词；已经在 lexicon_inbox 里的词会跳过，可以反复运行接着做
python3 tools/deepseek_lexicon.py --lang es --task examples --limit 300

# 新词：先准备词表（一行一个词），再写完整词条
python3 tools/deepseek_lexicon.py --lang es --task words --words es_b1.txt --book b1

# 先看看提示词，不调用 API
python3 tools/deepseek_lexicon.py --lang ja --task examples --dry-run
```

可选参数：`--batch 25`（每次请求几个词）、`--model deepseek-chat`。

### 方式 B：在 DeepSeek 对话里手工做

把本文第 2、3 节和要处理的词（含已有例句）发给 DeepSeek，要求它按上面的补丁格式只输出 JSON，保存成 `lexicon_inbox/xxx.json`。

### 校验和合并（两种方式都要做）

```bash
python3 tools/lexicon_merge.py lexicon_inbox/*.json           # 只校验，列出每条错误
python3 tools/lexicon_merge.py --apply lexicon_inbox/*.json   # 合并没有错误的条目
```

脚本会挡掉：格式错、和已有例句重复、超过 3 句、省略号、原文混进中文、日语原文没有假名或混进简体字、句子太长、没有句末标点、西语名词缺性别、日语读音不是假名、新词其实已经存在。有错的条目整条跳过，改好后重新校验就行。

**脚本查不出意思是否地道**。合并前请抽查每批 10–20 句：例句自然吗？中文译得对吗？难度合适吗？

## 5. 合并之后

```bash
python3 tools/check_curriculum.py        # 课程引用的词都还在；有“错误”必须改
# 录音（需要 Google TTS 密钥 GOOGLE_TTS_API_KEY；只合成新句子）
python3 tools/tts_batch.py --sets cur,words,examples,listen --langs en,es --workers 4
python3 tools/tts_batch.py --sets cur,words,examples --langs ja --workers 4
python3 tools/update_manifest.py         # 更新清单和构建号，App 才会更新
git add -A data es ja audio files.json sw.js index.html
git commit -m "…"
```

- 录音那一步可以留给有 Google TTS 密钥的人做（例如下一个 Claude 会话）；没录音的例句在应用里会退回浏览器朗读，不影响使用。
- 在单独的分支上提交，用户说“合并”才合并到 `main`。
- 不要改 `curriculum/`、`audio/` 里已有的包、`index.html`（第 1 节第 5 条除外）；不要删除或改动已有的词和例句，只做增加。
