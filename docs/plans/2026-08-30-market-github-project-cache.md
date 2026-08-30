# 推进计划：市场通道 github-project 接缓存（E290）

> 日期：2026-08-30 · 分支：v0.2b · 状态：已完成

## 目标

E284 残余项闭环：市场 Skill github-project 通道接入同一份 GitHub API 缓存（[P-142] TTL），使重复解读同一仓库时 GitHub API 调用回落、fetchMs 稳定，与 main/gateway/im 三生产入口共用 `data/github-api-cache.db`。

## 计划

1. `src/skills/market/github-project.ts`：`GithubProjectOptions` 新增可选 `httpCache` 注入，透传 `createGithubReaderSkill({httpCache})`
2. `scripts/market-github-project.ts`：以 `import.meta.url` 锚定仓库根 `data/github-api-cache.db`（`GITHUB_CACHE_DB_PATH` 可覆盖），建 `createGithubApiCache()` 单例注入
3. 补单测：注入 httpCache 后二次运行 GitHub API 调用 ≤1（repo/contributors/releases 命中，commits since 秒级变动可 miss；raw 仍直连）
4. 验证：build + 定向测试 + test:all + doc-lint + 附录 A E290 登记

**验收标准**

- github-project 单测新增 1 条全绿（二次运行 API 调用显著减少）
- `npm run build` 0 错误；`npm run test:all` 单测 + 集成全绿；doc-lint 0 FAIL 0 WARN
- 附录 A 登记 E290；bench:na（复用既有 [P-142]，无 §5/§6 数值变更）

## 执行过程

### 改动

- `src/skills/market/github-project.ts`：`GithubProjectOptions` 增 `httpCache?: HttpCacheLike`；`createGithubReaderSkill({...})` 增 `httpCache: opts.httpCache` 透传
- `scripts/market-github-project.ts`：仓库根解析（`import.meta.url`）+ `GITHUB_CACHE_DB_PATH ??=` 锚定 + `createGithubApiCache()` 注入
- `src/skills/market/github-project.test.ts`：新增 E290 缓存命中测试 1 条

### 遇到的问题

- 工作树 CRLF 检出且 `github-project.ts` 混合行尾（接口行 LF），多行字符串替换不匹配——改为按行编辑、按文件主导行尾拼接

## 结果

- 验证：`npm run build` 绿；github-project 单测 5/5（含新增 E290 缓存命中 1 条）；全量单测 1127/1128（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN
- 测试：单测 1127/1128（1 skip）+ 集成 32/32
- 提交：`<hash>`
- 遗留事项：真实 CLI/市场冒烟复测待用户（成本纪律，不代跑）；commits `since` 秒级变动使该 URL 自动失效属设计内
