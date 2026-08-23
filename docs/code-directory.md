# 代码目录与模块职责表

> 开发导航的唯一权威目录索引；详细接口契约见 `docs/architecture/interface-contract.md`。
> 第三方审核导航：`docs/audit-navigation.md`（逻辑分层 → 真实路径映射）。
> 状态：✅ 已实现 / 🔨 开发中 / 📋 待建 / ❄️ 冻结。
> 测试约定：源码同目录 `*.test.ts` 为单测，`tests/integration/**/*.test.ts` 为集成测试，不再逐行重复。

## 0. 项目根目录

| 路径 | 职责 | 状态 |
|------|------|------|
| `AGENTS.md` | AI Agent 开发入口与运行时约束 | ✅ |
| `README.md` | 人类开发入口与命令速查 | ✅ |
| `package.json` | 根包：CLI、gateway、测试、基准、脚本入口 | ✅ |
| `tsconfig.json` | TypeScript ESM + NodeNext 编译配置 | ✅ |
| `.env.example` | 环境变量模板 | ✅ |
| `.gitignore` | 忽略运行时数据、构建产物、桌面产物 | ✅ |
| `一人公司AI-Agent需求文档_v2.5.md` | 需求与文档宪法唯一权威 | ❄️ |
| `v0.2b_MVP_实施规划.md` | v0.2b 实施规划与验收记录 | ❄️ |

## 1. src 核心域与适配层

