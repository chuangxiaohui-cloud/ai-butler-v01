# Provider Registry / 模型分档 bench

> 日期：2026-08-16 | bench:B-20260816-04 | 模式：纯本地（无网络请求）

## 分档规则

| Query | 期望档 | 实际档 | 结果 |
|---|------|------|------|
| STM32F103C8T6 主频是多少 | 期望 medium | 实际 medium | PASS |
| 写一个 I2C 软件驱动 | 期望 heavy | 实际 heavy | PASS |
| 分析这个 GitHub 项目 | 期望 heavy | 实际 heavy | PASS |
| 帮我润色这段文字 | 期望 heavy | 实际 heavy | PASS |
| 今天天气怎么样 | 期望 medium | 实际 medium | PASS |

## Provider 解析（当前 env）

| 角色 | provider | 名称 | model | 状态 |
|------|----------|------|-------|------|
| light | deepseek | DeepSeek | deepseek-chat | 可用 |
| medium | deepseek | DeepSeek | deepseek-chat | 可用 |
| heavy | deepseek | DeepSeek | deepseek-chat | 可用 |
| vision | deepseek | DeepSeek | deepseek-chat | 可用 |

## 结论

- fallback 链上限：3 家（P-107）；默认档 medium（P-105）。
- 重档集合：execute / write_doc / github_analysis / rewrite / pack_project / plan / 文档摘要结构。
- 便宜优先：LLM_PROVIDER_ORDER 控制顺序，未配置 key 的 provider 自动跳过。
