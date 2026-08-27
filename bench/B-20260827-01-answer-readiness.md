# Bench B-20260827-01：答案覆盖度整体指标基线（P-ZZZ'）

> 日期：2026-08-28 · 对应 E271

## 目的

按「改决策机制、不改决策内容」为三维回答力信号（信号 A/B/C）建立**整体指标基线**，不逐 query 加断言：任一改动若让某类意图的指标退化，在整体指标上即可暴露，无需人肉发现。

## 指标定义

| 指标 | 口径 | 数据源 |
|------|------|--------|
| predicate 分类覆盖率 | 数值/时序/操作/观点 四类被识别的 query 占比（非 other） | `AI-Agent_魔鬼训练_v2.5.csv` 122 条 query |
| 答案覆盖度达标率（真实证据） | `checkEvidenceReadiness(query, top-3 证据标题+URL)` 达标占比 | `bench/devil-v25/results.jsonl` 已有运行结果 |
| 证据多样性达标率 | top-3 evidence 覆盖 ≥2 个不同域名的 query 占比 | 同上 |

运行方式：`npm run bench:answer-readiness`（离线，不依赖网络/LLM）。产物：`bench/answer-readiness-20260827.json`。

## 基线结果（E271 首跑）

- predicate 分类覆盖率：**60.7%**
- 答案覆盖度达标率（真实证据，n=89）：**55.1%**
- 证据多样性达标率（n=79）：**93.7%**

### 按意图分组

| 意图 | n | 分类覆盖 | 覆盖度-代理 | 覆盖度-真实 |
|------|---|---------|------------|------------|
| factual | 45 | 29% | 73% | 90% |
| how_to | 43 | 95% | 9% | 15% |
| comparison | 12 | 42% | 67% | 82% |
| troubleshooting | 7 | 57% | 43% | 83% |
| emergency | 5 | 80% | 20% | 100% |
| github_analysis | 4 | 50% | 50% | 33% |
| news | 3 | 100% | 0% | 0% |
| experience | 3 | 67% | 67% | 0% |

## 已知基线缺口（后续增强方向，非本轮阻塞）

- factual 分类覆盖率低（29%）：大量芯片/参数问句不带「多少/哪几家」等显式疑问词，predicate 归类为 other（不 gate、不注入边界，行为安全）。
- how_to/news/experience 覆盖度达标率低：证据仅取标题+URL，步骤/日期/引述形态常出现在正文而非标题；已由合成前诚实边界兜底（「证据未覆盖」明说，不编造）。
- 证据多样性用「域名 + token Jaccard」近似，后续可升级 embedding 聚类（依赖纪律：不新增外部依赖）。

## 结论

- 整体指标基线建立完成；后续任何信号 A/B/C 改动以本基准为回归锚点。
- 单元层已有对应覆盖：`http-fetch` / `answer-readiness` / `fusion`（多样性替换）/ `s5`（诚实边界注入）/ `pipeline`（synthesis_timeout 门）。
