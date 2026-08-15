# 进度交接 2026-08-15（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`5a37169`｜Gitee 与 GitHub 均已同步。

## 当前状态

- `npm run build` 通过；`npm run test:all` 全绿：单测 250/250 + 集成 17/17。
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

## 明天继续（按优先级）

1. 扫描件 OCR：`scripts/pdf_text.py` 已返回 `scanned` 标记，接入 PyMuPDF 页图渲染 + PaddleOCR（本机尚未安装）后补全老旧 datasheet 场景。
2. 继续用 `npm run route:feedback` 攒 accept/reject 样本，够 10 条后跑 `npm run route:apply-calibration`。
3. 需要用户配合的浏览器项：关掉 QQ浏览器 → `npm run browser:launch -- qq` → `npm run browser:cdp -- 9222`，验证登录态自动兜底。
4. 继续按 `push:hosts` 流程同步后续改动。
5. 强时效查询可继续增强：把“载人航天小喇叭”/中国载人航天工程办公室官方发布登记为航天状态权威跟踪源，进一步压缩“暂无可靠更新”场景。

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
- 权威变更台账：v2.5 附录 A（当前到 E83）
- 机器轨迹：`data/trajectory.jsonl`、`bench/search-metrics.jsonl`
