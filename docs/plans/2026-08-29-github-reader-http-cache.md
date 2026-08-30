# 推进计划：github-reader GitHub API 轻量 SQLite 缓存（fetchMs 稳定化）

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成

## 目标

用户六轮复测收官成绩单：synthesisMs 8.0s、totalMs 18.3s 全达标，唯一残留是 fetchMs 波动（1.9s ↔ 10.2s）。按用户拍板加一层轻量 SQLite 缓存：**只缓存 GitHub API 的 JSON**（repo / contributors / commits / releases），TTL 5–10 分钟；**raw README / manifest 不缓存**。目标是让同一仓库反复解读时 fetchMs 稳定在 ~1–2s。

## 背景（已只读核验）

- `src/skills/github-reader/index.ts`：`httpGetJson`（repo/contributors/commits/releases 四个 API 调用）与 `fetchRaw`（raw.githubusercontent.com README/manifest）全部直连、无任何本地缓存；仓库亦无通用 HTTP 缓存工具。
- 每次跑固定 6 个网络请求；fetchMs 1.9–10.2s 波动来自 GitHub API/网络抖动，连续多次跑同一仓库还接近匿名限流（60 req/h）。
- 仓库已有 `node:sqlite` DatabaseSync 用法（`src/memory/user-context-store.ts`），跟随该模式，不引入新依赖。
- 测试隔离约束：`loadEnvFile` 会把 `.env` key 回填进 `process.env`；缓存必须可注入/可关断，否则单测（github-reader / pipeline 用 mock fetch + 重复 URL）会吃到跨测试残留的缓存脏数据。因此缓存走 SkillDeps 注入，测试不提供即不缓存。
- 作用域：仅生产三入口（main / gateway / im）接线；市场通道 `github-project.ts`（默认结构化模板路径）本次不接，列为后续。

## 计划

1. `src/skills/deps.ts`：新增 `HttpCacheLike` 接口（`get(url): string | null` / `set(url, body, ttlMs)`），`SkillDeps` 新增可选 `httpCache` → 验证：build
2. 新增 `src/skills/github-reader/cache.ts`：`SqliteGithubApiCache implements HttpCacheLike`（node:sqlite，表 `http_cache(url PK, body, fetched_at, ttl_ms)`，`now` 可注入）+ `createGithubApiCache()` 模块级单例（DB 路径 `GITHUB_CACHE_DB_PATH` 或默认 `data/github-api-cache.db`）→ 验证：cache 单测
3. `src/config/params.ts`：新增 `githubApiCacheTtlMs: 300_000` + `PARAM_IDS` 登记 `P-142`（§5 新参数，provisional）→ 验证：build（Record 类型强制双写）
4. `src/skills/github-reader/index.ts`：`GithubReaderOptions` 增 `httpCache?`；`execute` 把 `deps.httpCache` 并入 opts；`httpGetJson` 命中缓存直接返回（坏缓存条目丢弃重抓），未命中才 fetch 且**仅成功 JSON.parse 后**写入缓存 → 验证：github-reader 单测（新增缓存读写用例）
5. `src/main.ts` / `src/gateway/server.ts` / `src/im/run.ts`：`skillDeps` 接线 `httpCache: createGithubApiCache()` → 验证：build
6. 新增 `src/skills/github-reader/cache.test.ts`：miss→null / set→hit / TTL 过期→miss / 路径隔离（tmp db）+ github-reader 用例：注入 httpCache 后第二次执行命中缓存不再 fetch → 验证：目标单测
7. 文档：计划 + §5 P-142 行 + 附录 A E284 + progress-handoff → 验证：doc-lint

**验收标准**

- `npm run build` 绿；cache / github-reader / pipeline / llm 目标单测全绿；全量 `npm run test:all` 绿；`npm run doc-lint` 0 FAIL 0 WARN
- 不复跑 bench / e2e（成本纪律）；用户手动复测同一 query：fetchMs 回落（期望 ≤3s）、答案数据与六轮成绩单一致
- raw README/manifest 不缓存；缓存条目 5 分钟后过期自动失效

## 执行过程

### 改动

- `src/skills/deps.ts`：新增 `HttpCacheLike`（`get(url): string | null` / `set(url, body, ttlMs)`）；`SkillDeps` 新增可选 `httpCache`。
- 新增 `src/skills/github-reader/cache.ts`：`SqliteGithubApiCache`（node:sqlite DatabaseSync，`PRAGMA journal_mode=WAL` 等与 UserContextStore 同款；表 `http_cache(url PK, body, fetched_at, ttl_ms)`，过期条目命中时惰性删除；`now` 可注入）+ `createGithubApiCache()` 模块级单例（路径 `GITHUB_CACHE_DB_PATH` 或 `data/github-api-cache.db`）。
- `src/config/params.ts`：`githubApiCacheTtlMs: 300_000`（P-142，5 分钟）+ `PARAM_IDS` 同步登记。
- `src/skills/github-reader/index.ts`：`GithubReaderOptions.httpCache?`；`execute` 起始把 `deps.httpCache` 并入 `optsWithCache` 供 4 个 API 调用使用；`httpGetJson` 先查缓存（坏 JSON 条目按 miss 重抓），未命中 fetch，**仅 JSON.parse 成功后**以原始响应文本写缓存（`PARAMS.githubApiCacheTtlMs`）；`fetchRaw`（README/manifest）不经缓存。
- `src/main.ts` / `src/gateway/server.ts` / `src/im/run.ts`：`skillDeps` 接线 `httpCache: createGithubApiCache()`。
- 新增 `src/skills/github-reader/cache.test.ts`（4 条）：miss→null / set 命中 / TTL 过期惰性删除 / 覆盖写 + 单例（`GITHUB_CACHE_DB_PATH` 指向 tmp，避免污染 data/）。
- `src/skills/github-reader/index.test.ts`（+1）：注入内存 httpCache，二次执行断言 GitHub API 请求计数不再增长（raw 仍直连）、缓存 ≥4 条、契约正常产出。

### 遇到的问题

- 无（缓存走 SkillDeps 注入后，github-reader / pipeline 既有单测天然不提供 httpCache，零测试污染；`createGithubApiCache` 单例测试用 `GITHUB_CACHE_DB_PATH` 指向 tmp，不影响默认 data/ 路径）。

## 结果

- 验证：`npm run build` 绿；cache 4/4、github-reader 22/22、pipeline 53/53、llm 8/8、github-project 4/4；`npm run test:all` 退出码 0（集成 32/32）；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：单测目标文件全绿 + 集成 32/32。
- 提交：未提交（工作区含 E275-E284 大量未提交改动，提交前需 doc-lint + test:all 全绿）。
- **复测结果（2026-08-30 下午）**：`npm run dev -- "https://github.com/deepseek-ai/deepseek-harness 这项目是做什么用的？"` 连跑两次——第 1 次（冷，缓存 TTL 已过期）fetchMs=9234.9ms，第 2 次（热）fetchMs=2817.8ms，回落约 3.3×；答案核心数据一致（健康分 84 / Star 203,611 / 提交 100 / 贡献者 29 / 最近推送 2 天前）。未完全落到 ~1-2s 的原因：commits `since` 参数按秒精度每次重算 → 该 URL 每次 miss 重抓；raw README/manifest 按设计不缓存。cache DB 验证 repo/contributors/releases 三端命中，仅 commits + raw 每次重抓。
- 市场通道 github-project 未接缓存（默认结构化模板路径，后续如需再补，列入 v2.6+ 候选）。