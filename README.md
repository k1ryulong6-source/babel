# babel
BABEL Language learing app

## 监工学习计划

- 首页左上角「今日任务」：三门语言统一排课的当天清单（复习 + 欠债 + 主课课时 / 单元测验 / 回炉）。
- 课纲在 `curriculum/`：`index.json` 是阶段→单元目录，每个单元一个 JSON 文件，格式见 `curriculum/README.md`。待生成的单元标了 `todo`。
- 计划数据存在存档的 `plan/` 下（`plan/settings`、`plan/state`、`plan/d_YYYY-MM`），随「导出存档」一起导出。

## 工具

- `python3 tools/check_curriculum.py`：检查课纲（课时 id、词条与语法课引用、题目格式）。
- `python3 tools/update_manifest.py`：改了数据文件或 index.html 后运行，重算 `files.json` / `sw.js` 的文件哈希和 BUILD 号，App 版才会更新缓存。

## 日语词典：导入日中词典

自带的 JMdict 只有英文释义（词书里的约 3000 词有中文）。要看中文释义，可以导入 Yomitan / Yomichan 格式的日中词典：

1. 下载词典 zip（里面有 `index.json` 和 `term_bank_1.json` 等文件），例如 GitHub 上 MarvNC/yomitan-dictionaries 收录的日中 / 日汉双解词典。
2. 打开「词典」页，点右侧「日中词典 · 导入」，选中 zip（不用解压）。
3. 词典只存在这台设备的 IndexedDB 里（库名 `babel_zhdict`），不上传、不进存档，也不放进仓库；换设备需要重新导入。

查词时会自动处理：活用形还原、片假名 / 半角输入、ヶ / か / カ / 箇 写法、长音「ー」；整个词查不到时显示开头能查到的最长部分。

## 日语音调数据

`ja/accent.txt` 来自 [kanjium](https://github.com/mifunetoshiro/kanjium)（Uros O. 整理，基于 EDRDG 的 EDICT 等数据），许可证 **CC BY-SA 4.0**。格式：`词\t读音（与词相同时留空）\t降调位置`（0 平板型；1 头高型；n 表示第 n 拍后降调，多个用逗号分隔）。本文件按同一许可证（CC BY-SA 4.0）提供。
