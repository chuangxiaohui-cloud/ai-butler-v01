# 项目冲突确认入口与决策证据

## 目标

- 把 E395 冲突仲裁契约登记到现有人类裁决队列，并由 gateway/UI 提供三个明确选择。
- pending 选项与最终选择均写入 append-only decision log，原记录不改写。
- 默认取消整批；任何选择只记录，不执行覆盖或合并。

## 非目标

- 本轮不执行 `keep_external` 或 `use_transaction`，不重新提交事务。
- 不接 project-writer 多文件自然语言入口，不开放 EDA 写操作。
- 不改造普通批准/否决与 confirm resume 行为。

## 验收标准

- 冲突契约可生成带结构化三选项、默认选择和事务摘要的 pending 记录。
- gateway 接受合法 choice，拒绝缺失或非法 choice；UI 对冲突记录展示三按钮。
- 裁决后追加一条带 selectedChoice/refId 的事件，原 pending 保持不变，目标文件零写入。
- 既有 approve/reject、resume 与项目事务测试保持通过。

## 执行过程

### 改动

- decision log 新增结构化 choices、defaultChoice、selectedChoice 与领域 context；带 choices 的 pending 不能再用普通 approve/reject 绕过明确选择。
- 新增项目冲突确认适配器，把 E395 契约登记为三选一 pending，并保留 transactionId、snapshotDir 和无正文冲突摘要。
- gateway 裁决端点支持 choice，非法/缺失 choice 明确拒绝；合法选择只追加 refId + selectedChoice 事件。
- UI 裁决页对结构化裁决展示三个具名按钮并标出默认“取消整批”；回执明确说明本轮未执行文件写入。

### 遇到的问题

- 现有裁决端点只有 approve/reject，无法无歧义表达两个不同的“批准型”选择；保留旧接口并新增 choice 分支，避免影响普通 confirm resume。
- `use_transaction` 的用户选择不等于文件状态仍安全，因此本轮只记录决策，执行留待重新校验机制完成后开放。

## 结果

- 主项目 build 与 UI build 均通过。
- 核心定向测试 24/24 通过；gateway 裁决相关测试 3/3 通过，覆盖既有 resume、普通批准/否决和 E396 choice。
- 验证 pending 原行不改写、裁决事件 append-only、缺失/非法 choice 拒绝、目标文件零写入且日志不含文件正文。
- 未运行 E2E、全量 bench 或真实 EDA 写操作；未提交。
