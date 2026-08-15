# 进度交接 2026-08-15（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`7b4a408`｜Gitee 与 GitHub 均已同步。

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

## 明天继续（按优先级）

1. 校准阈值保持 0.45/0.75；继续攒真实 accept/reject 样本，样本更多后再校准。
2. 继续按 `push:hosts` 流程同步后续改动。
3. OCR 后续优化：多页扫描件限页数、单页缓存，避免二次取证超时；可与 PaddleOCR 再对比精度。
4. QQ 浏览器当前保持 9222 运行，Agent 已自动复用；后续可继续验证需登录站点的完整抓取链路。

## 常用命令

```bash
npm run build
npm run test:all
npm exec tsx scripts/doc-lint.ts
npm run dev -- "你的问题"
npm run datasheet -- "https://item.szlcsc.com/..." 型号
npm run route:cases
npm run route:feedback
```

## 记录位置

- 每日交接：`docs/2026-08-15-progress-handoff.md`（本文件）
- 推进计划：`docs/plans/YYYY-MM-DD-<主题>.md`
- 权威变更台账：v2.5 附录 A（当前到 E87）
- 机器轨迹：`data/trajectory.jsonl`、`bench/search-metrics.jsonl`
