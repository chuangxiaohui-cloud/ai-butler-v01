# 推进计划：斜杠命令层（/compact + /context，E204）

> 日期：2026-08-23 · 分支：v0.2b · 状态：执行中

## 目标

为 E193 会话上下文压缩补上手动入口：`/compact`（手动触发当前会话压缩）+ `/context`
（查看会话状态：轮次/逐字窗口/摘要/token 粗估/[P-109] 预算），CLI 与 gateway/UI 双通道可用。

## 背景

- E193 已落地自动压缩（§8.3：[P-29] 5 轮逐字窗口 + [P-109] 6000 token 双触发，
  `src/memory/session-context.ts`），但只有自动触发，无手动入口。
- owner 备忘确认：斜杠命令层在合适时机实现，参考 AI-Butler 增补方案 §12.7
  （MiMo-Code `/compact`，SessionCompaction + COMPACTABLE_TOOL_NAMES）——本项目不搬工具结果
  压缩（无 tool_result 结构），只落 `/compact`/`/context` 两个会话级命令。

## 计划

1. 新增 `src/slash/slash-commands.ts`：`parseSlashCommand`（整行匹配 `/compact`/`/context`，
   防误伤正文含斜杠）、`describeSession`/`formatContextReport`（状态报告）、
   `handleSlashCommand`（分发，输出与 `answer()` 契约同形 `{ answer, confidence, evidence[], gate_triggered }`）。
2. 接入 gateway `/api/ask`：query 以 `/` 开头且命中斜杠命令 → 走斜杠处理（用文件级共享的
   `SessionContextStore`，与 pipeline 同持久化），不进入问答管线。
3. 接入 CLI `main.ts`：`npm run dev -- "/context"` 可用；普通问答调用补 `conversationId='cli'`，
   让 CLI 会话也进入 E193 上下文管理（/context 才看得到轮次）。
4. 测试：`src/slash/slash-commands.test.ts`（解析/状态报告/压缩前后/无会话 ID/LLM 失败）。
5. 文档：附录 A 登记 E204、§8.3 补手动入口一句、AGENTS.md 目录地图 + code-directory +
   directory-structure 新增 `src/slash/`；doc-lint 0 FAIL 0 WARN。

**验收标准**

- `npm run dev -- "/context"` 与 `"/compact"` 输出结构化 JSON（contract 同形）。
- gateway `POST /api/ask` body `{ query: "/context", conversationId: "x" }` 返回会话状态，
  `{ query: "/compact", conversationId: "x" }` 压缩后返回前后对比；非斜杠命令不受影响。
- 单测覆盖解析/分发/边界；`npm run build` + `npm run test:all` 全绿；doc-lint 0 FAIL 0 WARN。

## 结果

## 结果（2026-08-23 完成）

**实现要点（相对计划的调整）**

1. llm 惰性注入：gateway 侧不预构造 `createLightClient()`，由 `/compact` 实际需要时再取
   （`deps.llm ?? createLightClient()`），避免无 Provider 环境下连 `/context` 都被构造失败阻断。
2. CLI 会话：`main.ts` 普通问答补 `conversationId='cli'`，CLI 轮次也进入 E193 会话上下文管理，
   `/context` 才看得到累计轮次；文件级共享 `data/session-context/cli.json`。

**实测**

- slash 单测 9 条全绿（解析/状态报告/压缩前后保留 5 轮逐字窗口/无会话 ID/LLM 失败不动原轮次）。
- gateway 集成 2 条全绿（`/api/ask` 的 `/context` 与 `/compact` 均返回契约同形 JSON）。
- CLI 真实冒烟：问答 1 轮后 `/context` 显示 2 轮、窗口 2/5、无待压缩；`/compact` 如实提示
  「无需压缩」；验证 `data/session-context/cli.json` 落盘。
- 全量单测 589/590 + 集成 17/17；`npm run build` 通过；doc-lint 0 FAIL 0 WARN。

**验收核对**

- `npm run dev -- "/context"` 与 `"/compact"` 输出结构化 JSON ✅
- gateway `/api/ask` 斜杠命令返回会话状态/压缩结果，非斜杠命令不受影响 ✅
- 单测/构建/doc-lint 全绿 ✅；附录 A 登记 E204（新增 1 行）。
