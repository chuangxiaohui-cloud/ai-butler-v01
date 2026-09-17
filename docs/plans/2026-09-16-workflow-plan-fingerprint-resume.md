# 推进计划：统一工作流计划指纹、持久化恢复与 UI 证据链（E412）

> 日期：2026-09-16 · 分支：v0.2b · 状态：完成

## 目标

为 MCP 领域工作流计划增加稳定指纹与 JSONL 持久化，支持批准后按指纹校验再执行；指纹漂移则拒绝静默恢复。UI 展示计划指纹、节点风险与工具证据链，不冒充硬件/EDA 写入已完成。

## 计划

1. 实现计划 canonical 指纹（SHA-256）与 `WorkflowPlanStore`（pending/active/done/cancelled/failed，append-only JSONL）。
2. 预检挂起时写入计划与指纹；批准恢复时校验指纹一致后才执行；取消/失败更新状态。
3. mcp-agent / pipeline 传递并校验 `workflowPlanFingerprint`。
4. UI 渲染 `mcp-domain-workflow-plan` / `mcp-domain-workflow` 卡片（指纹短码、节点、证据）。
5. 同步需求、目录、附录 A、交接。

## 验收标准

- 同一计划内容指纹稳定；节点/工具/args 变化则指纹变化。
- 挂起计划可按指纹找回；批准时指纹不匹配 → 拒绝执行且零 MCP 调用。
- 取消将记录标为 cancelled，不参与恢复。
- UI 能展示指纹、节点风险与 untrusted 工具证据。
- `npm run build` + 定向单测绿；`doc-lint` 不新增失败。

## 执行过程

### 改动

- 新增 `src/mcp/workflow-plan-fingerprint.ts`：对计划做 canonical JSON 后 SHA-256。
- 新增 `src/mcp/workflow-plan-store.ts`（+test）：`data/mcp-workflow-plans.jsonl` 持久化；`savePending` / `verifyForResume` / `mark*`。
- `mcp-agent`：挂起时落盘指纹；恢复路径校验漂移；完成/取消更新状态。
- `pipeline` / `gateway`：hold/resume/reject 传递并校验 `workflowPlanFingerprint`。
- UI：`App.tsx` 工作流卡片展示指纹短码、节点风险与 untrusted 证据。
- 文档：需求 §4.1.2 + 附录 A E412、`AGENTS.md`、`docs/code-directory.md`、`docs/directory-structure.md`、交接。

### 遇到的问题

- 无新增阻塞；E411 相关 SM05/vscode 测试修正已在前序轮次消化。

## 结果

- 定向：`workflow-plan-store` 3/3；`mcp-agent` 含指纹/漂移用例通过；`npm run build` 绿。
- `doc-lint`：不新增失败（既有 C7 provisional 超期保留）。
- E412 收口：计划指纹持久化与批准恢复校验完成；真实硬件/EDA 写入仍不在本轮。
