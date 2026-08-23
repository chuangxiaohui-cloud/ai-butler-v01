# Bench B-20260824-03：[P-13] 初步真跑数据（13s 预算结构性不足）

> 日期：2026-08-24 · 分支：v0.2b · 主题：E230——E229 工具 LLM 真跑首批数据 + 延迟探针诊断

## 目的

E229 复测工具就绪后，owner 批准以小样本真跑一轮（LLM 模式，deepseek-v4-pro heavy），
获取 [P-13] 首批真实延迟数据并定位超时根因。

## 实测记录（真实调用，deepseek-v4-pro）

| 项 | 值 |
|----|-----|
| 命令 | `npm run deep:bench`（samples=3 sections=3 budget=13000ms，LLM 模式） |
| #1 STM32 选型 | 12008ms，source=fallback，sections=3，未超 |
| #2 嵌入式 Linux 启动 | 13003ms，source=fallback，sections=3，⚠️超预算 timedOut |
| #3 BLDC 电机库评估 | 13015ms，source=fallback，sections=3，⚠️超预算 timedOut |
| 汇总 | min=12008 p50=13003 p90=13015 max=13015，avg=12675ms；>13000ms 2/3；llm=0 fallback=3 timedOut=2 |

**关键结果：3/3 全部 fallback 降级**——LLM 分节均未在共享预算内完成，深度报告 LLM 增强路径实际不可达。

## 延迟探针（单次调用，maxTokens=300）

| # | 延迟 | 输出 |
|---|------|------|
| 1 | 8514ms | 871 字符（含 `<think>` 推理 token） |
| 2 | 9368ms | 1232 字符 |
| 3 | 9298ms | 946 字符 |

单次 heavy 调用 ≈ 8.5-9.4s（推理模型先输出 `<think>`）；深度报告为 4 次顺序调用
（大纲 1 + 分节 3），结构需求 ≈ 34-38s ≫ [P-13]=13s；共享预算下分节调用仅得剩余时间。

## 结论与决策选项

- [P-13]=13s 与当前实现（顺序 4 调用 + heavy 推理模型）**结构性不匹配**；n=3<15 不满足晋升门，维持 provisional。
- 待 owner 三选一：
  - **A 上调预算**：[P-13]→如 40s，但 P-15+P-13<=P-14 现为 14+13=27 刚卡线，需连带改 P-14/P-15；
  - **B 实现优化**：分节并行生成（2 轮 RTT ≈18s）或换 flash 档模型（§5 参数/§6 行为变更）；
  - **C 维持现状**：13s 内深度报告降级 fallback 组装（LLM 增强不可达，诚实登记）。
- 测试：build + test:all 全绿；doc-lint 0 FAIL 0 WARN。
