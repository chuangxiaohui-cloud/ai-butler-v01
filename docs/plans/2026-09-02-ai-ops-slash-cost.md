# 推进计划：`/cost` 斜杠命令——老板问答 AI 运营成本入口（E319）

> 日期：2026-09-02 · 分支：v0.2b · 状态：已完成（owner 2026-09-02 拍板 ①）

## 目标

§COST C-7「老板问答入口」落地最小闭环：CLI / gateway 增加斜杠命令 `/cost`，输出与 `npm run cost:today` 同一份 AI 运营成本报告（`formatAiOpsReport`），纯本地、零外部 LLM/API。

## 计划

1. `src/slash/slash-commands.ts`：`SlashCommandName` 增 `cost`；解析正则增 `/cost`；`runCost` 复用 `readUsage` + `formatAiOpsReport`（deps 增可选 `costOptions.usageFile/budgetFile` 供测试注入）；`/cost` 不需要 conversationId → 验证：parse 单测 + handleSlash 单测。
2. 文档：需求文档（§14.4 报告输出 bullet + 附录 A E319）、`docs/code-directory.md`/`docs/directory-structure.md` 斜杠行、计划文档、当日 handoff → 验证：`npm run doc-lint` 0 FAIL 0 WARN。

**验收标准**

- `npm run build` 绿；slash 定向单测新增 2-3 条且全绿；全量单测 + 集成绿。
- CLI 跑 `/cost` 输出含「📊 AI 运营成本 / 今日 / 本月 / 预算」。
- 全程零外部 LLM/API。

## 设计取舍

- 复用 `formatAiOpsReport` 单一报告口径（不另写文案）；`/cost` 无需会话 ID（全局只读），其余斜杠命令行为不变。
- 不触发通知写入、不改 pipeline/UI。

## 执行过程

### 改动

- `src/slash/slash-commands.ts`：`SlashCommandName` 增 `cost`；`SLASH_PATTERN` 增 `/cost`（整行匹配、大小写不敏感）；`SlashContextDeps` 增可选 `costOptions.usageFile/budgetFile`（测试注入隔离）；新增 `runCost()` 复用 `readUsage` + `formatAiOpsReport`，输出与 `npm run cost:today` 同一报告口径；`handleSlashCommand` 在会话 ID 检查前路由 `/cost`（全局只读，无需 conversationId），数据源异常以可读 answer 兜底不抛错。CLI（`src/main.ts`）与 gateway（`src/gateway/app.ts`）既有分发入口无需改动。
- 单测：`src/slash/slash-commands.test.ts` 增 4 条（/cost 整行识别、无 conversationId 可执行、携带 conversationId 可用、数据源异常可读兜底）。
- 文档：需求文档 §14.4 报告输出 bullet、§14.6 代码落点、附录 A E319；`docs/code-directory.md` / `docs/directory-structure.md` 斜杠层行补 `/cost`。

### 遇到的问题

- 无功能性问题。Windows 下 apply_patch 无法经 argv 传多行补丁，改用 .NET 写文件；期间一处字符串替换误用双引号导致反引号被吞（`` `f `` 被当换页符转义），已按原始字节定位重建表格行。
- `bench/search-metrics.jsonl` 出现非本任务的 15 行追加（此前搜索冒烟残留），已按 `git show HEAD:` 字节恢复；git 无法写 index.lock（sandbox 只读 `.git`），status 报 M 属 stat 缓存假象，内容哈希与 HEAD 一致。

## 结果

- `npm run build` 绿；slash 定向单测 13/13（新增 4 条全绿）；全量单测 + 集成 32/32 绿（单测 1 skip 为既有）；`npm run doc-lint` 0 FAIL 0 WARN。
- 验收：CLI 跑 `/cost` 输出含「📊 AI 运营成本 / 今日 / 本月 / 预算」（见 handoff 冒烟记录）。
- 全程零外部 LLM/API。

## 遗留事项

- 通知区右栏 UI 展示 / projects/ 目录监听仍属 §4.1 三栏 UI 阶段；§COST 其余候选（调用后成本 footer、⏸️ 单次暂停确认需 E309 confirm 阻断式 UI）不变。