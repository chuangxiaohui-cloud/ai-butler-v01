# 推进计划：内容型思维导图大纲合成放宽 per-call 预算（E343）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

E342 真机冒烟（5173 + gateway 问「FreeRTOS 的软件架构思维导图？」）发现大纲合成仍超时：路由/检索/兜底均正确（session `b08f02bf-…`：`R_XMIND_CONTENT`、66 条、回复带「生成超时/失败」引导），但三次都精确撞 [P-116] 18s 链总预算强停（`synthesisMs≈18010ms`，`error=LLM fallback 链总预算 18000ms 超时`）。方案 B：照 E283 github-reader 套路，内容型大纲合成单独放开 per-call 预算到 [P-122] 90s——模型仍 medium v4-flash、成本不变、不动全局 [P-116]。

## 计划

1. `src/search/llm.ts` 新增 `createXmindOutlineClient(opts?: { preferredProvider?: string })`：`createClientForRole('medium', { totalBudgetMs: [P-122], timeoutMs: [P-122] })`（timeoutMs 同步放宽，防单 provider 默认 30s 先切链）；未配置 medium 回落 heavy 链（同 90s 预算）。
2. `src/search/pipeline.ts`：`PipelineDeps` 增 `outlineLlm?` 注入槽（测试用 FakeLLM）；xmind_content（非 confirmResume）合成端 `llm` 改走 `deps.outlineLlm ?? createXmindOutlineClient({ preferredProvider })`，outlineOnly 用同一 `contentOutline` 常量；非内容型链路（含 UI 显式选档）不变。
3. 测试：pipeline 两条 E342 用例改注入 `outlineLlm`（保持离线 Fake，不触真实 API）。
4. 文档：计划（本文件）、需求附录 A E343、当日 handoff 登记。

**验收标准**

- 真机（5173 + gateway）问「FreeRTOS 的软件架构思维导图？」时，大纲合成超过 18s 不再被 [P-116] 强停；模型仍 v4-flash（成本不变），在 [P-122] 90s 上限内完成即交付大纲 + ⏸ 卡；仍超过 90s 才走兜底引导。
- 非内容型问答链路与 UI 显式选档不受影响；E342 离线用例保持绿。

## 执行过程

### 改动

- `src/search/llm.ts`：`createXmindOutlineClient`（E343，注释同 E283 口径）。
- `src/search/pipeline.ts`：import 增 helper；`PipelineDeps.outlineLlm`；Stage5 合成前定 `contentOutline`，`llm` 三态选择（内容型→outlineLlm??helper；UI 选档→按所选；其余→deps.llm），outlineOnly 复用同一常量。
- `src/search/pipeline.test.ts`：E342 两条（大纲交付挂卡 / 超时不挂卡）注入 `outlineLlm`。

### 遇到的问题

- 初版把函数插到 createVisionClient 文档注释之后（注释归属错位），已挪回注释块之前；插入采用 .NET UTF-8 无 BOM 写回避免 CRLF 破坏。

## 结果

- 验证：`npm run build` 绿；pipeline 定向 77/77 + llm-registry/llm-client 18/18 全绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：单测见上；集成 routing-enum 未受影响（内容型路由无改动）；全量 test:all/bench 未跑（成本纪律）。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——5173 同句「FreeRTOS 的软件架构思维导图？」应能撑过 18s 完成大纲（回复大纲文字 + ⏸ 卡），批准后产物区出现 .xmind；若观察仍失败再看轨迹 error 是否为 90000ms（即已按新预算走）。