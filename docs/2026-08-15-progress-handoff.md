# 进度交接 2026-08-15（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`d90025e`｜Gitee 与 GitHub 待同步。

## 当前状态

- `npm run build` 通过；`npm run test:all` 全绿：单测 255/255 + 集成 17/17。
- `npm exec tsx scripts/doc-lint.ts`：0 FAIL / 0 WARN。
- 浏览器会话体系已打通：独立持久化 profile、CDP 直连日常浏览器、端口持久化自动复用、搜索自动兜底、二次取证。

## 今日已收口

1. **CDP 端口持久化自动复用（E77）**：`browser:cdp` 保存端口到 `data/browser-session-cdp.json`，Agent 每次启动自动连接；新增 `browser:cdp-off`；浏览器未运行自动回退独立浏览器。
2. **推进计划文档流程（E78）**：新增 `docs/plans/README.md` 与 `_template.md`，约定“计划 → 执行 → 结果”三段式。
3. **datasheet 下载与证据补强（E79）**：`npm run datasheet -- "URL" [型号]`，从立创商品页自动提取 TI 官方 datasheet 下载到 `data/datasheets/`；搜索循环证据不足时浏览器补证。
4. **low_confidence 二次取证（E80）**：融合后低置信且含器件型号时，抓高可信 HTML 正文或下载解析 PDF 重新融合；浏览器取证的高可信页不再被 SEO 降权误伤。
5. **真实指标**：`GD32F103C8T6 数据手册` confidence 0.505 → 0.652，gate `low_confidence` → `none`；`TPS5430` 立创商品页下载 datasheet PDF 2.48MB。
6. **强时效查询旧闻防护（E81）**：`中国空间站现在有哪几个航天员在太空` 不再引用 2025-04-26 旧闻，复测回答“截至今天暂无可靠更新”，证据为 2026-06-17 腾讯新闻，gate `low_confidence`；新增时效敏感判定 + news 权重 + 合成时效红线，详见 `docs/plans/2026-08-15-freshness-guard.md`。
7. **Datasheet PDF 全文解析（E82）**：新增 `scripts/pdf_text.py`（PyMuPDF rawdict 重建文本，解决 CID 字体乱码），`document-parser` PDF 分支优先走 PyMuPDF、失败回退 FlateDecode + Tj/TJ；新增 `npm run pdf:text`；TPS5430 真实 PDF 提取 48,622 字符并命中型号/频率关键词，详见 `docs/plans/2026-08-15-pdf-text-layer.md`。
8. **datasheet 下载内容校验（E83）**：新增型号前缀校验，`npm run datasheet` 下载后解析文本确认内容匹配，不匹配就删除误存文件并换下一个候选；`515651.html + STM32F103C8T6`（TPS5430DDA 页）已拒绝误存，`9243.html` 正确下载 ST 官方 datasheet，详见 `docs/plans/2026-08-15-datasheet-verify.md`。
9. **扫描件 OCR（E84）**：`scripts/pdf_text.py` 对无文本层扫描页渲染 2x 图并调用 RapidOCR（ONNX）识别；TPS5430 扫描版命中 `TPS5430`/`5.5V`/`500kHz`；OCR 引擎缺失时给出安装指引，详见 `docs/plans/2026-08-15-pdf-ocr.md`。
10. **路由校准样本达标（10/10）**：给 5 条 accept + 2 条 reject，`route:apply-calibration` 生成提案 `routeConfidenceLow 0.65` / `routeConfidenceHigh 0.75`，待人工确认后写回 PARAM，详见 `docs/plans/2026-08-15-route-calibration.md`。
11. **航天状态权威源（E85）**：`cmse.gov.cn` / `cnsa.gov.cn` 等登记为航天官方源，航天员/空间站/在轨查询自动补 `site:` 子查询；复测证据变为 `www.cmse.gov.cn` [hard]，回答仍诚实“截至今天暂无可靠更新”，详见 `docs/plans/2026-08-15-space-official-source.md`。
12. **校准按决策类型细分（E86）**：reject 分“该澄清却直答”与“该直答却澄清”，后者不再抬高 `routeConfidenceLow`；重跑校准提案修正为 0.45/0.75，不再误伤 0.6 搜索，详见 `docs/plans/2026-08-15-calibration-refine.md`。
13. **QQ浏览器 CDP 登录态验证（E87）**：`browser:launch` 自动选最新 QQ 版本、PowerShell 进程检测、`detached+unref` 启动；9222 监听成功，新进程自动复用 QQ 会话，sessionDomains 含 szlcsc/xcc/taobao/jd/github 等大量登录域，详见 `docs/plans/2026-08-15-qq-browser-cdp.md`。
14. **扫描件 OCR 页数上限（E88）**：`PDF_OCR_MAX_PAGES` 默认 8，超限扫描页跳过并暴露 `ocrSkippedPages`；3 页扫描 PDF + 上限 2 验证只 OCR 前 2 页，详见 `docs/plans/2026-08-15-ocr-page-limit.md`。
15. **校准样本扩到 22**：新增 8 条 accept + 4 条 reject，校准样本 22/10（accept 15 / reject 7），提案仍稳定在 0.45/0.75，详见 `docs/plans/2026-08-15-calibration-more-samples.md`。
16. **扫描件 OCR 单页缓存（E89）**：按页图 SHA-256 落盘 `data/ocr-cache/`，同一扫描页第二次直接读缓存；TPS5430 单页扫描第一次约 18s、第二次约 2s，详见 `docs/plans/2026-08-15-ocr-page-cache.md`。
17. **OCR 缓存清理策略（E90）**：`PDF_OCR_CACHE_MAX_FILES` 默认 200，写缓存后按 mtime 淘汰最旧；上限 2 验证只保留 2 个文件，详见 `docs/plans/2026-08-15-ocr-cache-cleanup.md`。
18. **需登录站点链路验证**：新进程自动连 QQ 9222 抓立创会员中心，正确跳转嘉立创统一登录页；当前该站未登录，会话复用机制生效，详见 `docs/plans/2026-08-15-logged-in-site-verify.md`。
19. **三站登录态重测（E91）**：`browser:fetch` 支持等待参数（`npm run browser:fetch -- "URL" 5000`），`browser:launch` 修复 `Get-Process -Name 'QQBrowser.exe'` 漏检导致调试端口未拉起的问题；立创会员中心显示已登录账户信息、半导小芯显示“退出登录/我的样品”、芯查查本地存储含 `PCuserInfo/PCtoken/SaasFrontToken` 用户凭据，详见 `docs/plans/2026-08-15-logged-in-sites-retest.md`。
20. **登录态完整链路 E2E（E92）**：真实 `npm run dev` 查询自动复用 QQ 9222 会话，立创 datasheet 下载 2.08MB 且型号校验通过；同时把 `semiee.com` 纳入国内资料站、查询改写补“立创商城/芯查查/半导小芯 数据手册”自然词子查询，详见 `docs/plans/2026-08-15-logged-in-chain-e2e.md`。
21. **push:hosts 整链演练（E93）**：dry-run 确认双 token；真实执行预检/add/commit/双端 push 成功，`data/hosting-events.jsonl` 双端 `ok: true`；顺带修复 `--message "..."` 空格写法不生效的问题，详见 `docs/plans/2026-08-15-push-hosts-rehearsal.md`。
22. **半导小芯站内搜索兜底（E94）**：真实搜索引擎不索引 `semiee.com`，已补“点名半导小芯 → 浏览器直达 `searchModel` 站内搜索 → 融合保留该站证据”的完整链路；复测 evidence 含 `www.semiee.com`，详见 `docs/plans/2026-08-15-semiee-index-verify.md`。
23. **立创/芯查查站内直达（E95）**：三站统一为 `DOMESTIC_DATASHEET_SITES` 站点→站内搜索映射（立创 `so.szlcsc.com/global.html?k=`、芯查查 `chip/material/search?title=`、半导小芯 `searchModel`）；真实查询 evidence 已含 `szlcsc.com` 与 `xcc.com`，详见 `docs/plans/2026-08-15-domestic-site-direct-search.md`。
24. **source-stats SQLite WAL 并发修复（E96）**：`SearchSourceStats` 启用 WAL + busy_timeout，两条 `npm run dev` 并发冒烟不再报 `database is locked`；新增多实例写同一库单测，详见 `docs/plans/2026-08-15-sqlite-wal.md`。
25. **PaddleOCR 精度对比（E97）**：`pdf_text.py` 支持 `PDF_OCR_ENGINE=rapid|paddle`，Paddle 自动关闭默认 MKLDNN；TPS5430 扫描样本冷启动 RapidOCR 17.16s/1299 字符、PaddleOCR 117.74s/1224 字符，关键词均命中；默认 RapidOCR，Paddle 为高质量慢速备选，详见 `docs/plans/2026-08-15-paddle-ocr-compare.md`。
26. **路由校准样本扩到 26**：把 ST 数据手册、立创、芯查查、半导小芯 4 条真实查询补为 accept，反馈样本 26/10（accept 19 / reject 7）；`route:apply-calibration` 提案仍稳定在 0.45/0.75，详见 `docs/plans/2026-08-15-calibration-samples-26.md`。
27. **需登录业务链路验证**：QQ CDP 会话直接读取立创“我的订单”（暂无订单）与“我的BOM”（暂无数据），半导小芯登录区含“我的BOM/我的样品/退出登录”，均未跳转登录中心，详见 `docs/plans/2026-08-15-logged-in-business-verify.md`。
28. **v1.0 三栏 UI 原型（E98）**：新增独立 Vite + React 工程 `ui/prototype`，实现三栏 × Ask/Craft/Plan、工程开发三列布局、内置终端/浏览器、证据链与轻量反馈；按参考截图重排为深色 AI 工作台风格；提问框左下新增 `+` 上传菜单（图片/文件/工程文件夹）与 Ask/Craft/Plan，聊天输入框支持直接粘贴图片，提问框右下角提供 DeepSeek/MiniMax 模型切换器；开发服务器 `http://127.0.0.1:5173/`，详见 `docs/plans/2026-08-15-three-column-ui-prototype.md`。

## 明天继续（按优先级）

1. 校准阈值保持 0.45/0.75（样本 26/10，accept 19 / reject 7）；继续攒真实 accept/reject 样本，样本更多后再校准。
2. `push:hosts` 整链演练已完成，参数解析已修复；后续改动可直接用脚本统一提交推送。
3. OCR 后续优化：PaddleOCR 精度对比（缓存清理已完成）。
4. v1.0 三栏 UI 原型已可运行；下一步把对话区接到真实 Agent 管道，或继续攒校准样本。

## 常用命令

```bash
npm run build
npm run test:all
npm exec tsx scripts/doc-lint.ts
npm run dev -- "你的问题"
npm run datasheet -- "https://item.szlcsc.com/..." 型号
npm run route:cases
npm run route:feedback
npm run browser:launch -- qq
npm run browser:cdp -- 9222
npm run browser:fetch -- "需要登录的URL" 5000
npm run browser:status
```

## 记录位置

- 每日交接：`docs/2026-08-15-progress-handoff.md`（本文件）
- 推进计划：`docs/plans/YYYY-MM-DD-<主题>.md`
- 权威变更台账：v2.5 附录 A（当前到 E98）
- 机器轨迹：`data/trajectory.jsonl`、`bench/search-metrics.jsonl`
