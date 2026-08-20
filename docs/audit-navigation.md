# 第三方审核导航

> 用途：把“逻辑分层视图”映射到真实代码路径，供第三方审核快速定位。
> 原则：现有代码物理目录不做大规模改名；本表是审核导航，不是重构方案。

## 1. 建议目录 → 真实路径总表

| 建议逻辑模块 | 建议目录 | 真实路径 | 真实关键文件 | 状态 |
|--------------|---------|---------|--------------|------|
| Gateway | `src/gateway/routes/*` | `src/gateway/` | `app.ts`（所有 REST 路由）、`server.ts`、`attachments.ts`、`terminal.ts`、`files.ts`、`artifact-bus.ts` | ✅ 已有，未按 routes/middleware/types 拆分 |
| Pipeline | `src/pipeline/` | `src/search/` | `pipeline.ts`、`stages/s1-s6`、`search-loop.ts`、`fusion.ts`、`rule1.ts`、`rule3.ts`、`authority.ts` | ✅ 已有 |
| Router | `src/router/` | `src/agent/` | `router-v2.ts`、`routing-table.ts`、`intent-feature.ts`、`extract.ts`、`clarify-templates.ts`、`route-case-store.ts` | ✅ 已有 |
| Memory | `src/memory/` | `src/memory/` | `store.ts`、`memorycore-store.ts`、`experience.ts`、`distill.ts`、`user-context-store.ts`、`schema.sql` | ✅ 部分：无 migrations/ 目录 |
| Search Providers | `src/search-providers/` | `src/search/providers/` | `types.ts`、`bocha.ts`、`anysearch.ts`、`tavily.ts` | ✅ 已有 |
| 搜索调度与池 | `search-providers/pool/` | `src/search/` | `search-loop.ts`、`heartbeat.ts`、`quota.ts`、`cache.ts`、`tavily-trigger.ts` | ✅ 已有，未拆 pool/ |
| LLM | `src/llm/` | `src/search/` | `llm.ts`、`llm-client.ts`、`llm-registry.ts`、`model-router.ts`、`model-id.ts` | ✅ 已有 |
| Security | `src/security/` | `src/security/` + `src/gateway/` + `src/config/` | `sandbox.ts`、`terminal.ts`、`security-config.ts` | 🔨 部分：command/trust/privacy 子目录待建 |
| Skill Registry | `src/skill-registry/` | `src/skills/` | `registry.ts`、`lifecycle.ts`、`deps.ts`、`install.ts`、`skills/*` | ✅ 已有 |
| Browser | `src/browser/` | `src/browser/` | `session.ts` | ✅ 已有，单文件实现 |
| PARAM Registry | `src/param-registry/` | `src/config/` | `params.ts` + `tests/integration/params-registry.test.ts` | ✅ 已有，未拆 registry/constraints/status-machine |
| UI | `src/ui/` | `ui/prototype/src/` | `App.tsx`、`main.tsx`、`styles.css` | 🔨 已有，React 组件未拆成 layouts/panels/modes |
| Tauri | `src-tauri/` | `desktop/src-tauri/` | `src/main.rs`、`Cargo.toml`、`tauri.conf.json` | 🔨 备选壳 |
| memory-core | `memory-core/` | 外部只读项目 `TencentDB-Agent-Memory/` | 仓库内只有 `configs/tdai-gateway.local.yaml` 与 `src/memory/memorycore-store.ts` 客户端 | 🔨 外部依赖 |

## 2. 文档建议 → 真实路径

