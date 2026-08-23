# 推进计划：架构审计中期批·第八批（P17）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

中期批继续（LLM fallback 降级时间治理，衔接 P4 取消机制）：P17 `src/search/llm-registry.ts:170-187`
fallback 链 3 家 × 30s 串行无总预算，最坏 90s——Stage5 降级时间远超 [P-06]=12s 预算；
预算超时后仍会逐个尝试下一家，失败聚合时间线性叠加。

## 计划

1. P17 `src/search/llm-client.ts`：`CompleteOptions` 新增 `signal`，`OpenAiCompatibleClient.complete`
   把外部信号与内部超时合并（预中止立即 abort、事件监听 abort，finally 移除监听）——与 P4
   provider 取消同模式。
2. P17 `src/search/llm-registry.ts`：`FallbackClientOptions.totalBudgetMs` + `FallbackLLMClient`
   第三参；`complete()` 按每次调用独立起算 [P-116] 总预算——共享 AbortController 透传 signal，
   `Promise.race` 对预算超时兜底（即使 provider 不响应 signal 也强制终止），超时后停止后续兜底；
   `createForRole` 默认 `PARAMS.llmFallbackTotalBudgetMs`（12s，对齐 [P-06]）。
3. 参数与文档：`params.ts` 注册 [P-116] `llmFallbackTotalBudgetMs=12_000`；需求文档 §5 登记
   [P-116] + 附录 A E215。
4. 测试：`llm-registry.test.ts` 补总预算超时立即终止/不再尝试第二家、预算内失败仍正常兜底 2 条；
   新建 `llm-client.test.ts` 补预中止 signal 立即拒绝 1 条（不发网络请求，确定性）。
5. 验证：build + 定向单测 + 全量 test:all + doc-lint 0 FAIL 0 WARN。

**验收标准**

- fallback 链最坏耗时 ≤ [P-116] 12s（任一 provider 挂起时由预算强制终止，不再 90s）。
- 预算内行为不变：首 provider 失败仍正常兜底，成功路径不触发预算。
- OpenAiCompatibleClient 合并外部信号后，预算 abort 能取消进行中的 fetch。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- P17 `src/search/llm-client.ts`：`CompleteOptions.signal?: AbortSignal`；complete 开头
  `opts.signal?.aborted` 预中止则立即 abort，监听外部 abort 事件合并内部超时 timer，finally
  移除监听并 clearTimeout。
- P17 `src/search/llm-registry.ts`：`FallbackClientOptions.totalBudgetMs`；`FallbackLLMClient`
  构造第三参 `totalBudgetMs`；complete 内 deadline = now + budget，创建共享 AbortController 与
  budgetReject（预算到点 abort + reject「LLM fallback 链总预算 Nms 超时」），每次 attempt 带
  `signal` 并与 budgetReject race，预算耗尽 break 不再兜底；`createForRole` 缺省传
  `PARAMS.llmFallbackTotalBudgetMs`（单 provider 链不受影响，仍走自身超时）。
- 参数：`params.ts` PARAMS + PARAM_IDS 注册 [P-116] `llmFallbackTotalBudgetMs: 12_000`。
- 测试：`llm-registry.test.ts` 补 2 条（总预算超时终止 + 预算内兜底），新增
  `llm-client.test.ts` 1 条（预中止 signal 立即拒绝）。
- 文档：需求文档 §5 [P-116] + 附录 A E215；本计划；交接更新。

### 遇到的问题

- apply_patch 工具在本环境被 WindowsApps 权限拒绝（Access is denied），改用 Python 精确
  锚点替换落盘，每次替换校验唯一命中。
- 首个 llm-client 网络回归用例（10.255.255.1 + 30ms 内部超时）会残留 undici socket 拖长
  测试进程 ~10.8s，改为只保留确定性的预中止 signal 用例（不发请求），内部超时行为未改动。
- 预算强制终止用 `Promise.race` 而非仅依赖 signal：provider 若不响应 signal（如测试桩）也
  能按时终止；真实 OpenAiCompatibleClient 同时收到 abort，fetch 立即取消不烧配额。

## 结果

- 验证：`npm run build` 通过；定向单测 10/10（llm-registry 9 + llm-client 1，362ms）；
  `npm run test:all` 全量单测 656/657（1 skip）+ 集成 15/15；`doc-lint` 0 FAIL 0 WARN
  （PARAM 106、C8 30 key、附录 944/950）。
- 测试：新增 3 条全绿；既有 llm-registry provider 选择/fallback 回归通过。
- 提交：待提交（与安全/正确性/决策/中期第一~七批同批）。
- 遗留事项：中期批剩余 P1/P2/P10 + B2/B3 + S1-S3。
