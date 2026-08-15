# 推进计划：push:hosts 整链演练

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

用 `npm run push:hosts` 走一遍完整发布链路：预检（npm test + build）→ 暂存 → 提交 → 推送 GitHub/Gitee → 写入 `data/hosting-events.jsonl`。

## 计划

1. 创建本计划文档，作为演练提交载体。
2. `npm run push:hosts -- --dry-run` 确认 token 与目标仓库配置。
3. `npm run push:hosts -- --yes --message "docs: rehearse push:hosts chain (E93)"` 真实执行整链。
4. 检查 `data/hosting-events.jsonl` 双端 push 记录。
5. 补本计划结果与当日交接，doc-lint 后提交推送。

**验收标准**

- 脚本预检通过，双远端 push 成功，退出码 0。
- `data/hosting-events.jsonl` 出现 github.com 与 gitee.com 各一条 `ok: true` 记录。

## 执行过程

- `npm run push:hosts -- --dry-run`：token 均已配置，变更 2 个（`bench/search-metrics.jsonl` + 本计划文档）。
- `npm run push:hosts -- --yes --message "docs: rehearse push:hosts chain (E93)"`：脚本完成 npm test + build、add/commit、双端 push；GitHub 与 Gitee 均成功。
- 发现参数解析问题：脚本文档写 `--message "..."`，但解析器只认 `--message=...`，实际提交使用了默认信息。修复 `argValue()` 同时支持 `--message value` 与 `--message=value`（`--repo`/`--scope` 同理）。
- 修复后 `npm run push:hosts -- --dry-run --message "docs: verify space arg parsing"` 正确显示自定义提交信息。

## 结果

- 整链演练通过：`data/hosting-events.jsonl` 出现 github.com 与 gitee.com 各一条 `ok: true` 记录。
- 演练提交：`24cdab1`（默认提交信息）；参数解析修复随本计划结果提交。
- 回归：`npm run build` 与 `npm run test:all` 全绿；doc-lint 0 FAIL / 0 WARN。
