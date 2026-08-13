# E1/E2 复验门定稿评估（WP11）

> 日期：2026-08-13｜脚本：`scripts/finalize-gates.ts`（`npm run finalize:gates`）｜窗口：`>=2026-08-12T16:00:00Z`
> 结论：**E1/E2 复验门均 PASS**；WP11 续采后 `[P-04]` 推荐 1750ms（首轮 n=30 时推荐 1500ms），`[P-02]` 保持 5s；状态继续 provisional，待 owner 签认后晋升。

## E1（[P-04] Stage 2 意图分类预算）

| 指标 | 值 |
|---|---|
| 样本 | n=70（10 条基准 × 7 轮） |
| 超时率（2000ms 下） | 0.0%（0/70） |
| 准确率 | 80.0%（56/70） |
| 时延 min / median / p95 / max | 662 / 1065 / 1406 / 1542 ms |
| 推荐值 | `ceil(1406 × 1.2 / 250) × 250 = 1750ms` |

判定：超时率 ≤10%、准确率 ≥80%、推荐值 ≤2000ms，PASS。

> 首轮复核（E9）：n=30，p95=1140ms，推荐 1500ms；续采（E11-E14）后样本更充分，以 n=70 推荐值为准。

## E2（[P-02] Stage 3 搜索执行预算）

| 引擎 | n | 失败 | 超时率 | p95 | max |
|---|---|---|---|---|---|
| Bocha | 145 | 6 | 4.1% | 328ms | 394ms |
| AnySearch | 165 | 15 | 9.1% | 4459ms | 4917ms |

判定：Bocha ≤10%、AnySearch ≤30%，均未触发重开；AnySearch p95 距 5s 上限约 423ms，max 距约 83ms，P-02=5s 保持成立。

## 定稿前置核对

- ① 附录 A 变更记录：E9/E11/E12/E13/E14。
- ② 证据：本报告 + `bench/classify-metrics.jsonl` + `bench/search-metrics.jsonl`。
- ③ 样本 n≥30：满足。
- ④ 附录 C 无相反证据：暂未发现。
- ⑤ owner 签认：待 owner。

## 建议

- owner 批准后：`[P-04]` 2000ms → 1750ms，并同步 `LLM_CLASSIFY_TIMEOUT_MS` 默认值。
- `[P-02]` 保持 5s；若后续 AnySearch 尾延迟继续恶化，回灌观察按 E2 复验门重开。
