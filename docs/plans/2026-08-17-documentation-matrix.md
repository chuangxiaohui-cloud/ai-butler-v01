# 推进计划：文档资产矩阵整理与补齐

> 日期：2026-08-17 · 分支：v0.2b · 状态：已完成

## 目标

按“架构层 / 设计层 / 工程层 / 交付期”四组整理全仓文档，把已有材料与新补文档串成
一份可维护的文档资产总账，并补齐开发期缺失文档。

## 计划

1. 盘点现有 docs 与用户矩阵逐项对照，区分已有 / 需重做 / 缺失 / 交付期生成。
2. 新建 `docs/documentation-map.md` 与 `docs/code-directory.md`。
3. 补齐架构层五份：系统架构、模块数据流、依赖关系、接口契约、部署架构。
4. 补齐设计层七份：搜索管道、意图路由、记忆系统、安全模型、UI 交互、Skill 注册表、PARAM 规范。
5. 补齐工程层四份：API、数据库 Schema、环境配置、测试策略。
6. 更新 AGENTS / README / 交接 / directory-structure，接入总账与代码目录。
7. 验证链接与 doc-lint。

**验收标准**

- 文档资产总账覆盖用户给出的全部条目，交付期文档标记为“收口时生成”。
- 所有开发期文档有真实文件，内容与当前代码一致。
- AGENTS 与 README 能从入口链直达总账、代码目录、架构与设计文档。
- `doc-lint` 保持 0 FAIL 0 WARN。

## 执行过程

### 改动

- 新建 `docs/documentation-map.md`：四组文档状态总账。
- 新建 `docs/code-directory.md`：按模块分类的代码目录职责表。
- 新建 `docs/architecture/{system-architecture,module-dataflow,module-dependencies,interface-contract,deployment}.md`。
- 新建 `docs/design/{search-pipeline,intent-routing,memory-system,security-model,ui-interaction,skill-registry,param-registry}.md`。
- 新建 `docs/engineering/{api,database-schema,environment-config,testing-strategy}.md`。
- 更新 `AGENTS.md`、`README.md`、`docs/directory-structure.md`、`docs/2026-08-17-progress-handoff.md`。

### 遇到的问题

- 交付期报告（安全审计、性能报告、成熟度等）需要实测数据，本次只登记生成时机与证据来源，
  不预置结论，避免伪证据。

## 结果

- 验证：`doc-lint` 0 FAIL 0 WARN；`rg` 抽查引用路径存在。
- 测试：文档补全，无代码改动，不新增测试。
- 提交：未提交，等待用户确认后统一处理。
- 遗留事项：OpenAPI/Swagger 正式文件、安全 TDD 全量用例、交付期报告在版本收口时生成。
