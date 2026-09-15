# 推进计划：项目冲突裁决恢复接入 gateway

> 日期：2026-09-13—2026-09-14 · 分支：v0.2b · 状态：已完成

## 目标

把 E397 的项目冲突三选一执行器接入 E399 的进程内待处理事务仓库和 gateway，形成可审计的二次裁决闭环。

## 计划

1. 扩展待处理事务仓库，随冲突 pending 保存完整冲突契约并消费已落盘裁决事件。
2. 接入 gateway 决策端点；完成、取消、再次确认、失效和执行失败均返回结构化事务结果。
3. 增加仓库与 gateway 定向测试，同步需求附录、目录地图、验收快照和交接。

**验收标准**

- `keep_external`、`use_transaction`、`cancel_all` 经仓库执行后语义与 E397 一致。
- 用户确认后文件再次变化时目标零写入，生成新 conflict pending 并继续绑定原内存事务。
- 缺失内存事务时返回 `expired`，不从 decision log 恢复正文。
- 主项目构建、相关定向测试和 `git diff --check` 通过；`doc-lint` 不新增失败。

## 执行过程

### 改动

- `PendingProjectTransactionStore` 随 conflict pending 保存完整冲突契约，并新增只消费已落盘选择事件的恢复入口。
- gateway 决策端点识别 `project_transaction_conflict`：三选一结果进入 E397 执行器；再次变化生成新 pending，失效返回 `expired`。
- 更新 DecisionLog 注释，明确记录层只追加证据，受控动作由调用方在记录成功后显式恢复。
- 同步 §11.2、附录 A、代码目录、目录结构、AGENTS、验收快照与 2026-09-14 交接。

### 遇到的问题

- 恢复结果的 `reconfirmation_required` 必须先验证含新冲突契约，才能映射为仓库层 `conflict_pending`；缺少契约时按 `invalid_decision` 拒绝，避免生成不可执行 pending。
- 原 E396 gateway 用例只有日志、没有进程内事务；接线后将其明确收口为 `expired` 反例，验证不会从日志恢复正文。

## 结果

- 验证：`npm run build` 通过；`git diff --check` 通过（仅既有 LF/CRLF 提示）。
- 测试：仓库与 E397 核心 14/14；gateway E399/E402 4/4，共 18/18。
- 文档：`doc-lint` C1-C6/C8 通过，仍仅有第 19 行既有 provisional 超期，2 FAIL / 0 WARN。
- 提交：未提交。
- 遗留事项：文件正文仍只在原进程内；不自动选边、不自动合并。下一轮转 E403 项目画像持久化与 Keil 只读盘点。
