# Bench B-20260829-02：普通知识问答耗时纯读探针（M6 前置）

> 日期：2026-08-29 · 对应架构审阅 M6 · 纯读分析，无 API 调用、无参数改动

## 目的

量化「普通知识问答 33-50s/次」的耗时分布，判断瓶颈在搜索 provider、子搜索串行循环、二次取证抓正文还是 Stage 5 合成，为是否立项优化提供数据。

## 方法

- 只读 `data/trajectory.jsonl`（728 个含 search+answer 的会话）与 `bench/search-metrics.jsonl`（2251 条请求）。
- 按 session 还原 route→search→synthesize→answer 时间戳，拆出：`preSearch`（路由后到搜索前）、`search`（Stage 3 全循环，含 LLM 改写/judge）、`search→synth`（Stage 4 融合 + P0 二次取证 + Stage 5 合成 LLM）、`synth→answer`（Stage 6 后处理）。
- 探针脚本：`scripts/probe-search-latency.ts`（只读，可 `--summary` 复用）。

## 结果

### 最近真实会话（2026-08-29）

| 查询 | total | search | preSearch | search→synth | synth→answer | 子查询数 |
|------|------|--------|-----------|--------------|--------------|---------|
| Redis vs Memcached 读取延迟 对比 | 64713ms | 25994ms | 2019ms | 29401ms | 55ms | 5 |
| 中国AI大模型公司市值较高的前几家公司有哪些？ | 55979ms | 32424ms | 20ms | 16670ms | 34ms | 5 |

### 近 7 天聚合（n=262）

| 阶段 | avg | p50 | p95 | max |
|------|-----|-----|-----|-----|
| total | 25118ms | 16695ms | 82970ms | 104927ms |
| search | 8301ms | 1330ms | 46293ms | 64021ms |
| search→synth | 12597ms | 11919ms | 26131ms | 58707ms |
| synth→answer | 33ms | 1ms | 93ms | 1056ms |

### 分引擎时延（近 7 天，757 条请求）

| 指标 | avg | p50 | p95 | max |
|------|-----|-----|-----|-----|
| 单次 stage（双引擎并行取 max） | 695ms | 825ms | 1870ms | 4968ms |
| bocha_ms | 157ms | 147ms | 379ms | 492ms |
| anysearch_ms | 1250ms | 1148ms | 2070ms | 4968ms |

## 结论

- **搜索 provider 不是瓶颈**：近 7 天单次 stage p95 1.9s、max 4.97s，Bocha p50 147ms / AnySearch p50 1148ms；上限由 [P-02] 5s 兜住。
- **两个大头**：① 复杂数值/benchmark 查询的 Stage 3 串行子搜索循环（近 7 天 p95 46.3s，实测 26-64s），子查询 5 条且每条含 LLM 改写/judge 串行调用；② `search→synth` 稳定占 12-30s（p50 11.9s / p95 26.1s），由 P0 二次取证抓正文 + Stage 5 合成 LLM 构成，当前无法从 trajectory 进一步拆分。
- **Stage 6 后处理可忽略**（synth→answer p50 1ms）。
- **下一步建议**：先给 trajectory 补 search→synth 内部阶段计时（P0 fetch 与 Stage 5 LLM 分开），或对子搜索循环加「每轮 judge/改写耗时」观测，再决定优化点；不改变任何参数。
