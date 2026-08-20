# 推进计划：回滚按会话收紧（E140）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

让 `撤销/回滚` 只作用于同一会话（conversationId）内最近一次 Agent 写入，
避免同一 userId 下跨场景误删。B 套按场景传入独立 conversationId。

## 计划

1. `OperationRecord` 增加 `conversationId`。
2. `latestWriteOperation` / `rollbackLatest` 支持按 conversationId 过滤。
3. pipeline 增加 `conversationId` 选项，project-writer 写入时记录。
4. gateway `/api/ask` 透传可选 `conversationId`。
5. `bench-devil-b` 每个场景传独立 conversationId。
6. 补单测与交接记录。

**验收标准**

- 同 conversationId 下写入后可回滚。
- 不同 conversationId 下 `撤销` 返回“没有找到最近由我执行的写入操作”。
- B 套 C07 不再误删 C01 写入的文件。

## 执行过程

### 改动

- `src/security/operation-log.ts`、`src/search/pipeline.ts`、`src/skills/project-writer/index.ts`、
  `src/gateway/app.ts`、`scripts/bench-devil-b.ts`、测试。

### 遇到的问题

- 原 pipeline 若 conversationId 缺省时会用 userId 兜底过滤，导致无会话记录不匹配；
  改为缺省时不按会话过滤，保留原有“用户最近一次写入”语义。

## 结果

- `npm run bench:devil-b` 重跑：C07 正式轮返回
  “没有找到最近由我执行的写入操作记录”，不再误删 C01 文件。
- 原人工分 28 轮、平均 2.25 保留。
- `npm run test:all` 单测 422/422 + 集成 17/17 全绿；`doc-lint` 通过。
