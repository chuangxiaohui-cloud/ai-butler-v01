# project-writer 待处理事务仓库与首次确认执行

## 目标

- 用进程内仓库把 E398 pending decision id 与 prepared transaction 正文绑定，正文不进入日志。
- `cancel_all` 清理未执行快照并记录 cancelled 终态；`confirm_changes` 重新校验后提交。
- 提交前发现冲突时零写入，转入 E395/E396 三选一裁决并继续绑定同一事务。
- 进程重启或记录缺失时返回诚实失效，不尝试从 decision log 恢复正文。

## 非目标

- 本轮不执行冲突三选一的后续选择，留给 E397 与仓库的下一轮接线。
- 不持久化文件正文，不开放 EDA 写操作。
- 不改变既有单文件 project-writer 和普通 confirm resume。

## 验收标准

- pipeline 创建 pending 后仓库可按 decision refId 找到同一 prepared transaction。
- 取消、成功提交、冲突转接、失效四种结果明确且可测试。
- gateway 裁决响应返回事务结果；UI 不再把成功提交误报为“只记录”。
- 冲突/失效/取消均无非预期目标写入，既有 E393-E398 回归保持通过。

## 执行过程

### 改动

- 新增 `PendingProjectTransactionStore`，以 pending decision id 在进程内绑定 E398 prepared transaction；decision log 只保留 transactionId、路径和摘要，文件正文不落日志。
- pipeline 创建多文件确认记录后立即注册事务；若登记 pending 失败则丢弃事务并清理快照。
- gateway 在首次确认裁决落盘后执行对应事务：取消时清理快照并追加 `cancelled` 审计，确认时复用 E393/E394 提交与回滚边界。
- 提交前若发现外部变化，整批零写入，并生成 E395/E396 三选一冲突 pending；同一 prepared transaction 改绑到新 pending id。
- UI 根据 gateway 返回的 `projectTransaction` 展示已提交、已取消、待冲突裁决或进程事务已失效，不再把真实提交误报成“只记录”。

### 遇到的问题

- gateway 联调用例最初命中测试夹具的假 LLM，提前返回普通问答结果；该用例改用与 E398 一致的无模型确定性路由，避免把模型行为混入事务编排验收。
- 进程重启后 decision log 仍可能保留 pending，但正文按安全约束不能持久化；因此明确返回 `expired`，不从日志猜测或重建写入内容。

## 结果

- 成功提交、取消清理、冲突转接和缺失事务四条路径均有定向测试；完整 `/api/ask → pending → choice → commit` 链已通过。
- 主项目与 UI 构建通过；核心事务/冲突/裁决/project-writer 定向测试 32/32，pipeline E398/E324 5/5，gateway E399 2/2。
- 未运行 E2E、bench 或真实专业工具写入；冲突三选一的 E397 执行器尚未接入 gateway，因 MCP 文档轮插入而顺延至 E401。
- `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
