# 推进计划：datasheet 下载能力与真实复测

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

让“一人公司AI-Agent”不仅能在搜索里命中立创/芯查查/原厂资料，还能把商品页里的 datasheet PDF 用浏览器会话下载到本地，形成“搜索 → 验证 → 下载资料”闭环；同时真实复测 STM32/GD32 查询确认国内资料站来源。

## 计划

1. 真实复测 `STM32F103C8T6 最大主频是多少` 与 `GD32F103C8T6 数据手册`，确认证据来源仍为官方域/立创等。
2. 扩展 `BrowserSessionManager.fetchPage`：返回页面内 PDF 链接（绝对 URL + 锚文本）。
3. 新增 `BrowserSessionManager.downloadFile`：用当前浏览器会话（含 CDP 登录态）下载 PDF 到 `data/datasheets/`。
4. 新增 CLI `npm run datasheet -- "URL" [型号]`：抓页面 → 挑 PDF → 下载，输出文件路径。
5. 补单测（PDF 链接提取、下载落盘），跑 `npm run test:all` 与 `npm run build`。
6. 真实冒烟：抓一个资料页并下载 PDF。
7. 登记 v2.5 附录 A（E79）、更新 `progress-handoff.md`、`npm exec tsx scripts/doc-lint.ts`，提交推送 Gitee/GitHub。

**验收标准**

- `fetchPage` 返回的 `pdfLinks` 能提取页面内 PDF 链接。
- `datasheet` CLI 能把 PDF 保存到 `data/datasheets/` 且文件可读。
- 全套测试通过，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- `src/browser/session.ts`：`fetchPage` 支持可选等待与 PDF 链接提取；新增 `downloadFile`（带会话下载）。
- `scripts/datasheet.ts` + `package.json`：新增 `npm run datasheet -- "URL" [型号]`。
- `src/search/search-loop.ts`：浏览器兜底扩展为“无高可信源或证据不足”都触发，抓高可信候选补证。
- 测试：`session.test.ts` 新增 PDF 下载、`search-loop.test.ts` 新增证据不足补证。

### 遇到的问题

- 立创商品页的 datasheet 链接是异步加载的，立即抓取只有 ISO/IEC 文档；等待 5 秒后可提取 TI 官方 PDF。
- GD32 数据手册复测命中立创资料页但只有单条 soft 证据，触发 `low_confidence`；浏览器补证后置信度 0.414 → 0.505，仍未过门控，列为下一步专项。

## 结果

- 验证：`npm run datasheet -- "https://item.szlcsc.com/515651.html" TPS5430` 从立创商品页自动挑中 TI 官方 datasheet 并下载 `data/datasheets/TPS5430.pdf`（2.48MB）；GD32 查询证据含立创商城与兆易创新选型指南。
- 测试：单测 231/231 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：待填 · 推送：Gitee / GitHub
- 遗留事项：融合后 `low_confidence` 二次取证（用浏览器抓高可信页/下载 PDF 提升证据）未做。
