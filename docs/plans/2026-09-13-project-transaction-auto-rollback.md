# 项目事务自动回滚与审计

## 目标

- E393 逐文件提交中断后，立即用项目快照恢复已经提交的文件。
- 将项目事务 `prepared` / `completed` / `rolled_back` / `failed` 状态写入现有 append-only operation log。
- 回滚失败时保留准确的未恢复路径和快照位置，禁止误报成功。

## 非目标

- 不对提交前检测到的外部修改做自动覆盖或仲裁。
- 不接 project-writer 自然语言多文件入口，不开放 EDA 写操作。
- 不删除事务快照，不新增外部依赖。

## 验收标准

- 第二个文件提交失败时，第一个文件恢复原内容；原本不存在的文件恢复为不存在。
- 自动恢复失败返回 `rollback_failed` 与剩余路径；快照继续保留。
- 日志按同一 transactionId 形成 prepared→completed、prepared→rolled_back 或 prepared→failed 序列。
- 既有单文件 write/rollback 日志行为不变；主项目 build 与定向测试通过。

## 执行过程

### 改动

- `project-transaction` 在逐文件提交中断后逆序恢复所有可能被触碰的目标：覆盖文件从快照复制并校验 SHA-256，新建文件删除并校验不存在。
- 自动恢复成功返回 `rolled_back`、恢复路径和原始提交错误；恢复任一路径失败返回 `rollback_failed`、未恢复路径和快照目录。
- prepare 可注入用户/会话审计上下文，严格写入 `prepared` 后才返回可提交事务；commit 的 completed/rolled_back/failed 结果追加到同一 operation log。
- `OperationRecord` 扩展 transaction action、prepared 状态、transactionId、snapshotDir 和 paths；既有 latest write/rollback 继续忽略事务事件。

### 遇到的问题

- 提交 API 抛错不能证明失败目标完全未变化，因此恢复集合不仅包含已成功 rename 的路径，也包含正在尝试的失败路径；对未变化文件恢复快照是幂等的。
- 自动回滚本身也可能失败，本轮保留快照并单独返回 `rollback_failed`，不把“发起过回滚”误报为“已恢复”。

## 结果

- `npm run build`：通过。
- 项目事务、operation-log 与既有 project-writer 定向测试 18/18；其中项目事务 7/7。
- 覆盖：覆盖文件恢复、新建文件删除、回滚失败状态、三类 append-only 状态链及既有单文件回滚兼容。
- 本轮未接 project-writer 自然语言入口、用户冲突仲裁或 EDA 写操作；事务快照继续保留。
- `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
- 未运行全量 E2E/bench，零外部 LLM，未提交。