| 模块 | 关键文件 | 职责 | 状态 |
|------|---------|------|------|
| `src/main.ts` | CLI 入口 | 组装依赖并调用 `pipeline`，stdout 输出结构化 JSON | ✅ |
| `src/search/` | `pipeline.ts`、`stages/`、`search-loop.ts` | Stage 1-6 唯一问答管道 | ✅ |
| `src/search/` | `second-pass.ts`、`second-pass-fetch.ts` | 低置信二次取证选目标 + 并发抓取（[P-117] 预算 / [P-118] PDF 上限，P1/P2） | ✅ |
| `src/search/` | `deep-report.ts` | 深度报告分阶段生成（v1.0 S1，§4.3.2，[P-13] 预算，E220） | ✅ |
| `src/search/` | `deep-report-store.ts` | 深度报告任务状态存储（取消恢复，JSONL 落盘，v1.0 S2，§4.3.2，E221） | ✅ |
| `src/mcp/` | `types.ts`、`registry.ts`、`client.ts`、`dispatcher.ts`、`safety.ts` | MCP 子 Agent：注册表/stdio 客户端/调度器（重试·退避·降级）/工具白名单与 untrusted 域（v1.0 S3，§4.1.2 + §10 + §11.1，E222） | ✅ |
| `src/security/` | `command-whitelist.ts`、`query-sanitize.ts` | 命令白名单（允许集合+硬编码拒绝+超时 kind）与搜索脱敏（路径/密钥/内网剥离，v1.0 S4，§10.2/§10.3，E223） | ✅ |
| `src/im/` | `gate.ts`、`session.ts`、`format.ts`、`service.ts` | 远程对话通道骨架（授权开关/会话隔离/输出适配/复用 pipeline，v1.0 S5，§4.5，E224） | ✅ |
| `src/search/stages/` | `s1_prepare.ts`、`s2_classify.ts`、`s3_search.ts`、`s5_synthesize.ts`、`s6_post.ts` | 六阶段独立实现 | ✅ |
| `src/search/providers/` | `types.ts`、`bocha.ts`、`anysearch.ts`、`tavily.ts` | 搜索适配器，统一 `SearchProvider` | ✅ |
| `src/search/` | `fusion.ts`、`rule1.ts`、`rule3.ts`、`authority.ts` | 融合、事实一致性、安全阀、权威度 | ✅ |
| `src/search/` | `llm.ts`、`llm-client.ts`、`llm-registry.ts`、`model-router.ts` | LLM 客户端、Provider Registry、模型分档 | ✅ |
| src/search/ | alance.ts | Bocha 余额探测/缓存/告警（§D.3，E192） | ✅ |
| src/search/ | quota.ts | 搜索配额计数与月度快照（[P-63]/[P-64]/[P-65]，E195） | ✅ |
| src/search/ | 	avily-trigger.ts | Tavily 条件并联触发判定（§6.2.1，E72/E195） | ✅ |
| `src/agent/` | `router-v2.ts`、`routing-table.ts`、`intent-feature.ts`、`extract.ts`、`rewrite-with-memory.ts`、`memory-instruction.ts`、`time-expression.ts` | 三层意图路由、rewrite/记住指令、时间表达解析 | ✅ |
| `src/agent/` | `mode-mapper.ts`、`multimodal-preprocessor.ts`、`executors.ts` | 模式映射、多模态信号、执行器状态 | ✅ |
| `src/agent/` | `route-case-store.ts`、`route-case-audit.ts`、`confidence-calibration.ts` | 路由 case 采集、审核、校准闭环（JSONL 追加/轮转 P13） | ✅ |
| `src/skills/` | `registry.ts`、`lifecycle.ts`、`deps.ts`、`install.ts` | Skill 注册、生命周期、依赖注入、安装 | ✅ |
| `src/skills/*/` | 23 个 Skill 目录 | 预置能力 | ✅ |
| `src/memory/` | `store.ts`、`memorycore-store.ts`、`schema.sql` | MemoryStore 双实现与冻结 schema | ✅ |
| `src/memory/` | `experience.ts`、`distill.ts`、`confidence-decay.ts` | 经验、蒸馏、衰减 | ✅ |
| `src/memory/` | `user-context-store.ts`、`user-context.ts` | 用户画像、长期事实、会话摘要 | ✅ |
| `src/memory/` | `session-context.ts` | 会话上下文持久化与逐字窗口压缩（§8.3，E193） | ✅ |
| `src/slash/` | `slash-commands.ts` | 斜杠命令层：`/compact` 手动压缩 + `/context` 会话状态（§8.3，E204） | ✅ |
| `src/reminder/` | `reminder-store.ts` | 主动提醒 SQLite 存储与到期轮询 | ✅ |
| `src/gateway/` | `app.ts`、`server.ts` | 单一 TurnLoop Express gateway | ✅ |
| `src/gateway/` | `rate-limit.ts` | 限速桶（P16 [P-114]）+ 并发闸门（[P-115]） | ✅ |
| `src/gateway/` | `attachments.ts`、`terminal.ts`、`files.ts`、`artifact-bus.ts` | 附件、终端、文件、SSE 事件 | ✅ |
| `src/browser/` | `session.ts` | 浏览器会话、CDP 持久化、页面抓取 | ✅ |
| `src/config/` | `params.ts`、`env.ts` | PARAM 登记与环境解析 | ✅ |
| `src/config/` | `model-catalog.ts`、`provider-order.ts` | 模型目录与 provider 顺序 | ✅ |
| `src/config/` | `security-config.ts`、`skills-config.ts`、`usage-budget.ts` | 安全、Skill、Token 预算持久化 | ✅ |
| `src/trajectory/` | `trajectory-log.ts` | append-only 轨迹日志 | ✅ |
| `src/log/` | `jsonl.ts` | JSONL 追加/轮转（.1 归档）/缓存读（P15） | ✅ |
| `src/usage/` | `usage-store.ts` | Token 计量与聚合 | ✅ |
| `src/security/` | `sandbox.ts`、`operation-log.ts`、`url-safety.ts` | 文件沙箱白名单、审计、Agent 操作日志与回滚、浏览器抓取 URL 安全（S1） | ✅ |
| `src/postprocess/` | `cultural-reply.ts` | 文化梗回复后处理 | ✅ |
| `src/wiki/` | `index.ts` | 冷启动知识种子 | ✅ |

## 2. 运行通道与 UI