| 建议文档 | 真实位置 |
|----------|---------|
| `architecture/system-overview.md` | `docs/architecture/system-architecture.md` |
| `architecture/module-dataflow.md` | `docs/architecture/module-dataflow.md` |
| `architecture/module-dependency.md` | `docs/architecture/module-dependencies.md` |
| `architecture/deployment-topology.md` | `docs/architecture/deployment.md` |
| `architecture/interface-contract.md` | `docs/architecture/interface-contract.md` |
| `design/search-pipeline.md` | `docs/design/search-pipeline.md` |
| `design/intent-router.md` | `docs/design/intent-routing.md` |
| `design/memory-system.md` | `docs/design/memory-system.md` |
| `design/security-model.md` | `docs/design/security-model.md` |
| `design/ui-interaction.md` | `docs/design/ui-interaction.md` |
| `design/skill-registry.md` | `docs/design/skill-registry.md` |
| `design/param-registry.md` | `docs/design/param-registry.md` |
| `api/openapi.yaml` | 待生成；当前 `docs/engineering/api.md` |
| `api/db-schema.md` | `docs/engineering/database-schema.md` |
| `ops/deploy-guide.md` | 交付期；当前 `desktop/README.md` + `docs/architecture/deployment.md` |
| `ops/user-manual.md` | 交付期；当前 `ui/prototype/README.md` + `docs/design/ui-interaction.md` |
| `ops/backup-recovery.md` | 交付期；迁移脚本见 `scripts/migrate-to-memorycore.ts` |
| `ops/env-reference.md` | `docs/engineering/environment-config.md` |
| `audit/*` | 交付期生成，见 `docs/documentation-map.md` |
| `plans/E78-*.md` | `docs/plans/YYYY-MM-DD-<主题>.md` |
| `bench/*` | 根目录 `bench/`，不是 `docs/bench/` |
| `CHANGELOG.md` | 需求文档附录 A |

## 3. 测试建议 → 真实路径

| 建议 | 真实位置 |
|------|---------|
| `tests/unit/pipeline` 等 | 源码同目录 `src/**/*.test.ts` |
| `tests/integration/` | `tests/integration/**/*.test.ts` |
| `tests/e2e/` | 当前无独立 E2E；桌面冒烟用 `npm run desktop:smoke` |
| `tests/bench/122-eval.ts` | `scripts/bench-devil-v25.ts` 等 |
| `tests/fixtures` / `helpers` | `tests/integration/fixtures/` |

## 4. 审核快速入口

| 审核目的 | 先看 | 再深入 |
|----------|------|--------|
| 总体架构 | `docs/architecture/system-architecture.md` | `docs/adrs/0001-architecture-foundation.md` |
| 问答链路 | `docs/architecture/module-dataflow.md` | `src/search/pipeline.ts` |
| 接口一致性 | `docs/architecture/interface-contract.md` | `src/gateway/app.ts` + `src/search/pipeline.ts` |
| 搜索质量 | `docs/design/search-pipeline.md` | `src/search/fusion.ts`、`src/search/search-loop.ts` |
| 意图路由 | `docs/design/intent-routing.md` | `src/agent/router-v2.ts`、`src/agent/routing-table.ts` |
| 记忆 | `docs/design/memory-system.md` | `src/memory/*`、`configs/tdai-gateway.local.yaml` |
| 安全 | `docs/design/security-model.md` | `src/security/sandbox.ts`、`src/gateway/terminal.ts` |
| UI | `docs/design/ui-interaction.md` | `ui/prototype/src/App.tsx` |
| Skill | `docs/design/skill-registry.md` | `src/skills/registry.ts` |
| 参数 | `docs/design/param-registry.md` | `src/config/params.ts` + 需求 §5 |
| 数据库 | `docs/engineering/database-schema.md` | `src/memory/schema.sql` |
| 测试 | `docs/engineering/testing-strategy.md` | `tests/integration/` |

## 5. 统计摘要（实际，2026-08-17）

| 范围 | 文件数 |
|------|--------|
| `src/` 非测试 TS | 99 |
| `src/` 单测 TS | 68 |
| `tests/integration/` 测试文件 | 8 |
| `ui/prototype/src/` | 3 |
| `desktop/` 源码与配置（不含 node_modules/release/resources/target） | 31 |

## 6. 维护规则

- 新增源码目录时先更新本表，再更新 `docs/code-directory.md`。
- 审核前由 `docs/documentation-map.md` 确认交付期文档是否已生成。
- 不要为了对齐“建议目录”而大规模移动代码；若确实要重构，单独走 ADR 与计划流程。
