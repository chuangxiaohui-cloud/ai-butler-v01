# v0.2b L1 提取质量问题记录

> 日期：2026-08-13｜状态：遗留待调（不阻塞 L0 写入与主对话）

## 现象

向 MemoryCore 写入 5 条中文问答对话（wp3-smoke）后，L1 提取流程正常触发，
但 `Total extracted memories: 0`，L2 因“No new L1 records since cursor”跳过。

## 已排除

- 调度正常：`Extracting from 5 new messages`、`LLM detected 1 scene(s)`、L1 complete、L2 timer 触发。
- LLM 调用正常：`StandaloneLLMRunner model=deepseek-chat` 调用成功。
- 质量门正常：`5 qualified from 10 input`（shouldExtractL1 通过）。
- 解析正常：返回合法 JSON 且含 scene，但 `memories` 为空数组。

## 疑点

1. `getExtractMemoriesSystemPrompt(promptMode)` 与 `deepseek-chat` 的提取指令不匹配，
   模型判定无可提取原子记忆。
2. 对话消息格式（user=提问 / assistant=回答）与 L1 提取预期可能不一致。
3. 中文简短对话的提取阈值/示例不足。

## 排查方向（下一轮）

1. 开启 MemoryCore 调试，抓取 L1 LLM 原始输出（raw）确认 memories 为何为空。
2. 试验 `promptMode` 变体（chat / structured 等）。
3. 换用 DeepSeek 其他模型（如 deepseek-reasoner）对比。
4. 若为 MemoryCore 行为，考虑给 L1 提取注入中文 few-shot。

## 影响

- L1/L2 蒸馏暂无法产出可复用记忆（Skill/Wiki 依赖受影响，WP4/WP5 评估时注意）。
- L0 写入与主对话不阻塞（写入即返回，蒸馏异步；SDK 超时由 postProcess catch）。