| 路径 | 职责 | 状态 |
|------|------|------|
| `ui/prototype/` | 独立 Vite + React 三栏 UI 原型 | ✅ |
| `ui/prototype/src/App.tsx` | 三栏、设置、产物栏、终端、证据链交互 | ✅ |
| `ui/prototype/src/styles.css` | 深色工作台样式 | ✅ |
| `desktop/main.mjs` | Electron 主进程：拉起 gateway、加载 UI、回收子进程 | ✅ |
| `desktop/package.json` | electron-builder 打包配置 | ✅ |
| `desktop/scripts/prepare-resources.mjs` | 打包 gateway 资源 | ✅ |
| `desktop/src-tauri/` | Tauri 备选壳 | 🔨 |

## 3. 工具与测试

| 路径 | 职责 | 状态 |
|------|------|------|
| `scripts/doc-lint.ts` | 文档宪法七检查 | ✅ |
| `scripts/bench-*.ts` | v0.1 / v0.2a / devil-v25 / provider-router 基准 | ✅ |
| `scripts/gen-devil-*` | 魔鬼训练评分、清单、证据、CSV 导出 | ✅ |
| `scripts/export-devil-baseline.ts` / `compare-devil-baseline.ts` | 新老基线导出与对比 | ✅ |
| `scripts/route-*.ts` | 路由 case、校准、审核、应用规则 | ✅ |
| `scripts/browser-*.ts` | 浏览器会话与抓取 | ✅ |
| `scripts/pdf-text.ts` / `ocr_benchmark.py` | PDF 文本层与 OCR 基准 | ✅ |
| `scripts/office_xlsx_read.py` / `office_xls_read.py` / `office_doc_*.py` / `office_docx_*.py` / `office_pptx_create.py` / `office_pdf_merge.py` / `office_pdf_encrypt.py` / `office_pdf_compress.py` / `office_image_convert.py` / `compress_image.py` | 办公日常文件处理 | ✅ |
| `scripts/office_image_ocr.py` | 图片/PDF 表格 OCR（E168-E201：TSR 结构、跨页拼接、页脚过滤、三通道文本融合、编号模式纠正、词典纠正；`--selftest`/`--dict`/`--table`/`--batch`） | ✅ |
| scripts/datasheet.ts | 官方 datasheet 下载与校验 | ✅ |
| scripts/tavily-smoke.ts | Tavily 触发冒烟 + 配额监控（E195） | ✅ |
| `scripts/migrate-to-memorycore.ts` | 历史记忆迁移 | ✅ |
| `scripts/distill-worker.ts` | L1 蒸馏 worker | ✅ |
| `scripts/push-to-hosts.ts` | Gitee/GitHub 双端同步 | ✅ |
| `tests/integration/` | 跨模块集成测试（当前 17 条） | ✅ |

## 4. 数据、配置与文档

| 路径 | 职责 | 状态 |
|------|------|------|
| `configs/tdai-gateway.local.yaml` | MemoryCore sidecar 本地配置 | ✅ |
| `data/` | SQLite、JSONL、浏览器缓存（git 忽略） | ✅ |
| `bench/` | 基准数据与报告（git 跟踪） | ✅ |
| `docs/adrs/` | 架构决策记录 | ✅ |
| `docs/documentation-map.md` | 文档资产总账 | ✅ |
| `docs/audit-navigation.md` | 第三方审核导航（逻辑目录 → 真实路径） | ✅ |
| `docs/code-directory.md` | 本文档 | ✅ |
| `docs/architecture/` | 架构图、数据流、依赖、接口契约、部署 | ✅ |
| `docs/design/` | 搜索、路由、记忆、安全、UI、Skill、PARAM 设计 | ✅ |
| `docs/engineering/` | API、Schema、环境配置、测试策略 | ✅ |
| `docs/plans/` | 每次推进的计划与结果 | ✅ |
| `docs/2026-08-XX-progress-handoff.md` | 每日交接 | ✅ |

## 5. 更新纪律

- 新增或移动源码文件时，同步更新本表并保持状态标记准确。
- 新增目录先补本表，再进 `docs/directory-structure.md` 与 AGENTS.md 目录地图。
- 已冻结文件（需求文档、schema v1）不得在本表里“重新设计”，只能登记偏离（E-NN）。
- 测试文件不逐行列出，但新增行为必须带同名单测或集成测试。
