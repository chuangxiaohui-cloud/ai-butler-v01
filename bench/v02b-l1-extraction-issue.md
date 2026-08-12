# v0.2b L1 提取质量问题记录

> 日期：2026-08-13｜状态：**已缓解（项目侧 distill worker 落地，E6）**

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

## 排查结论（2026-08-13）

已复现并验证：
- 直接调用 DeepSeek（`deepseek-chat`/`deepseek-v4-flash`）与 MemoryCore 默认 L1 prompt：
  对"用户明确陈述工具偏好"（含"以后我画板子都用 Altium Designer，不用 KiCad，打样走嘉立创"）
  返回 `memories: []` 或误判为 episodic"比较"。
- `deepseek-reasoner` 同样返回空。
- 追加 few-shot 示例 / 强化规则：不稳定，模型仍常输出 episodic 或空。

根因判断：DeepSeek 对 MemoryCore L1 prompt 的"宁缺毋滥"执行偏保守，且把"不用 X"误读为对比事件；
默认 prompt 面向的模型行为与 DeepSeek 不匹配。

## 候选方案（待决策）

| 方案 | 做法 | 代价 |
|---|---|---|
| A | MemoryCore LLM 改用 OpenAI 系模型（如 gpt-4o-mini） | 需额外 key/成本；非 DeepSeek 单栈 |
| B | 项目侧自研 L1 蒸馏兜底：DeepSeek + 本项目中文 prompt 从 L0 提取，写入 ExperienceManager（WP4），登记 E6 技术偏离 | MemoryCore L1/L2 不作为主路径；需实现 distill worker |
| C | 接受现状：MemoryCore 蒸馏仅对强信号（明确指令/健康禁忌等）生效，偏好类弱信号不进 L1 | 记忆价值打折，成熟度依赖人工反馈 |

推荐 B：保持 DeepSeek 单栈，L0 提取可控，且复用已完成的 ExperienceManager。

## 落地（方案 B，2026-08-13）

- `src/memory/distill.ts`：DeepSeek + 本项目中文 prompt，输出 persona/episodic/instruction + keywords。
- `scripts/distill-worker.ts`：从 `data/memory.db` L0 提取并写入 ExperienceManager（幂等 id `l0:<rowid>:<idx>`）。
- 实测：全量 137 条 L0 → 191 条记忆，成功 130 条。
- MemoryCore 内置 L1 不作为主路径；E6 已登记，复验门为 MemoryCore 适配后评估回切。

## 影响

- L1/L2 蒸馏暂无法产出可复用记忆（Skill/Wiki 依赖受影响，WP4/WP5 评估时注意）。
- L0 写入与主对话不阻塞（写入即返回，蒸馏异步；SDK 超时由 postProcess catch）。
