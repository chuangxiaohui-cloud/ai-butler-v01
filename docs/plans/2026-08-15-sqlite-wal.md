# 推进计划：source-stats SQLite 并发写锁修复

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

修复两条 `npm run dev` 并发执行时报 `database is locked` 的问题：`source-stats` 默认 SQLite journal 不支持多进程并发写。

## 计划

1. `SearchSourceStats` 连接后启用 `journal_mode=WAL`、`busy_timeout=5000`、`synchronous=NORMAL`。
2. 新增多实例写同一库的单测。
3. 跑 build/test/doc-lint。
4. 用两个并发 `npm run dev` 冒烟验证不再报锁。
5. 更新计划、交接、v2.5 附录 A（E96），提交推送。

**验收标准**

- 两个进程同时写 `source-stats.db` 不报 `database is locked`。
- 单测/集成全绿。

## 执行过程

- `SearchSourceStats` 连接后新增 `PRAGMA journal_mode = WAL`、`PRAGMA busy_timeout = 5000`、`PRAGMA synchronous = NORMAL`。
- 新增单测：两个 `SearchSourceStats` 实例写同一 SQLite 文件不抛错。

## 结果

- 并发冒烟：同时跑 `STM32F103C8T6 立创商城 数据手册` 与 `STM32F103C8T6 芯查查 数据手册` 两条 `npm run dev`，均正常返回 evidence，无 `database is locked`。
- 回归：`npm run build` 通过，`npm run test:all` 260/260 + 17/17 全绿，doc-lint 0 FAIL / 0 WARN。
