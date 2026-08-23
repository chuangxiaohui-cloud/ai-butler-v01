# 推进计划：会话上下文 H5（单实例接线 + 原子写 + 跨进程文件锁）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

处置架构审计 `docs/2026-08-23-architecture-code-audit.md` H5（立即/数据）：同进程双
`SessionContextStore` 实例操作同一会话文件（gateway server 未把实例传给 pipeline deps、
CLI main.ts 同样双实例）+ `persist` 非原子写 → 并发读改写丢整段会话历史。

## 计划

1. `src/memory/session-context.ts`：
   - `persist` 改 temp+rename 原子写（读者只见完整旧/新文件，杜绝读到半截 JSON）。
   - `runExclusive` 内追加跨进程文件锁（`<会话>.json.lock`，`wx` 独占创建 + 陈旧锁
     mtime 超阈值夺锁 + 5s 超时），实例内队列与跨进程锁双保险。
2. `src/gateway/server.ts`：创建唯一 `SessionContextStore`，同时传给
   `createGatewayApp({ sessionContext })` 与 `deps.sessionContext`。
3. `src/main.ts`：把 CLI 的 `sessionContext` 传入 pipeline deps（与 slash 共用同一实例）。
4. 测试：跨实例并发 append 不丢更新（H5 回归）、原子写无残留 tmp、陈旧锁可夺锁恢复。
5. 验证：`npm run build` → 相关单测 → `npm run test:all` → `npm exec tsx scripts/doc-lint.ts`。
6. 文档：本计划补结果；交接文档登记。

**验收标准**

- 同目录两个 store 实例并发各 append 5 轮 → 最终 10 轮无丢失（无锁前会丢）。
- append/compact 后目录内无 `.tmp` 残留；`c1.json` 始终完整可解析。
- 崩溃残留的陈旧锁文件可被自动夺锁，会话继续可写。
- gateway/CLI 各自进程内 slash 与 pipeline 使用同一实例。

## 执行过程

### 改动

- `src/memory/session-context.ts`：`persist` 改 temp+rename 原子写（tmp 文件名含 pid+uuid）；
  `runExclusive` 内追加 `withFileLock`（`<会话>.json.lock` 用 `openSync('wx')` 独占创建、
  写 pid+ts、mtime 超 10s 判定陈旧锁并夺锁、5s 等待超时）；实例内队列 + 跨进程锁双保险。
- `src/gateway/server.ts`：创建唯一 `SessionContextStore`，同时传给
  `createGatewayApp({ sessionContext })` 与 `deps.sessionContext`。
- `src/main.ts`：pipeline deps 传入 CLI 的 `sessionContext`（与 slash 共用同一实例）。
- 测试：跨实例并发各 append 5 轮 → 10 轮无丢失（H5 回归）；原子写后目录仅剩
  `c1.json` 无 tmp/锁残留；陈旧锁（mtime 60s 前）可夺锁恢复且操作后锁被移除。

### 遇到的问题

- 初始补丁因 `COMPACT_MAX_TOKENS`/`COMPACT_TIMEOUT_MS` 为 `export const` 匹配失败，
  按实际常量声明重打。
- 陈旧锁夺锁与锁释放存在竞态：锁文件刚被释放时 `statSync` 抛错 → `continue` 重试即可，
  不视为错误。

## 结果

- 验证：`npm run build` 通过；`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN；
  `npm run test:all` 单测 615/616（1 skip）+ 集成 17/17。
- 测试：session-context 17/17（含 3 条 H5 新增）；gateway/pipeline/slash 67/67。
- 提交：待提交（并入架构审计后续批，无 E-NN——不涉及 §5/§6 变更）
- 遗留事项：
  - 跨进程锁的「双活写者」语义由锁文件保证；极端场景（锁持有进程卡死 >10s）会被
    夺锁，属可接受的单机桌面权衡。
  - 审计 H5 之外仍存在同主题 P14（摘要只追加不合并/compactIfNeeded 失败静默吞掉），
    归入中期性能批。
