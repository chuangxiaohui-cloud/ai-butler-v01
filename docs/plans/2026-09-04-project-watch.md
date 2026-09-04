# 推进计划：projects/ 目录变更监听（外部改动进 files_changed SSE 刷新 UI 文件面板，E328）

> 日期：2026-09-04 · 分支：v0.2b · 状态：已完成
> 承接：owner「继续推进」并排除提交批次后，按推荐推进 §4.1 候选「projects/ 目录文件变更监听」。

## 目标

外部工具（编辑器/KiCad/手动/桌面同步）改动沙箱 `projects/` 时，UI 文件面板能自动刷新。
现状缺口：`files_changed` SSE 只在 `/api/ask` 问答写盘后由网关主动广播一次（`src/gateway/app.ts`），
外部改动不会触发刷新。

## 改动

- 新增 `src/gateway/project-watcher.ts`：
  - `snapshotProjects()`——复用 `listProjectFiles` 遍历口径取 `projects/` 快照，剔除编辑器/Office 临时文件（`~$*.docx`、`*.tmp`、`*.swp`、`*.lock`、`.~*`）。
  - `diffSnapshots()`——added / modified（大小或 mtime 变化）/ removed，按路径排序。
  - `startProjectWatcher()`——默认 2s 轮询，首轮快照为基线，变更回调抛错不中断轮询，`stop()` 可停。
- `src/gateway/server.ts`：gateway 启动后挂起监听，有变更即 `publishArtifactEvent('files_changed', { source: 'project_watch' })`；shutdown 时 `stop()`。
- UI 零改动（复用既有 `files_changed` 监听 → `loadFiles()`）。变更不写通知库、不触发 LLM（避免秘书日报摘要噪音与成本）。

## 结果

- 验证：`npm run build` 绿；project-watcher 定向 3/3（快照范围+临时文件剔除 / diff 四态排序与无变更 / 端到端：新增→同长改写 mtime→modified→临时文件不触发→删除→stop 后不再广播）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。全量 `test:all`/bench 未跑（成本纪律）。真实冒烟：`npm run gateway` 后外部改动 `projects/` → UI 文件面板自动刷新（待 owner 手动验收）。
- 文档：需求文档附录 A E328 登记；本计划；code-directory/directory-structure gateway 行同步；09-04 交接追加轮。
- 提交：未提交（延续工作区待统一确认批次）。
