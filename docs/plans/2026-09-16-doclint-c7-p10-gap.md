# 推进计划：doc-lint C7 收口 + [P-10] 条件③/④ 差距盘点

> 日期：2026-09-16 · 分支：v0.2b · 状态：完成

## 目标

1. 消除 doc-lint C7 唯一 FAIL（§0.2 举例中的过期 `[provisional@2026-08-13]`，P-82 已于 E289 定稿）。
2. 盘点成熟度 L2 真实缺口（不刷数、不虚报）。
3. 补跑 `test:all`，缩小 [P-10] 条件④ 缺口。

## 结果

- `npm run doc-lint`：**0 FAIL 0 WARN**（C7 通过）。
- `npm run maturity:check`：仍 **L1**（Skill 40/50、n=23/30、复用率 20.9%）；报告见 [`docs/reports/maturity-l2-gap-2026-09-16.md`](../reports/maturity-l2-gap-2026-09-16.md)。
- `npm run test:all`：单测 **1639 pass / 1 skip / 0 fail**；集成 **36/36**。
- `mcp:accept` 在 `E414_DOC_LINT_CLEAN=1 E414_FULL_REGRESSION=1` 下：[P-10] ①④ ✅，③❌，②⑤ ⏸。
- 脚本：`E414_DOC_LINT_CLEAN` / `E414_FULL_REGRESSION` 可写入差距快照。

## 验收标准核对

- doc-lint 0 FAIL 0 WARN：✅
- 成熟度缺口可核对：✅（仍为 L1，未虚报 L2）
- [P-10] 不单独宣告通过：✅
