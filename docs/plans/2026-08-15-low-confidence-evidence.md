# 推进计划：low_confidence 二次取证

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

解决 `GD32F103C8T6 数据手册` 这类“来源正确但融合后置信度不过门控”的问题：当器件/资料查询融合后仍 `low_confidence` 时，Agent 用浏览器会话抓高可信页正文或下载 datasheet 作为二次取证，把证据质量和置信度抬上去。

## 计划

1. 定位 pipeline 融合后 `low_confidence` 门控触发点与 fused 数据结构。
2. 确定二次取证触发条件与抓取目标（高可信 URL、datasheet PDF）。
3. 实现二次取证逻辑并接入 pipeline。
4. 补单测，跑 `npm run test:all`。
5. 真实复测 `GD32F103C8T6 数据手册`，确认置信度/门控改善。
6. 登记 v2.5 附录 A（E80）、更新进度与计划文档，doc-lint，提交推送。

**验收标准**

- `low_confidence` 触发时能识别可取证的 URL 并调用浏览器抓取。
- 真实复测 GD32 置信度提升，门控至少不再是 `low_confidence`（或证据明显增强）。
- 全套测试通过，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- `src/search/second-pass.ts`：新增二次取证目标挑选（高可信 HTML > 权威 HTML > 高可信 PDF > 权威 PDF）。
- `src/search/pipeline.ts`：融合后 `low_confidence` 且含器件型号时，用浏览器抓 HTML 正文或下载解析 PDF 后重新融合。
- `src/search/fusion.ts`：浏览器二次取证的高可信页不再被 SEO 降权。
- `src/main.ts`：问答收尾关闭浏览器会话，避免进程挂起。
- 测试：`second-pass.test.ts` 新增 4 条、`fusion.test.ts` 新增 1 条。

### 遇到的问题

- 立创资料页含“在线客服/购物车”等电商词，被 SEO 过滤器误判降权，浏览器二次取证无法提升分数；改为仅对浏览器主动取证的高可信页豁免。
- 二次取证抓取后浏览器未关闭导致 CLI 进程挂起；main 收尾增加 `browserSession.close()`。
- 搜索结果全是 PDF 时没有 HTML 可抓；`pickSecondPassTarget` 增加高可信 PDF 回退，下载后用 `parseDocumentFile` 提取正文。

## 结果

- 验证：`GD32F103C8T6 数据手册` confidence 0.505 → 0.652，gate `low_confidence` → `none`，证据为二次取证抓取的立创完整页面。
- 测试：单测 236/236 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：待填 · 推送：Gitee / GitHub
- 遗留事项：PDF 解析仍是轻量文本提取，复杂排版/扫描件暂不支持。
