# 幕间休息 → 巴别塔 · 原文阅读接口 v1

源仓库：https://github.com/k1ryulong6-source/ART-NEWS
接收仓库：https://github.com/k1ryulong6-source/babel

目标是使用巴别塔已有词典、生词本和复习系统阅读新闻原文。用户已授权两个项目联动；无需新的API key或翻译费用。不共享个人收藏/学习记录到新闻站，也不覆盖原有课程或存档。

## 协议与路由

`https://k1ryulong6-source.github.io/babel/?intermission=live-ID#reading`

ID严格为live-加24位十六进制。接收端优先从固定公开地址`https://mujianrest.work/integrations/babel/ID.json`取正文，失败时尝试固定旧地址`https://k1ryulong6-source.github.io/ART-NEWS/integrations/babel/ID.json`，不接受任意远端URL参数，不抓来源网页，不执行来源HTML。源端每次Pages构建按最新全部正文自动生成独立JSON：protocol=intermission-article-v1，schema_version=1，原文title/language/text/blocks/source_hash，出处source，news_url，access，collected_at，translation_zh。

access=public-partial为仅取得来源公开部分；不能补造付费全文。reference kind分别machine/ai-direct/ai-reviewed，与原文分开。blocks支持paragraph/heading/quote/list_item/image，图片有url/caption/alt/credit。文案按纯文本处理，URL仅http/https，无iframe或来源脚本。

## 保存、重复与更新

文章ID为intermission_源ID_原文hash前16位。导入先严格持久化content/ID，再放到内存、打开阅读；存储空间或云端失败不假称成功。相同ID/source_hash复用已有文章，不覆盖marks/notes/学习进度。不同原文hash存为新版本，旧学习副本保留。content仍使用现有存档出口，不建第二套学习数据库。

成功后URL保留源ID和article=本机副本ID；刷新优先从Store读旧副本，可在新闻端不可达时继续阅读。别人打开此链接且无本机副本则读取当前公开源稿。源JSON2MB上限，文本100万字符/5000块上限；超限明确失败，不截断成摘要。当前最长新闻超过3万字符，避开原手动导入3万限制。

导入先读原文语种，再载入对应词库/语言存档。英语/日语/西语切到对应学习模式。法语/葡语/中文保留当前学习模式，但阅读块带真实data-lang；全局点击优先语种分派，不能错误调用英语或日语词典。无本地词典/复习明确提示；已配置AI可由用户主动查词，不自动标搭配或发起AI调用。通用语种文章在我的文章中可重开。

首次导入不先启动异步西语阅读列表，避免列表稍后覆盖文章。缺正文/404/无效协议/存储失败有可重试错误，个人记录保持。

## 前端改动边界

index.html保留原阅读、点词、选句、词典、Saver、复习逻辑。integrations/intermission.js暴露BabelIntermission.version=1及纯协议/加载/渲染/去重方法；接入boot与原renderArticle。data-ui=intermission-source/intermission-reference为可改排版入口；#apassage、.wd[data-w]和data-lang继续用于查词。

tools/update_manifest.py已纳入integrations，修改后重算files.json/sw.js/BUILD，避免已装PWA缓存旧导入器。各AI更新最新main，勿覆盖字库/词典/音频/课程/用户存档。正文协议扩展保持v1向后兼容；新不兼容版另发版本。

检查：node --test tests/intermission.test.js；提取index.html的内联脚本运行node --check；python tools/check_curriculum.py；真实浏览器英/日/西点击词典/保存生词、6语种导入、重复/刷新、长稿、404和存储失败、手机/桌面无溢出。

## T049 · 幕间休息域名迁移

2026-10-15 JST用户已购买mujianrest.work。巴别塔仍在原GitHub地址，IndexedDB/个人词典/生词/复习不迁移；导入器优先https://mujianrest.work/integrations/babel/，DNS/HTTPS/HTTP/JSON失败时尝试原https://k1ryulong6-source.github.io/ART-NEWS/integrations/babel/。仅允许这两个固定端点，不接受参数替换。新域上线前通过旧接口保持可读，生产者JSON的news_url在正式切换后更新。相同原文hash继续复用已有文章，不覆盖笔记或新增重复；保存的旧news_url由GitHub Pages重定向。修改脚本后需更新PWA manifest。

8项接收端JS与原课纲检查通过；1440/390本地新接口/模拟DNS失败旧接口回退、完整原文/配图、重复笔记保持通过，无脚本错误或溢出；公开发布结果待补记。

公开迁移已完成：主站https://mujianrest.work/ 强制HTTPS，PR#12/10c6782、CI38610234915及Pages38610235002 success。巴别塔7976620已发布（Pages38609603860 success）且自身地址保持。真实生产1440/390英日完整原文/原词典/笔记marks刷新/旧文章hash跳转通过，无接口模拟、脚本错误或溢出。主站689篇原文API保持自动构建。
