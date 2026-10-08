# babel
BABEL Language learing app

## 监工学习计划

- 首页左上角「今日任务」：三门语言统一排课的当天清单（复习 + 欠债 + 主课课时 / 单元测验 / 回炉）。
- 课纲在 `curriculum/`：`index.json` 是阶段→单元目录，每个单元一个 JSON 文件，格式见 `curriculum/README.md`。待生成的单元标了 `todo`。
- 计划数据存在存档的 `plan/` 下（`plan/settings`、`plan/state`、`plan/d_YYYY-MM`），随「导出存档」一起导出。

## 工具

- `python3 tools/check_curriculum.py`：检查课纲（课时 id、词条与语法课引用、题目格式）。
- `python3 tools/update_manifest.py`：改了数据文件或 index.html 后运行，重算 `files.json` / `sw.js` 的文件哈希和 BUILD 号，App 版才会更新缓存。
