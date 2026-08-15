# 推进计划：push:hosts 整链演练

> 日期：2026-08-15 · 分支：v0.2b · 状态：执行中

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

- 待写入。

## 结果

- 待写入。
