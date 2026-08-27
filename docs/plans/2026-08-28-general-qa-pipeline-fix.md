# 推进计划：通用问答管道修复（预算按档 + HTTP 正文 + 三维回答力信号）

> 日期：2026-08-28 · 分支：v0.2b · 状态：已完成

## 目标

按审阅结论落地三条「与 query 无关」的结构修复，解决「市值类问题答非所问」暴露出的管道级断点，杜绝逐题打补丁：

- **P-XXX**：LLM fallback 链总预算按档分级（light/medium/heavy），合成失败从静默兜底改为显式 `synthesis_timeout` gate。
- **P-YYY**：正文来源改为 node 原生 HTTP 直抓 + 轻量正文提取，浏览器降为兜底；失败写 notices（替换不可实现的「IQS-Deep mainText」）。
- **P-ZZZ'**：融合引入三维回答力信号（A 证据粒度匹配 / B 答案覆盖度 gate / C 证据多样性），全部用意图分类 + 形态 pattern + 零依赖多样性，禁止领域词表。
- **bench**：新增按意图分组的「答案覆盖度达标率 / 证据多样性达标率」整体指标，不逐 query 加断言。

## 计划

1. 写计划文档（本文件）
2. P-XXX：`params.ts` 新增 light/heavy 档 fallback 预算；`llm-registry.ts` createForRole 按档取预算；`s5_synthesize.ts` 兜底显式化返回失败标记；`pipeline.ts` `gate_triggered` 扩展 `synthesis_timeout`；UI 状态栏提示
3. P-YYY：新增 `src/search/http-fetch.ts`（fetch HTML + 轻量正文提取）；`second-pass-fetch.ts` 优先 HTTP、浏览器兜底；`pipeline.ts` P0 块改为不依赖 browserSession 也能抓正文，失败写 notices
4. P-ZZZ' A：`fusion.ts` 重构 `answerCoverageScore`/`ANSWER_SIGNALS` 为形态 pattern（数字/日期/步骤/引述/代码标识符），保持意图枚举映射
5. P-ZZZ' B：新增 `src/search/answer-readiness.ts`（predicate 四类分类器 + 证据覆盖度检测）；pipeline 合成前注入覆盖度缺口约束
6. P-ZZZ' C：`fusion.ts` top-K 后加零依赖多样性约束（域名 + token Jaccard 判同质）
7. bench：新增 `scripts/bench-answer-readiness.ts` 按意图统计达标率
8. 需求文档 §5/§6/附录 A 同步 + tombstone + doc-lint
9. 全量测试（单测 + 集成 + UI 构建）+ build + 提交

**验收标准**

- 不出现任何领域关键词/域名/实体（市值/eastmoney/AI大模型 等）进代码与文档规则
- `gate_triggered='synthesis_timeout'` 在 heavy 超时时触发且 UI 可见，不再静默「搜索到了 N 条」
- 无浏览器环境下 HTTP 直抓正文可进 `pageContents`（单测覆盖），抓取失败进 notices
- 融合打分含信号 A 形态匹配 + 信号 C 多样性约束，单测覆盖
- bench 按意图输出两类达标率；`doc-lint` 0 FAIL 0 WARN；单测 + 集成全绿

## 执行过程

### 改动

