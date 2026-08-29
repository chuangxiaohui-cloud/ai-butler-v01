# 计划：medium 合成预算 12s→18s（E281）

> 日期：2026-08-29 · 对应 E281 · 用户拍板（按审计 M5）：[P-116]/[P-06] 12s→18s，[P-130] heavy 30s 不变

## 背景

E280 Q2「Redis 和 Memcached 哪个读取延迟更低」检索层已把 Anton Putra 基准文的毫秒级百分位数值带进证据，但两次 `synthesis_timeout`（38s/53s）均卡在 medium [P-116] 12s；`data/usage.jsonl` 无对应合成调用记录，判定为 deepseek 未在预算内返回被总预算中止。同规模探针确认 12s 对主链抖动无余量，MiniMax 兜底本身也不可依赖。

## 计划

1. `src/config/params.ts`：`llmFallbackTotalBudgetMs` 12000→18000，同步 P-116/P-128/P-130 注释 → 验证：build
2. `src/search/llm.ts`：P-116 引用注释 12s→18s → 验证：build
3. 需求文档 §5 P-06/P-116 值、§6.7/§6.5.6 E281 说明、附录 A E281 → 验证：doc-lint
4. bench:B-20260829-01 探针报告 + 相关单测 + doc-lint

## 执行

- 探针（`data/usage.jsonl` 实测 prompt：deepseek 5048 / MiniMax 4450 tokens，maxTokens 1500）：deepseek-v4-flash 4.0/6.5/10.9s；MiniMax-M2.7 14.7s/25s abort。
- `src/config/params.ts` 改 `[P-116]` 值并同步注释；`src/search/llm.ts` 注释同步。
- 需求文档 §5 `[P-06]`/`[P-116]` 值同步，§6.7/§6.5.6 补 E281 说明，附录 A 登记 E281。

## 结果

- `npm run build` 绿；llm-registry/llm/pipeline 相关单测 67/67 绿；全量 `test:all` 单测 + 集成 32/32 全绿（重跑确认 INT-MCP-001 恢复通过）。
- `npm run doc-lint` 0 FAIL 0 WARN。
- Q2 e2e 用户已复测通过：gate=none、elapsed 64.7s、predicate=numeric，答案含双方毫秒级数值（生产 1.2/1.8ms、压测 0.5ms（P95 0.7/P99 1.1ms）、Tech Insider 0.09/0.12ms）；`bench:devil-v25` 全量回归待跑。
