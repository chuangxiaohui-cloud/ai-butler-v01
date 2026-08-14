# 进度交接 2026-08-15（v0.2b 续作）

> 当前分支：`v0.2b`｜最新提交：`775ea30`｜Gitee 与 GitHub 均已同步。

## 当前状态

- `npm run build` 通过；`npm run test:all` 全绿：单测 236/236 + 集成 17/17。
- `npm exec tsx scripts/doc-lint.ts`：0 FAIL / 0 WARN。
- 浏览器会话体系已打通：独立持久化 profile、CDP 直连日常浏览器、端口持久化自动复用、搜索自动兜底、二次取证。

## 今日已收口

1. **CDP 端口持久化自动复用（E77）**：`browser:cdp` 保存端口到 `data/browser-session-cdp.json`，Agent 每次启动自动连接；新增 `browser:cdp-off`；浏览器未运行自动回退独立浏览器。
2. **推进计划文档流程（E78）**：新增 `docs/plans/README.md` 与 `_template.md`，约定“计划 → 执行 → 结果”三段式。
3. **datasheet 下载与证据补强（E79）**：`npm run datasheet -- "URL" [型号]`，从立创商品页自动提取 TI 官方 datasheet 下载到 `data/datasheets/`；搜索循环证据不足时浏览器补证。
4. **low_confidence 二次取证（E80）**：融合后低置信且含器件型号时，抓高可信 HTML 正文或下载解析 PDF 重新融合；浏览器取证的高可信页不再被 SEO 降权误伤。
5. **真实指标**：`GD32F103C8T6 数据手册` confidence 0.505 → 0.652，gate `low_confidence` → `none`；`TPS5430` 立创商品页下载 datasheet PDF 2.48MB。

## 明天继续（按优先级）

1. 增强 PDF 解析（复杂排版/扫描件 OCR），支持 datasheet 全文二次取证；当前 `document-parser.ts` 只有轻量 Tj/TJ 文本提取。
2. 继续用 `npm run route:feedback` 攒 accept/reject 样本，够 10 条后跑 `npm run route:apply-calibration`。
3. 需要用户配合的浏览器项：关掉 QQ浏览器 → `npm run browser:launch -- qq` → `npm run browser:cdp -- 9222`，验证登录态自动兜底。
4. 继续按 `push:hosts` 流程同步后续改动。

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
- 权威变更台账：v2.5 附录 A（当前到 E80）
- 机器轨迹：`data/trajectory.jsonl`、`bench/search-metrics.jsonl`
