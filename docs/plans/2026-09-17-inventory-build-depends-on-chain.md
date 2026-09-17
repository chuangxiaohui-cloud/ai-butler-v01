# 推进计划：inventory→build 同计划 dependsOn 链（E437）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

平台已明确且画像仍有可验证 build、但因其他字段过期需重探测时，生成 `[inventory → build]` 同计划：`build.dependsOn = [inventory.id]`，状态走 `approval_required`/`ready`（含 build，不得 inventory_required 免批执行）。缺失画像或 capability.build 已清空时仍只盘点。

## 结果

- `reprobeRequired` + 有效 build → 2 节点 dependsOn 链，须批准。
- 缺失画像 / capability 过期清空 build → 仍仅 inventory。
- 新鲜画像 → 仍仅单 build；定向单测 + doc-lint 绿。
