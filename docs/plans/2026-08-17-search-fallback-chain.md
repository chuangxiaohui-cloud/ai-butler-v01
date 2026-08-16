# 推进计划：搜索空结果兜底链（E125）

> 日期：2026-08-17 · 分支：v0.2b · 状态：已完成

## 目标

修复 SM18/SM31/C08/ET20 等“低置信兜底话术”回升：当子搜索全部零结果时，不再直接
落到“我暂时无法确认”，而是依次尝试原句重试、简化句重试、浏览器搜索页兜底
（Bing/百度），把真实结果带回融合。

## 计划

1. `runSearchLoop` 增加空结果回退链：
   - 子搜索循环后 `results.length === 0` 时，按 `originalQuery → 简化句` 顺序重试。
   - 仍为空且 `browserSession.searchWeb` 可用时，Bing → Baidu 浏览器搜索兜底。
2. `BrowserSessionManager` 新增 `searchWeb(query, { engine, count })`，用现有浏览器
   会话抓 Bing/Baidu 结果容器并解析 title/url/snippet。
3. `BrowserFetcher` 接口加可选 `searchWeb`，保持现有 mock 兼容。
4. 补测试：空结果原句重试、空结果浏览器兜底、`searchWeb` 解析。
5. 更新需求文档附录 A（E125）与交接记录，提交推送。

**验收标准**

- 子搜索全空时，原句或简化句重试能带回结果。
- 重试仍空时，浏览器搜索页兜底能生成 `browser` 来源结果并进入融合。
- 单测与集成全绿。

## 结果

- 空结果回退链：子搜索全空 → 原句重试 → 简化句重试 → Bing/Baidu 浏览器搜索兜底。
- `BrowserSessionManager.searchWeb` 真实验证：能解析 Bing 结果页并返回 browser 来源结果。
- 新闻误判修复：`实时调整` 不再触发 news 规则，`A股实时行情` 仍走 news。
- 通用二次取证：融合全空时按相关度抓 HTML 原文，二次融合放宽 `minScore=0.3`；
  ET20/SM18/SM31/C08 四条全部从“无法确认”变成带证据的真实回答。
- 验证：单测 348/348 + 集成 17/17 全绿；doc-lint 通过；四条基准重跑见
  `bench/devil-v25/report.md`。
- 提交：E125 已提交并推送 Gitee/GitHub。
