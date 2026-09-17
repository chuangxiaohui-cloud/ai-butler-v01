# 推进计划：新增市场 Skill 包抬升 L2 覆盖度

> 日期：2026-09-16 · 分支：v0.2b · 状态：完成

## 目标

在 `configs/market-skills` 新增 ≥10 个**可执行**市场包并安装，使 `maturity:check` 用户累积 Skill ≥50。

## 结果

- 新增并安装 **12** 个包（见下）；市场目录合计 **52**；`maturity:check` 显示 **用户累积 52/50+**。
- 等级仍 **L1**（复用率 20.9%、反馈 n=23）；未虚报 L2。
- 冒烟：`skill:market:run -- git-branch-current` / `maturity-check` 步骤成功。

### 新增包

| name | 步骤 |
|------|------|
| mcp-health | `npm run mcp:health` |
| maturity-check | `npm run maturity:check` |
| mcp-accept-dryrun | `npm run mcp:accept` |
| mcp-evidence | `npm run mcp:evidence` |
| git-log-oneline | `git log -5 --oneline` |
| git-branch-current | `git branch --show-current` |
| git-diff-stat | `git diff --stat` |
| profile-software-dry | `npm run profile:software -- --dry-run` |
| browser-status | `npm run browser:status` |
| repo-audit | `npm run repo:audit` |
| route-cases | `npm run route:cases` |
| npm-test-unit | `npm run test` |
