# Bench B-20260829-01：medium 合成预算 12s→18s（E281）

> 日期：2026-08-29 · 对应 E281

## 目的

验证 E280 Q2 两次 `synthesis_timeout` 是 deepseek API 抖动撞 [P-116] 12s，而非输入规模或模型能力问题，为 [P-06]/[P-116] 12s→18s 提供探针数据。

## 方法

- 直接调用 medium provider（不走 fallback 链），prompt 模拟 Stage 5 合成规模：约 8.7k chars，`data/usage.jsonl` 实测 deepseek 5048 / MiniMax 4450 prompt tokens，maxTokens 1500。
- deepseek-v4-flash × 3、MiniMax-M2.7 × 2；单次 25s 超时截断。
- 对照 `data/trajectory.jsonl` / `data/usage.jsonl`：Q2 两次 `synthesis_timeout` 均无合成 usage 记录。

## 结果

| provider | 耗时 |
|------|------|
| deepseek-v4-flash | 6.5s / 4.0s / 10.9s |
| MiniMax-M2.7 | 14.7s / 25s abort |

## 结论

- deepseek 同规模正常 4~11s，已贴 12s 红线；MiniMax 兜底 14.7~25s，12s 预算下不可能完成。
- Q2 两次超时均无 usage 记录，说明 deepseek 未在 12s 内返回被总预算中止，属 API 抖动而非输入规模。
- 用户拍板 [P-06]/[P-116] 12s→18s，medium 主链留抖动余量；[P-130] heavy 30s 不变。

## e2e 复测（E281 后）

- `npm run dev -- "Redis 和 Memcached 哪个读取延迟更低"`：gate=none、elapsed 64.7s、predicate=numeric。
- 答案含 生产实测 1.2/1.8ms、压测 0.5ms（P95 0.7/P99 1.1ms）、Tech Insider 0.09/0.12ms，双方毫秒级数值完整入答案。
- 结论：18s 预算下 medium 主链完成合成，Q2 验证阻塞关闭。
