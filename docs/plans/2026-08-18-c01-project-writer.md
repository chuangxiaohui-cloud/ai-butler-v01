# 推进计划：C01 工程落地执行链（project-writer）

> 日期：2026-08-18 · 分支：v0.2b · 状态：已完成

## 目标

把 C01 从“结构化澄清”升级为真实文件写入：用户给出工程路径与内容后，在沙箱白名单内
写入/覆盖文件，覆盖前自动备份。

## 计划

1. 新增 `src/skills/project-writer/`：解析路径/内容、沙箱校验、备份、写入。
2. 注册为第 20 个 Skill，路由 `R_APPLY_TO_PROJECT` 指向 `project_writer`。
3. pipeline 本地 Skill 使用原始 query，保留 Windows 路径。
4. 更新 Skill 清单、测试计数、E130 记录。

**验收标准**

- 缺路径/缺内容时返回结构化澄清。
- 沙箱外路径拒绝写入。
- 覆盖已有文件前生成备份。
- CLI 真跑能在 `sandbox/` 内写入文件并保留备份。

## 执行过程

### 改动

- 新增 `src/skills/project-writer/index.ts` 与测试。
- `src/skills/registry.ts`、`src/agent/executors.ts`、`src/agent/routing-table.ts` 接入。
- `src/search/pipeline.ts` 对 `project-writer` 使用原始 query。

## 结果

- 单测 project-writer 4 条新增；全量单测 376/376 + 集成 17/17 全绿。
- CLI 真跑：`sandbox/c01-real-*/main.c` 从 `old` 覆盖为 `int main(void){return 0;}`
  且生成 `data/writer-backups/main.c-*.bak`。
- 全量门禁与 doc-lint 待最终验证。
