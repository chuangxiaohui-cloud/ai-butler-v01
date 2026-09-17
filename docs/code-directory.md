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
| `src/mcp/` | `types.ts`、`contract.ts`、`registry.ts`、`client.ts`、`dispatcher.ts`、`safety.ts`、`config.ts`、`health.ts`、`keil.ts`、`keil-server.ts`、`vscode.ts`、`vscode-server.ts`、`stm32-gcc.ts`、`stm32-gcc-server.ts`、`kicad.ts`、`kicad-server.ts`、`ltspice.ts`、`ltspice-server.ts`、`project-profile.ts`、`project-profile-store.ts`、`project-profile-merge.ts`、`domain-workflow.ts`、`workflow-entry.ts`、`workflow-guard.ts`、`hardware-capability.ts`、`device-auth.ts`、`device-auth-cli.ts`、`hardware-gate.ts`、`firmware-digest.ts`、`firmware-digest-cli.ts`、`port-probe.ts`、`hardware-audit.ts`、`hardware-audit-cli.ts`、`hardware-gate-cli.ts`、`flash-driver.ts`、`serial-driver.ts`、`serialport-reader.ts`、`workflow-plan-fingerprint.ts`、`workflow-plan-store.ts`、`kicad-edit.ts`、`acceptance.ts` | MCP 子 Agent 运行契约与工具适配；Keil、VS Code、STM32-GCC、KiCad ERC 与 LTspice 只读链已接入并有真实 stdio 夹具证据（E401-E410）；项目画像支持字段级合并、多平台共存、过期重探测和构建人工审批，受 schema、白名单、沙箱与 [P-154] 约束；E411 flash/串口能力与风险契约；E420/E422/E423 受控 flash 驱动（含 openocd/dfu-util/jlink 固定模板）；E421 受控串口只读驱动；E425 生产侧 serialport 只读注入（optionalDependency）；E426 设备白名单 CLI；E427 硬件审计只读 CLI；E428 固件摘要只读 CLI；E429 硬件门禁预检 CLI；E431 只读并行组；E432 规划入口自动打组；E433 盘点后平台消歧（`platformChoices`）；E434 UI 产物卡可点平台选项；E424 烧录工作流节点（`hardware_flash` 本地执行，批准≠perFlashConfirmed）；E412 工作流计划指纹与持久化恢复；E413/E418 KiCad 有界编辑与 LTspice 固定批仿真；E419 批开关白名单；E414 动作验收入口；不含自由 PCB 编辑、任意自定义仿真参数或串口写 | 🟡 |
| `src/security/` | `command-whitelist.ts`、`query-sanitize.ts` | 命令白名单（允许集合+硬编码拒绝+超时 kind）与搜索脱敏（路径/密钥/内网剥离，v1.0 S4，§10.2/§10.3，E223） | ✅ |
| `src/im/` | `gate.ts`、`session.ts`、`format.ts`、`service.ts`、`channel.ts`、`config.ts`、`run.ts`、`onebot/` | 远程对话通道（授权开关/会话隔离/输出适配/复用 pipeline + ImChannel 抽象 + OneBot 11 真实适配器 + 常驻入口，v1.0 S5，§4.5，E224+E241） | ✅ |
| `src/repo/` | `types.ts`、`repo-whitelist.ts`、`push-audit.ts`、`push-service.ts`、`cli.ts` | 代码托管联动（仓库白名单/预检门禁/commit+push/JSONL 审计，v1.0 S6，§11.4，E225）+ 真实推送 CLI 编排（`cli.ts`：repo:push/repo:whitelist/repo:audit，E244） | ✅ |
| `src/skills/market/` | `types.ts`、`manifest.ts`、`index-client.ts`、`store.ts`、`installer.ts`、`runner.ts`、`nl-router.ts` | Skill 市场远程化（索引/校验/权限门禁/安装记录/生命周期统计，v1.0 S7，§8.2.3，E226）+ 可执行 handler（E243：§10 白名单 + 沙箱 cwd 执行 steps/verify，`npm run skill:market:run`）+ 自然语言触发词直连（E248：nl-router 最长触发词优先，pipeline `marketSkillRunner`）+ 本地安装通道（E250：`installFromLocalDir` + `npm run skill:market:install`）+ Windows .cmd shim 安全执行（E250：`isCmdSafeCommandLine` 守卫）+ 安全输入通道（E251：`input:'query'` → 沙箱 `input.txt`，步骤 `@input` 替换为文件路径，用户文本不进命令行） | ✅ |
| `src/search/stages/` | `s1_prepare.ts`、`s2_classify.ts`、`s3_search.ts`、`s5_synthesize.ts`、`s6_post.ts` | 六阶段独立实现 | ✅ |
| `src/search/providers/` | `types.ts`、`bocha.ts`、`anysearch.ts`、`tavily.ts` | 搜索适配器，统一 `SearchProvider` | ✅ |
| `src/search/` | `fusion.ts`、`rule1.ts`、`rule3.ts`、`authority.ts` | 融合、事实一致性、安全阀、权威度 | ✅ |
| `src/search/` | `llm.ts`、`llm-client.ts`、`llm-registry.ts`、`model-router.ts` | LLM 客户端、Provider Registry、模型分档、可选 heavy 客户端（`createOptionalHeavyClient`，v1.0 S8 路由接线，E227） | ✅ |
| src/search/ | alance.ts | Bocha 余额探测/缓存/告警（§D.3，E192） | ✅ |
| src/search/ | quota.ts | 搜索配额计数与月度快照（[P-63]/[P-64]/[P-65]，E195） | ✅ |
| src/search/ | tavily-usage.ts | Tavily 远端 /usage 用量快照（[P-64] 口径复算，E228） | ✅ |
| src/search/ | 	avily-trigger.ts | Tavily 条件并联触发判定（§6.2.1，E72/E195） | ✅ |
| `src/agent/` | `router-v2.ts`、`routing-table.ts`、`intent-feature.ts`、`extract.ts`、`rewrite-with-memory.ts`、`memory-instruction.ts`、`time-expression.ts` | 三层意图路由、rewrite、显式记住/纠正记忆指令（§8.3.2，E370）、时间表达解析 | ✅ |
| `src/agent/` | `mode-mapper.ts`、`multimodal-preprocessor.ts`、`executors.ts` | 模式映射、多模态信号、执行器状态 | ✅ |
| `src/agent/` | `route-case-store.ts`、`route-case-audit.ts`、`confidence-calibration.ts` | 路由 case 采集、审核、校准闭环（JSONL 追加/轮转 P13） | ✅ |
| `src/skills/` | `registry.ts`、`lifecycle.ts`、`deps.ts`、`install.ts` | Skill 注册、生命周期、依赖注入、安装；回复连续 👎 达 [P-79] 标记复审并由用户恢复（E378/E379） | ✅ |
| `src/skills/*/` | 28 个 Skill 目录（E353 codegraph + E352 archify + E364 layered-arch；project-writer 多文件事务预览、确认与首次裁决执行 E398/E399） | 预置能力 | ✅ |
| `src/maturity/` | `metrics.ts`、`runtime-watchdog.ts` | 成熟度观测（五维指标纯函数 + L0-L3 判定；合并 pipeline 路由标注与回复最新反馈，§9.3/§12.4，E247/E377，`npm run maturity:check`）+ 运行时看门狗（E282，synthesis_timeout 环境噪音告警） | ✅ |
| `src/feedback/` | `feedback-store.ts`、`skill-candidate-store.ts`、`skill-candidate-draft.ts` | 回复反馈、最新值与按用户每日汇总，Skill 复审、重复修订候选归并，以及 accepted 候选的只读草案预览（§9.3，E374-E387） | ✅ |
| `src/memory/` | `store.ts`、`memorycore-store.ts`、`schema.sql` | MemoryStore 双实现与冻结 schema（v1.0 S8：`MEMORY_STORE` 配置切换 sqlite/memorycore，E227） | ✅ |
| `src/memory/` | `experience.ts`、`distill.ts`、`confidence-decay.ts` | 经验、蒸馏、衰减 | ✅ |
| `src/memory/` | `user-context-store.ts`、`user-context.ts`、`software-profile.ts`、`persona-memory.ts`、`time-sensitive-memory.ts` | 用户画像、长期事实、会话摘要；软件职业建议（E365）；人格事实分层、栏位冲突治理、时间敏感事实及已解决生活主题 L2 素材（§8.1.3/§8.3，E369/E371-E373） | ✅ |
| `src/memory/` | `session-context.ts` | 会话上下文持久化、逐字窗口压缩与已解决生活话题退出活跃上下文（§8.3，E193/E373） | ✅ |
| `src/memory/` | `asset-acl.ts` | 三栏固定记忆装备与管理面/pipeline 读取侧 ACL（§8.1.2，E367/E368） | ✅ |
| `src/slash/` | `slash-commands.ts` | 斜杠命令层：`/compact` 手动压缩 + `/context` 会话状态 + `/cost` AI 运营成本报告（§8.3 E204 / §14 E319） | ✅ |
| `src/reminder/` | `reminder-store.ts` | 主动提醒 SQLite 存储与到期轮询 | ✅ |
| `src/mail/` | `credentials.ts`、`smtp.ts`、`imap.ts`、`oauth.ts`、`*.test.ts` | 邮箱通道：凭据多账号容器与认证模型（password/xoauth2，E302）、IMAP 只读收件/读信/搜信/附件（E293-E303）、SMTP 发信、Outlook OAuth2 设备码授权与自动续期（XOAUTH2 收信+发信，E321/E322，`npm run mail:config` / `mail:oauth`） | ✅ |
| `src/budget/` | `budget-store.ts` | 预算账本 SQLite（append-only allocate/spend 事件，余额=拨款-支出，§2.1/§5，E308，`data/budget.db`） | ✅ |
| `src/escalation/` | `decision-log.ts`、`escalation.ts`、`escalation-state.ts`、`confirm-gate.ts` | 困难升级与人类裁决记录（§4.3.1 [P-47]/[P-48]/[P-16] + §2.3 裁决记录与批准/否决回填，E309/E323，`data/decision-log.jsonl` + `data/escalation-state.jsonl`）+ confirm 真阻断（写类执行器清单/批准识别/等待确认文案 + 裁决批准自动恢复执行回执，E324；复述人称切换 E326；挂起文案带风险分级与预估成本 E334）+ 结构化 choice 与 append-only 选择证据（E396） | ✅ |
| `src/gateway/` | `app.ts`、`server.ts` | 单一 TurnLoop Express gateway；普通批准/否决、结构化 choice、project-writer 首次确认及冲突三选一恢复执行（E323/E396/E399/E402） | ✅ |
| `src/gateway/` | `rate-limit.ts` | 限速桶（P16 [P-114]）+ 并发闸门（[P-115]） | ✅ |
| `src/gateway/` | `attachments.ts`、`terminal.ts`、`files.ts`、`artifact-bus.ts`、`project-watcher.ts`、`change-history.ts` | 附件、终端、文件、SSE 事件、projects/ 目录变更监听（E328）、变更记录内存环（E339） | ✅ |
| `src/browser/` | `session.ts`、`dom-observe.ts`、`operations.ts`、`driver.ts` | 浏览器会话、CDP 持久化、页面抓取；浏览器操作（E252 §4.1.5：AX 树观察 [P-126] 有界 + DSL 交互层 [P-124]/[P-125] + 真实 CDP 驱动） | ✅ |
| `src/config/` | `params.ts`、`env.ts` | PARAM 登记与环境解析 | ✅ |
| `src/config/` | `model-catalog.ts`、`provider-order.ts` | 模型目录与 provider 顺序 | ✅ |
| `src/config/` | `security-config.ts`、`skills-config.ts`、`usage-budget.ts`、`model-pricing.ts` | 安全、Skill、Token 预算持久化、AI 运营分档单价表（缓存命中/未命中 × 高峰/空闲，§COST C-3） | ✅ |
| `src/trajectory/` | `trajectory-log.ts` | append-only 轨迹日志 | ✅ |
| `src/log/` | `jsonl.ts` | JSONL 追加/轮转（.1 归档）/缓存读（P15） | ✅ |
| `src/usage/` | `usage-store.ts`、`cost.ts`、`ai-ops-notify.ts` | Token 计量与聚合（含缓存拆分）、AI 运营成本估算/阈值/硬停门禁/报告（§COST v1）+ AI 运营日报/阈值事件写入通知枢纽（E318） | ✅ |
| `src/security/` | `sandbox.ts`、`operation-log.ts`、`project-transaction.ts`、`project-conflict-confirmation.ts`、`project-conflict-resolution.ts`、`pending-project-transaction-store.ts`、`url-safety.ts`、`browser-actions.ts`、`domain-auth.ts` | 文件沙箱白名单、单文件回滚及项目级快照/预检/全量暂存、自动回滚、事务审计、冲突确认/重新确认、进程内 pending 绑定与三选一恢复执行（§11.2 E366/E393-E399/E402）；浏览器抓取 URL 安全、动作白名单与域名授权（E252） | ✅ |
| `src/postprocess/` | `cultural-reply.ts`、`answer-postprocess.ts`、`answer-postprocess-store.ts` | 文化梗回复处理；Stage 6 回答规则运行时、用户级 append-only 启停/使用/反馈复审与恢复账本；待复审规则展示按用户隔离的最近负反馈证据（§9.3，E382-E386） | ✅ |
| `src/wiki/` | `index.ts` | 冷启动知识种子 | ✅ |

