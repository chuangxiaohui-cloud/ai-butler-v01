# project-writer 多文件事务预览与确认卡

## 目标

- project-writer 接受结构化多文件变更清单，并在确认前完成整批路径预检和项目事务 prepare。
- 对话返回不含正文的变更确认卡，展示创建/修改、路径、字节数及摘要。
- 将确认卡登记为结构化 choice 裁决；确认或取消本轮都只记录，不执行目标文件写入。

## 非目标

- 本轮不保存可跨请求恢复的内存事务，不在批准后自动 commit。
- 不处理冲突裁决恢复，不开放 EDA 工程写操作。
- 不改变既有单文件 project-writer 行为。

## 验收标准

- `params.fileChanges` 与 fenced JSON `{files:[...]}` 两种结构化输入可解析，非法清单整批拒绝。
- prepare 生成项目快照和稳定 transactionId，确认前所有目标文件零写入。
- artifact 与 decision log 不含文件正文；UI 能展示多文件确认卡。
- 既有单文件写入、E393-E397 项目事务与普通裁决链保持通过。

## 执行过程

### 改动

- project-writer 新增结构化解析与事务预览接口，接受 `params.fileChanges` 或 fenced JSON `{files:[...]}`，至少两项。
- 预览复用 E393 prepare，整批路径预检后生成项目快照；artifact 只含 transactionId、创建/修改、路径、字节数和摘要。
- pipeline 对结构化多文件写入强制进入确认分支，即使路由给出 direct 也不得绕过；同一会话已有待确认批次时拒绝重复创建。
- decision log 登记 `confirm_changes` / `cancel_all` 两个 choice，默认取消且不带自动执行 resume；UI 新增多文件确认卡。

### 遇到的问题

- 首轮定向测试发现规则路由把“写入工程”判为 direct，绕过了仅处理 confirm 的旧门；修正为结构化多文件输入无条件进入专用确认门，保留单文件既有行为。
- E398 尚无进程内事务仓库；若给 pending 附普通 resume，会在批准后丢失原 prepare 事务并走旧单文件解析，因此明确不附 resume，批准只记录证据。
- 取消后 prepared 快照和 operation log 状态的闭环清理由下一轮事务仓库统一负责，避免本轮引入半套恢复机制。

## 结果

- 主项目 build 与 UI build 均通过。
- project-writer、E393-E397 相关核心测试 28/28；pipeline E398 与既有 E324 确认恢复测试 5/5。
- 已验证 artifact/pending 不含文件正文，确认前及选择 `confirm_changes` 后目标文件均零写入。
- 未运行 E2E、全量 bench 或真实 EDA 写操作；未提交。
