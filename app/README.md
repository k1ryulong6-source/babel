# 巴别塔安卓 App（试课版）

按 `docs/REDESIGN.md` 的新课结构做的试课和一个全新的课时播放器。试课是第一学期的 **es.1.2.1 Me llamo…（自我介绍）**，约 40 分钟；另有一节按同样结构做的 es.2.5.1（lo / la / los / las）。
这是“全部重写”的起点：新代码不依赖旧的 `index.html`，课时数据用新格式（`www/lessons/*.json`，按段落 `sections` 组织）。

## 结构

```
app/
  www/                 网页层（Capacitor 直接打包，无需构建步骤）
    index.html
    css/app.css        设计变量 + 动效
    js/main.js         首页、课后小结、课后复习 / 间隔复习、跳过课程、删除题目、安卓返回键
    js/player.js       播放器：翻页动画、往回翻（答过的只读）、课内目录、没懂标记、段落过场、更多菜单
    js/screens.js      各种屏（短文、找规律、讲解+小问题、选择、填空、改写、翻译、听写、连句、配对、写作、口语、自由回答）
    js/judge.js        判分（忽略大小写和标点；只错重音算“对，注意重音”）
    js/audio.js        预录 mp3，缺录音时退回系统语音
    lessons/es.1.2.1.json   试课（第一学期）
    lessons/es.2.5.1.json   第二学期的示例课
    audio/             预录音（Google TTS）+ index.json
  android/             Capacitor 生成的安卓工程
  tools/build_audio.py 给课时预录音（需要 GOOGLE_TTS_API_KEY）
  tools/walk.js        浏览器自动走课测试 + 截图
```

## 常用命令

```bash
cd app
npm install
npm run serve                       # 浏览器里预览 http://localhost:5173
python3 tools/build_audio.py        # 改了课时内容后补录音（增量）
NODE_PATH=$(npm root -g) node tools/walk.js /tmp/walk es.1.2.1   # 自动走课（最后一个参数是课时 id），输出 ALL OK 才算过
npx cap sync android && cd android && ./gradlew assembleDebug   # 出 APK：android/app/build/outputs/apk/debug/app-debug.apk
```

推到 GitHub 后，Actions 里的 “Android APK” 也会构建调试版 APK（在运行结果的 Artifacts 里下载）。

## 课时格式（v5 草案）

课时 = 若干段落（`sections`：开场检索 / 读一读 / 找规律 / 讲透 / 从认到用 / 说出来 / 出口小测），每段若干屏（`screens`）。
每屏都有固定 `id`（进度、作答、删除都按 id 记）。常用字段：

- 选择 `c`：`q` `o` `a`，`why` 是每个选项的解析（“你为什么会选这个”），找规律题加 `lines`（带 `<mark>` 的例句）和 `reveal`（答完揭示的规律）。
- 填空 `f` / 改写 `rw` / 翻译 `tr` / 听写 `dict`：`a` 为可接受答案；`rw`、`tr` 答错时可以自判“意思也对”。
- 讲解 `teach`：`body` `table` `steps`（样例分步）`errs`（常错）`ex`（例句，都有录音），`ask` 是讲完马上问的小问题，`recall` 是复习和下一课开场用的检索题。
- `opt: true`：精练模式跳过；`exit: true`：出口小测，计分并决定复习间隔（1 → 3 → 7 → 15 → 30 天）。
- `bank`：复习时抽的新题。

## 跳过课程、删除题目（按 docs/CONTENT_EXPANSION.md 第 6 节）

- 跳过这节课（首页或播放器“⋯”）：**以后再学**（标为已跳过，可撤销）或 **我已经会了**（做这一课的出口小测，答对 n-1 道算学完，从 7 天间隔开始复习；没过可以学一遍或坚持跳过）。播放器里还能“跳过这一段”。
- 删除这道题（播放器“⋯”）：选原因 题目有错 / 太简单 / 不想做；课时、复习、测一测都不再出现。首页列出已删除的题，可逐道或全部恢复，“题目有错”的可一键复制成 JSON 交给写课的人。
- 记录按题目 id：`deleted[课时id][题目id] = 原因`。课时内 id 固定（w1、r2、p6、b3……），全局 id 是“课时 id + 题目 id”。