## 2. 运行通道与 UI

| 路径 | 职责 | 状态 |
|------|------|------|
| `ui/prototype/` | 独立 Vite + React 三栏 UI 原型 | ✅ |
| `ui/prototype/src/App.tsx` | 三栏、设置、产物栏、终端、证据链交互、Keil target/诊断卡与源码预览入口（E392）、右栏「通知」页（E320，含每日反馈汇总 E387）与「裁决」页（E323）、对话内确认卡（E324）、MCP 工作流产物卡平台消歧按钮（E434）、Skill 候选复审证据（E386）、执行回执第二人称 + 「老板」称谓（E327）、左栏角色面板（E350） | ✅ |
| `ui/prototype/src/styles.css` | 深色工作台样式 | ✅ |
| `desktop/main.mjs` | Electron 主进程：拉起 gateway、加载 UI、回收子进程 | ✅ |
| `desktop/package.json` | electron-builder 打包配置 | ✅ |
| `desktop/scripts/prepare-resources.mjs` | 打包 gateway 资源 | ✅ |
| `desktop/src-tauri/` | Tauri 备选壳 | 🔨 |

## 3. 工具与测试

| 路径 | 职责 | 状态 |
|------|------|------|
| `scripts/doc-lint.ts` | 文档宪法七检查 | ✅ |
| `scripts/mcp-health.ts` / `scripts/mcp-s3-evidence.ts` | MCP 握手/工具清单/只读默认调用健康检查与五类专业夹具证据采集（E410） | ✅ |
| `scripts/market-run.ts` / `scripts/market-install.ts` / `scripts/route-query-file.ts` | 市场 Skill 执行/清单（E243，E251 `--query` 带参）、本地安装（E250）、意图路由文件入口（E251，`npm run route:query:file`） | ✅ |
| `scripts/bench-*.ts` | v0.1 / v0.2a / devil-v25 / provider-router 基准 | ✅ |
| `scripts/gen-devil-*` | 魔鬼训练评分、清单、证据、CSV 导出 | ✅ |
| `scripts/export-devil-baseline.ts` / `compare-devil-baseline.ts` | 新老基线导出与对比 | ✅ |
| `scripts/route-*.ts` | 路由 case、校准、审核、应用规则 | ✅ |
| `scripts/browser-*.ts` | 浏览器会话与抓取；`browser-domain-auth.ts` 域名授权管理（E252，`npm run browser:auth`） | ✅ |
| `scripts/pdf-text.ts` / `ocr_benchmark.py` | PDF 文本层与 OCR 基准 | ✅ |
| `scripts/office_xlsx_read.py` / `office_xls_read.py` / `office_doc_*.py` / `office_docx_*.py` / `office_pptx_create.py` / `office_pdf_merge.py` / `office_pdf_encrypt.py` / `office_pdf_compress.py` / `office_image_convert.py` / `compress_image.py` | 办公日常文件处理 | ✅ |
| `scripts/office_image_ocr.py` | 图片/PDF 表格 OCR（E168-E201：TSR 结构、跨页拼接、页脚过滤、三通道文本融合、编号模式纠正、词典纠正；`--selftest`/`--dict`/`--table`/`--batch`） | ✅ |
| scripts/datasheet.ts | 官方 datasheet 下载与校验 | ✅ |
| scripts/tavily-smoke.ts | Tavily 触发冒烟 + 配额监控 + 远端用量对比（E195/E228） | ✅ |
| scripts/ai-ops-cost.ts | AI 运营成本报告 CLI（`npm run cost:today`，§COST v1） | ✅ |
| scripts/ai-ops-report.ts | AI 运营日报写入通知库 CLI（`npm run ai-ops:report`，§COST C-7 §11.3，E318） | ✅ |
| scripts/deep-report-bench.ts | 深度报告 [P-13] 复测工具（dry-run/LLM 模式，E229） | ✅ |
| `scripts/migrate-to-memorycore.ts` | 历史记忆迁移 | ✅ |
| `scripts/distill-worker.ts` | L1 蒸馏 worker | ✅ |
| `scripts/push-to-hosts.ts` | Gitee/GitHub 双端同步（E18/E93，运维通道） | ✅ |
| `scripts/repo-push.ts` / `repo-whitelist.ts` / `repo-audit.ts` | S6 真实推送 CLI（`npm run repo:push` / `repo:whitelist` / `repo:audit`，E244） | ✅ |
| `scripts/market-run.ts` | 市场 Skill 执行 CLI（`npm run skill:market:run`，E243） | ✅ |
| `tests/integration/` | 跨模块集成测试（当前 29 条：IM/MCP/MARKET/REPO 真实协议端到端等） | ✅ |

