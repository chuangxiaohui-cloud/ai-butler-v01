# 文档资产总账

> 用途：按“开发前架构层 / 设计层 / 工程层 / 交付期审核与交付物”四组维护全仓文档清单。
> 状态约定：`✅ 已有` / `🔨 需重做` / `📋 缺失待补` / `⏳ 交付期生成`。
> 权威关系：需求正文唯一权威是 `一人公司AI-Agent需求文档_v2.5.md`；架构决策记入
> `docs/adrs/`；代码导航以 `docs/code-directory.md` 为准。

## 一、架构层

| # | 文档 | 当前状态 | 现状来源 | 动作 |
|---|------|---------|---------|------|
| 1 | 系统整体架构图 | ✅ 已有 | `docs/architecture/system-architecture.md` | 随架构演进维护 |
| 2 | 模块数据流图 | ✅ 已有 | `docs/architecture/module-dataflow.md` | 随 Stage 变更维护 |
| 3 | 模块依赖关系图 | ✅ 已有 | `docs/architecture/module-dependencies.md` | 随 import 边界维护 |
| 4 | 接口契约文档 | ✅ 已有 | `docs/architecture/interface-contract.md` | 接口变更时同步 |
| 5 | 部署架构图 | ✅ 已有 | `docs/architecture/deployment.md` | 打包与端口变化时同步 |

## 二、设计层

| # | 文档 | 当前状态 | 现状来源 | 动作 |
|---|------|---------|---------|------|
| 6 | 搜索管道详细设计 | ✅ 已有 | `docs/design/search-pipeline.md` | 随 §6 变更同步 |
| 7 | 意图路由设计 | ✅ 已有 | `docs/design/intent-routing.md` | 随规则表变更同步 |
| 8 | 记忆系统设计 | ✅ 已有 | `docs/design/memory-system.md` | 随记忆实现同步 |
| 9 | 安全模型设计 | ✅ 已有 | `docs/design/security-model.md` | 安全规则变化时同步 |
| 10 | UI 交互设计稿 | ✅ 已有 | `docs/design/ui-interaction.md` | 随 UI 版本同步 |
| 11 | Skill 注册表设计 | ✅ 已有 | `docs/design/skill-registry.md` | 新增 Skill 时同步 |
| 12 | PARAM 注册表维护规范 | ✅ 已有 | `docs/design/param-registry.md` | 参数变更时同步 |

## 三、工程层

| # | 文档 | 当前状态 | 现状来源 | 动作 |
|---|------|---------|---------|------|
| 13 | API 接口文档 | ✅ 已有 | `docs/engineering/api.md` | 端点变化时同步；正式 OpenAPI 待生成 |
| 14 | 数据库 Schema 文档 | ✅ 已有 | `docs/engineering/database-schema.md` | schema 变化时同步 |
| 15 | 环境变量与配置清单 | ✅ 已有 | `docs/engineering/environment-config.md` | 环境变量变化时同步 |
| 16 | 开发日志 / 计划文档 | ✅ 已有 | `docs/plans/` 与 `docs/plans/README.md` | 继续按现流程维护 |
| 17 | CHANGELOG（附录 A） | ✅ 已有 | 需求文档附录 A（E 编号 + bench 联动） | 继续按文档宪法维护 |
| 18 | 测试策略文档 | ✅ 已有 | `docs/engineering/testing-strategy.md` | 测试门禁变化时同步 |

## 四、交付期审核与交付物

以下文档在版本收口或第三方审核前生成，不预置结论。生成时以本表“证据来源”为准。

| # | 文档 | 生成时机 | 证据来源 |
|---|------|---------|---------|
| 1 | 安全审计报告 | v1.0 收口 | `src/security/sandbox.test.ts`、`src/gateway/terminal.test.ts`、需求 §10.4 用例清单 |
| 2 | 隐私与数据处理说明 | v1.0 收口 | `.env.example`、`data/` 目录约定、需求 §8.1.4/§10.3 |
| 3 | 测试报告（全量） | 每次发布 | `npm run test:all`、`bench/devil-v25/*`、31 条 v0.2a 基准 |
| 4 | 性能基准报告 | 每次发布 | `data/search-metrics.jsonl`、`bench/*`、需求 §5 [P-NN] |
| 5 | 接口契约符合性报告 | 每次发布 | `docs/architecture/interface-contract.md` + 集成测试 |
| 6 | PARAM 注册表快照 | 每次发布 | 需求 §5 + `src/config/params.ts` + `bench` 关联 |
| 7 | 架构设计说明书（终版） | v1.0 收口 | `docs/architecture/*` + ADR 整合 |
| 8 | 代码目录与模块职责表（终版） | 持续更新 | `docs/code-directory.md` |
| 9 | 部署与运维手册 | 安装包发布 | `desktop/README.md`、`docs/architecture/deployment.md` |
| 10 | 用户操作手册 | v1.0 收口 | `ui/prototype/README.md`、需求 §4.1/§9 |
| 11 | 数据迁移与备份指南 | 版本升级前 | `scripts/migrate-to-memorycore.ts`、需求 §11.2 |
| 12 | 依赖清单与许可证 | 发布前 | `package-lock.json`、`desktop/package-lock.json`、`ui/prototype/package-lock.json` |
| 13 | 已知限制与技术债务清单 | 持续更新 | `docs/plans/` 遗留事项、provisional PARAM、E-NN 偏离登记 |
| 14 | 成熟度评估报告 | v1.0 收口 | 需求 §12.4 五维指标 |
| 15 | 文档治理合规报告 | 每次发布 | `npm exec tsx scripts/doc-lint.ts` 结果 |
| 16 | 架构代码审计报告（2026-08-23 第三方输入） | 已归档 | `docs/2026-08-23-architecture-code-audit.md`（处置批次：H1-H10 `docs/plans/2026-08-23-security-audit-batch.md`、H5 `docs/plans/2026-08-23-session-context-h5.md`、H9/B1/B4/H8 `docs/plans/2026-08-23-audit-correctness-batch.md`、H6/D1-D5 `docs/plans/2026-08-23-audit-decision-batch.md`、H7+P4 `docs/plans/2026-08-23-audit-mid-batch-1.md`、P3+P5 `docs/plans/2026-08-23-audit-mid-batch-2.md`、P6+P8 `docs/plans/2026-08-23-audit-mid-batch-3.md`、P7+P11 `docs/plans/2026-08-23-audit-mid-batch-4.md`、P9+P15 `docs/plans/2026-08-23-audit-mid-batch-5.md`、P12+P16 `docs/plans/2026-08-23-audit-mid-batch-6.md`、P13+P14 `docs/plans/2026-08-23-audit-mid-batch-7.md`） |

## 维护规则

1. 新增或重做文档时，先更新本总账，再落文件。
2. 文档与代码冲突时，以代码为当前事实、需求正文为规格权威；冲突要登记到 ADR 或 E-NN。
3. 架构与设计文档是“活文档”，随实现演进；交付期报告只记录版本快照，不互相覆盖。
4. 所有文档路径与职责以 `docs/code-directory.md` 为准，本表不再重复文件清单。
5. 第三方审核先用 `docs/audit-navigation.md`，按逻辑分层直达真实代码与文档。
