# 推进计划：第三方审核导航映射

> 日期：2026-08-17 · 分支：v0.2b · 状态：已完成

## 目标

按用户建议的“逻辑分层目录”与实际代码物理目录做逐项映射，让第三方审核能按逻辑视图
快速找到真实文件，不移动现有代码。

## 计划

1. 盘点建议目录是否存在，确认真实物理路径。
2. 新建 `docs/audit-navigation.md`：逻辑模块 → 真实路径映射 + 审核快速入口。
3. 更新 `docs/code-directory.md` 与 `docs/documentation-map.md` 引用。
4. 更新交接文档，验证链接与 doc-lint。

**验收标准**

- 每个建议模块都有真实路径或明确标注“不存在/待建”。
- 第三方审核可以从一张表直达代码与文档。
- `doc-lint` 保持 0 FAIL 0 WARN。

## 执行过程

### 改动

- 新建 `docs/audit-navigation.md`。
- 更新 `docs/code-directory.md`：增加审核导航入口。
- 更新 `docs/documentation-map.md`：登记审核导航。
- 更新 `docs/2026-08-17-progress-handoff.md`。

### 遇到的问题

- 用户建议的 `src/pipeline/`、`src/router/`、`src/search-providers/`、`src/llm/`、
  `src/skill-registry/`、`src/param-registry/`、`src/ui/`、`src-tauri/`、`memory-core/`
  均不是真实目录；真实代码分别落在 `src/search/`、`src/agent/`、`src/skills/`、
  `src/config/`、`ui/prototype/`、`desktop/src-tauri/`，memory-core 是外部只读项目。

## 结果

- 验证：相对链接检查通过；`doc-lint` 0 FAIL 0 WARN。
- 测试：纯文档补全，无代码改动。
- 提交：未提交。
- 遗留事项：是否按逻辑目录重构源码，需单独决策；当前先保留物理目录并靠映射导航。
