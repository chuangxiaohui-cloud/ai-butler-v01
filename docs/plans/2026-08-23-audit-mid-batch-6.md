# 推进计划：架构审计中期批·第六批（P12 + P16）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

中期批继续：P12（experience 的 `search()/list()/stats()` 全表 `SELECT *` 载入内存再关键词
过滤，O(N)/请求）+ P16（gateway `rateBuckets` Map 只增不删，每个新 IP 永久占一条；且
`/api/ask` 只有速率限制无并发上限，30 req/min 内的并发请求可同时打满 LLM 配额）。

## 计划

1. P12 `src/memory/experience.ts`：`search()` 把 needs_review / 置信度 / 冷存 cutoff /
   关键词命中下推 SQL（`LIKE ? ESCAPE '\'` 转义 `%`/`_`/`\`，无有效 token 返回空）；
   `stats()` 改单趟聚合 SQL（total/active/cold/review 各 COUNT）；`list()` 保持全量枚举
   契约（管理端 /api/memory 列表，非热路径，不做静默截断）。
2. P16 新建 `src/gateway/rate-limit.ts`：`RateLimiter`（按 IP 令牌桶 + 过期桶定期清扫 +
   超 [P-114] 上限强制淘汰最旧）+ `ConcurrencyGate`（[P-115] 并发闸门，release 幂等）；
   `src/gateway/app.ts` `/api/ask` 挂 `concurrencyLimitAsk` 中间件（429 系统繁忙）。
3. 参数：§5 注册 [P-114]（限速桶最大 IP 条目数 10000）、[P-115]（/api/ask 最大并发 4）
   + params.ts 同步 PARAMS/PARAM_IDS。
4. 测试：`experience.test.ts` 补 3 条（LIKE 特殊字符按字面匹配、空 token 返回空、
   stats 混合条目计数）；新建 `src/gateway/rate-limit.test.ts`（限速放行/拒绝/窗口重置/
   清扫/超上限淘汰最旧 + 并发闸门 acquire/release/幂等）。
5. 验证：build + 定向单测 + 全量 test:all + doc-lint 0 FAIL 0 WARN。
6. 文档：附录 A E213 登记；AGENTS.md 目录地图/code-directory/directory-structure 补
   `src/gateway/rate-limit.ts`；交接登记；本计划补结果。

**验收标准**

- experience.search 由 SQL 先过滤再 JS 打分，候选行数不再等于全表；stats 单趟 COUNT。
- rateBuckets 不再永久驻留：过期桶定期清扫 + 超 [P-114] 淘汰最旧；/api/ask 并发超
  [P-115] 立即 429，不再无上限打满 LLM 配额。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- 参数：§5 注册 [P-114] gateway 限速桶最大 IP 条目数 10000 / [P-115] /api/ask 最大
  并发 4；`src/config/params.ts` 同步 PARAMS + PARAM_IDS（C8 29 key 通过）。
- P12 `src/memory/experience.ts`：`search()` 候选下推 SQL——`needs_review = 0`、
  `confidence >= [P-32]`、冷存 cutoff（last_used_at / created_at 两分支，[P-31] 90 天）、
  关键词 `LIKE ? ESCAPE '\'`（`escapeLike` 转义 `%`/`_`/`\` 按字面匹配，防查询 token
  扩大匹配面）；无有效 token 直接返回空（保持原语义）；JS 只对 SQL 候选行做 hits
  打分/排序/limit。`stats()` 改单趟聚合 SQL（total/active/cold/review 各 COUNT），
  不再全表载入。`list()` 保持全量枚举契约（管理端 /api/memory 列表，非热路径）。
- P16 新建 `src/gateway/rate-limit.ts`：`RateLimiter`（按 IP 令牌桶限速，`allow()` 放行/
  拒绝；过期桶每 60s 定期清扫；超 [P-114] 上限按插入序淘汰最旧，均摊 O(1)）+
  `ConcurrencyGate`（[P-115] 并发闸门，`release()` 幂等）。`src/gateway/app.ts`
  `/api/ask` 挂 `concurrencyLimitAsk` 中间件（`res.on('finish'/'close')` 双保险释放，
  released 标志防双减），并发满返回 429「系统繁忙」。
- 测试：`src/gateway/rate-limit.test.ts` 新建 4 条；`src/memory/experience.test.ts`
  补 3 条（LIKE 通配符字面匹配、空 token 返回空、stats 混合条目计数）。

### 遇到的问题

- 首版 RateLimiter 的清扫条件用 `size < maxEntries`：Map 满后每次请求都触发 O(size)
  全扫；且插入后才超上限时无淘汰逻辑。改为「定时到达或 `size > maxEntries` 才扫」+
  `enforceMax()` 在插入后按插入序淘汰最旧，Map 严格受控且均摊 O(1)。
- SQL `LIKE` 的 `%`/`_` 是通配符：查询 token 含 `100%`/`10_` 会扩大匹配面。加
  `ESCAPE '\'` + `escapeLike`（转义 `%`/`_`/`\` 自身）后按字面匹配；测试覆盖
  `100%` 命中、`10_` 不误配 `100`。
- `stats()` 冷存口径与 `isColdAfter` 一致（严格大于冷存天数才算冷）：SQL 用
  `last < cutoff` 且 cutoff = now - 90 天，边界 `== cutoff` 算 active，与旧行为对齐。

## 结果

- 验证：`npm run build` 通过；定向单测 34/34（gateway 24 + rate-limit 4 + experience 6）；
  `npm run test:all` 全量单测 648/649（1 skip）+ 集成 15/15；`doc-lint` 0 FAIL 0 WARN
  （PARAM 105、C8 29 key）。
- 测试：新增 7 条全绿（rate-limit 4 + experience 3）；既有 gateway/experience 回归通过。
- 提交：待提交（与安全/正确性/决策/中期第一~五批同批）。
- 遗留事项：中期批剩余 P1/P2/P10/P13/P14/P17 + B2/B3 + S1-S3。