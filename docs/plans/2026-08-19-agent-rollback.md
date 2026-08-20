# 推进计划：Agent 事务回滚（E135）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

给 C07 补真正的 Agent 层回滚：`project-writer` 每次写入/覆盖文件时记录操作日志；
用户说“撤销/回滚刚才的操作”时，恢复最近一次备份，或删除刚新建的文件；
没有可回滚记录时诚实说明并给出常规撤销建议，不再只甩 Ctrl+Z。

## 计划

1. 新增 `src/security/operation-log.ts`：append/latest/restore/delete 最近写入操作。
2. `project-writer` 写入成功后登记操作日志（含 userId、路径、备份、是否新建）。
3. pipeline 增加“撤销/回滚”提前分支，调 `rollbackLatest`，无记录时诚实回复。
4. 补单测：日志往返、备份恢复、新建文件删除、无记录诚实回复。
5. 登记 E135，更新计划结果与当天交接。

**验收标准**

- 覆盖已有文件后“撤销刚才的操作”能恢复备份内容。
- 新建文件后“撤销”能删除该文件。
- 无最近操作时回复“没有找到最近由我执行的写入操作”，不编造回滚结果。
- 主项目 build、单测全绿、doc-lint 通过。

## 执行过程

### 改动

- `src/security/operation-log.ts` + 测试。
- `src/skills/project-writer/index.ts`、`src/search/pipeline.ts`。

### 遇到的问题

- 真实 CLI 直接写 `写入 <路径>` 不会进 project-writer（路由要求“按你说的/工程”），
  E2E 改用 C01 同款“按你说的写入”验证；后续可补“写入路径”独立路由。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 400/400 + 集成 17/17 全绿。
- CLI E2E：`按你说的写入 sandbox/.../main.c` 后 `撤销刚才的操作` 返回
  “已回滚：删除新建文件”，文件确认不存在。
- 提交：未提交（延续工作区待统一确认批次）。
- 遗留事项：独立“写入 <路径>”路由仍待补；B 套 C07 需重跑验证新行为。
