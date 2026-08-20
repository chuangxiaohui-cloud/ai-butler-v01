# 推进计划：独立“写入 <路径>”路由（E139）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

让直接指令 `写入 M:\...\main.c，内容：...` / `保存到 / 写到 <路径>` 走
`project-writer`，不再被搜索引擎当成知识问答。

## 计划

1. `apply_to_project` 词表补“写入/保存到/写到 + 盘符路径”。
2. pipeline 在包含本地写路径时用原始 query 路由（保留盘符，避免 Stage 1 脱敏剥掉）。
3. 补路由与 pipeline 单测。
4. 登记 E139，更新计划结果与交接。

**验收标准**

- `routeV2('写入 M:\\projects\\demo\\main.c，内容：...')` 直接路由到 `project_writer`。
- pipeline 真跑能写入沙箱文件。
- 不含写路径的普通问题仍走原路由，不回退。
- 主项目 build、单测全绿、doc-lint 通过。

## 执行过程

### 改动

- `src/agent/intent-feature.ts`、`src/search/pipeline.ts`、测试。

### 遇到的问题

- Stage 1 脱敏会剥掉盘符，所以本地写路径必须用原始 query 路由；普通问题仍用 cleanQuery。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 421/421 + 集成 17/17 全绿；
  `doc-lint` 通过。
- CLI 真跑：`写入 M:\...\main.c，内容：...` 直接写入并返回校验，不再搜索。
- 提交：未提交（延续工作区待统一确认批次）。