- P-XXX：`src/config/params.ts` 新增 [P-129] `llmFallbackBudgetLightMs=5000` / [P-130] `llmFallbackBudgetHeavyMs=30000`（`PARAM_IDS` 已登记）；`llm-registry.ts` 抽出 `resolveFallbackBudgetMs(role)`（light→5s / heavy→30s / 其他→12s），`createForRole` 按档应用；`s5_synthesize.ts` `SynthesizeResult` 新增 `synthesisFailed?`/`synthesisError?`；`pipeline.ts` `gate_triggered` 扩展 `synthesis_timeout`，合成失败显式置门 + 聊天提示「回答生成超时…可重试或切换更快档位」，轨迹记 `error`。
- P-YYY：新增 `src/search/http-fetch.ts`（node 原生 fetch + `extractHtmlText` 轻量正文提取 + UTF-8→GB18030 编码探测 + SSRF 复用 `isBlockedBrowserUrl`，导出 `parseHtmlBody` 便于离线单测）；`second-pass-fetch.ts` HTML 分支 HTTP 直抓优先、浏览器兜底，`session` 改可选并支持注入 `httpFetch`；`pipeline.ts` P0 块移除 browserSession 前置条件，目标全失败时 `toolNotice`「网页正文抓取失败…」。
- P-ZZZ' A：`fusion.ts` 原 `ANSWER_SIGNALS` 领域词表整块替换为 `detectShapes()`（数值密度 ≥2 处 / 日期含 YYYYMMDD / 步骤 / 引述 / 标识符）+ `INTENT_SHAPE_PREFERENCE`（项目 8 意图 → 形态偏好），`answerCoverageScore` 改为 `hits/2`。
- P-ZZZ' B：新增 `src/search/answer-readiness.ts`（`classifyPredicate`：数值/时序/操作/观点四类，纯跨领域疑问词，观点词优先于「如何」；`checkEvidenceReadiness` 形态检测，`other` 恒 ready）；`s5_synthesize.ts` 注入 `readinessGap` 诚实边界；`pipeline.ts` 合成前检测并把 `readiness` 写进轨迹。
- P-ZZZ' C：`fusion.ts` 新增 `diversityTokens()`/`jaccard()`/`isHomogeneousPair()`（同域名 + Jaccard ≥ [P-131]）/`ensureDiversity()`（top-K 内同质簇替换），`sorted→diverse` 应用到返回。
- bench：新增 `scripts/bench-answer-readiness.ts`（离线：predicate 分类覆盖率 + 真实证据覆盖度达标率 + 证据多样性达标率，按意图分组），npm script `bench:answer-readiness`，产物 `bench/answer-readiness-20260827.json` + 报告 `bench/B-20260827-01-answer-readiness.md`。
- 文档：需求文档 §5 登记 [P-129]/[P-130]/[P-131]（provisional@2026-08-28）、§6.5.6 新增三维回答力信号小节、附录 A 登记 E271；`docs/plans` 本文件补结果；`docs/2026-08-28-progress-handoff.md` 更新。

### 遇到的问题

- `fusion.ts` 新数值形态判定太宽松（任意单个数字都算覆盖），导致「版本查询官方 release 应胜出」回归：通用教程页含零散年份 `2026` 被判高覆盖、不再被相关性门降权。通用修法：数值形态改「密度」判定（≥2 处数值才算数据型证据），数据/规格页天然多数值、泛文只有零星年份——既有 fusion 测试全部恢复通过。
- 观点型 query 如「优缺点如何」被「如何」抢归 procedural：调整 `classifyPredicate` 顺序为观点词优先于「如何/怎么」（带评价/看法/优缺点词时即使含「如何」也按观点处理）。
- PowerShell 写 TS 文件的转义陷阱（反引号/反斜杠被剥）：统一用单引号 here-string 直写 + node 归一化 LF；CSV 为 CRLF，表头末列带 `\r` 需 trim；`mock.module` 在当前 Node 不可用，测试用可注入参数替代。

## 结果

- build + 全量单测 + 集成 32/32 全绿；UI 原型构建通过；doc-lint 0 FAIL 0 WARN（C8 54 key）。
- 新增/更新单测 28 条：http-fetch 7、answer-readiness 10、fusion 多样性 1、llm-registry 预算分档 2、s5 readinessGap/失败标记 2、pipeline synthesis_timeout/P0 无浏览器 2、second-pass-fetch HTTP 直抓优先 4。
- bench:B-20260827-01 基线：predicate 分类覆盖率 60.7%、真实证据覆盖度达标率 55.1%（n=89）、证据多样性达标率 93.7%（n=79）；按意图分组统计，不逐 query 加断言。
- 领域词约束：新增代码/文档规则未引入任何领域关键词/域名/实体（既有 [P-2]/NUMERIC_TIMELY_RE 与 §6.5.3 金融权威域为 E270 既有项，未动）。