## 4. 数据、配置与文档

| 路径 | 职责 | 状态 |
|------|------|------|
| `configs/tdai-gateway.local.yaml` | MemoryCore sidecar 本地配置 | ✅ |
| `data/` | SQLite、JSONL、浏览器缓存（git 忽略） | ✅ |
| `bench/` | 基准数据与报告（git 跟踪） | ✅ |
| `docs/adrs/` | 架构决策记录 | ✅ |
| `docs/documentation-map.md` | 文档资产总账 | ✅ |
| `docs/audit-navigation.md` | 第三方审核导航（逻辑目录 → 真实路径） | ✅ |
| `docs/audit-package-checklist.md` | 第三方审计交付包清单（装箱单 + 审阅路线） | ✅ |
| `docs/code-directory.md` | 本文档 | ✅ |
| `docs/architecture/` | 架构图、数据流、依赖、接口契约、部署 | ✅ |
| `docs/design/` | 搜索、路由、记忆、安全、UI、Skill、PARAM 设计 | ✅ |
| `docs/engineering/` | API、Schema、环境配置、测试策略 | ✅ |
| `docs/plans/` | 每次推进的计划与结果 | ✅ |
| `docs/reports/` | v1.0 交付期快照（安全审计/隐私说明/用户手册/成熟度评估/架构设计说明书终版，E245） | ✅ |
| `docs/2026-08-XX-progress-handoff.md` | 每日交接 | ✅ |

## 5. 更新纪律

- 新增或移动源码文件时，同步更新本表并保持状态标记准确。
- 新增目录先补本表，再进 `docs/directory-structure.md` 与 AGENTS.md 目录地图。
- 已冻结文件（需求文档、schema v1）不得在本表里“重新设计”，只能登记偏离（E-NN）。
- 测试文件不逐行列出，但新增行为必须带同名单测或集成测试。
