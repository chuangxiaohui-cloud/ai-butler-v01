# 推进计划：修改建议反馈与记忆写入

> 日期：2026-09-12 · 分支：v0.2b · 状态：完成（未提交）

## 目标

继续落实 §9.3：用户可直接修订 Agent 回复，修订作为 `correct` 反馈持久化，并写入 Chat Memory L1-L2。

## 计划

1. 扩展反馈契约，保存原答与修订答
2. gateway 校验 correct 反馈并同步写入用户上下文
3. UI 接通“修改建议”编辑与提交面板
4. 更新项目文档与当日交接

**验收标准**

- correct 必须携带非空且不同于原答的修订文本
- 反馈审计保留原答与修订答，统计计入 correct
- 技术性修订写入 L2，其他修订偏好写入 L1
- 主项目、UI 构建与定向单测通过

## 执行过程

### 改动

- `FeedbackStore` 新增 `correct` 与 `correctedAnswer`，原答和修订答随 append-only 事件共同保留，最新值统计新增 correct。
- gateway 对修订答执行非空、不同于原答、不得混带负反馈详情的组合校验；成功后将修订偏好写入当前栏位 Chat Memory。
- 技术性修订映射 L2，其他回复偏好映射 L1；修订偏好不生成确定槽位冲突键。
- UI 的“修改建议”按钮接入完整回复编辑框，未修改或空内容不能提交，API 成功后才关闭并点亮按钮，刷新后可恢复最新状态。

### 遇到的问题

- 无新增实现阻塞。`doc-lint` 仍仅被需求文档第 19 行既有 provisional 示例超期阻断，与本轮无关。

## 结果

- `npm run build`：通过。
- `ui/prototype` 的 `npm run build`：通过。
- feedback-store + persona-memory 定向单测：6/6 通过。
- gateway feedback 定向单测：2/2 通过。
- `git diff --check`：通过。
- 未运行 E2E / bench，零外部 LLM 调用，未提交。
