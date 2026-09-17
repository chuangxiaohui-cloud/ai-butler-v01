# 目录结构与接口契约

> 推导链第二环：需求文档 → ADR → 目录结构 → AGENTS.md。
> 权威需求：`一人公司AI-Agent需求文档_v2.5.md`；架构决策：[ADR-0001](./adrs/0001-architecture-foundation.md)。
> 文档总账：`docs/documentation-map.md`；文件级索引：`docs/code-directory.md`。

## 1. 开发全景

```text
CLI (src/main.ts)  UI (ui/prototype)  桌面壳 (desktop)
        \                 |                /
         \                v               /
          单一 TurnLoop gateway (src/gateway)
                        |
                        v
              pipeline Stage 1-6 (src/search/pipeline.ts)
              ├─ 意图路由 (src/agent)
              ├─ 记忆 / 经验 (src/memory)
              ├─ Skill 注册与生命周期 (src/skills)
              ├─ 搜索 provider / LLM / 浏览器适配层
              └─ 输出 answer 契约 + 轨迹 / 用量
```

## 2. 根目录

| 路径 | 职责 |
|------|------|
| `一人公司AI-Agent需求文档_v2.5.md` | 需求与文档宪法唯一权威 |
| `AGENTS.md` | AI Agent 运行时入口与开发规范 |
| `README.md` | 人类开发入口与命令速查 |
| `v0.2b_MVP_实施规划.md` | v0.2b 实施规划与验收记录 |
| `src/` | TypeScript 源码，问答核心域与运行通道 |
| `scripts/` | 基准、评分、验收、路由校准、浏览器、PDF/OCR 等工具 |
| `tests/integration/` | 跨模块集成测试 |
| `ui/prototype/` | 独立 Vite + React 三栏 UI 原型 |
| `desktop/` | Electron 主壳 + Tauri 备选壳 |
| `bench/` | 基准数据与报告（git 跟踪） |
| `docs/` | 交接、推进计划、ADR、借鉴登记、架构图、交付期报告快照（`docs/reports/`） |
| `data/` | 运行时 SQLite、JSONL、缓存（git 忽略） |
| `dist/` | TypeScript 构建产物（git 忽略） |
| `configs/` | MemoryCore sidecar 等本地运行配置 |

根目录下的 `AI-Butler/`、`agent-skills/`、`deepseek-harness/`、`OpenHands/`、
`openocta/`、`opensquilla/`、`openworker/`、`TencentDB-Agent-Memory/`、`v3/`、
`crm/`、`benchmarks/`、`Tavily+AnySearch+Bocha/` 是独立项目或参考材料，只读、
不修改、不直接依赖其内部 API。

## 3. src 模块职责与关键文件

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| `src/search/` | Stage 1-6 搜索问答管道、搜索 provider、融合、兜底链 | `pipeline.ts`、`stages/`、`providers/`、`fusion.ts`、`rule1.ts`、`rule3.ts`、`second-pass.ts`、`second-pass-fetch.ts`、`deep-report.ts`、`deep-report-store.ts` |
| `src/mcp/` | MCP 子 Agent 运行契约与工具适配；Keil、VS Code、STM32-GCC、KiCad ERC 与 LTspice 只读链已接入并有真实 stdio 夹具证据（E401-E410）；项目画像支持字段级合并、多平台共存、过期重探测和构建人工审批；E411 落地 flash/串口能力与风险契约（设备白名单/固件摘要/逐次确认/串口默认只读/审计），默认零硬件动作；E412 工作流计划指纹持久化与批准恢复校验；E413 KiCad 有界编辑（项目事务）与 LTspice 固定批仿真（高风险确认）；E414 动作验收入口（fixture/business + [P-10] 差距复验）；不含自由 PCB 编辑、自定义仿真开关或真实烧录驱动 | `types.ts`、`contract.ts`、`registry.ts`、`client.ts`、`dispatcher.ts`、`safety.ts`、`config.ts`、`health.ts`、`keil.ts`、`keil-server.ts`、`vscode.ts`、`vscode-server.ts`、`stm32-gcc.ts`、`stm32-gcc-server.ts`、`kicad.ts`、`kicad-server.ts`、`ltspice.ts`、`ltspice-server.ts`、`project-profile.ts`、`project-profile-store.ts`、`project-profile-merge.ts`、`domain-workflow.ts`、`workflow-entry.ts`、`workflow-guard.ts`、`hardware-capability.ts`、`device-auth.ts`、`hardware-gate.ts`、`firmware-digest.ts`、`port-probe.ts`、`hardware-audit.ts`、`workflow-plan-fingerprint.ts`、`workflow-plan-store.ts`、`kicad-edit.ts`、`acceptance.ts`；证据脚本：`scripts/mcp-s3-evidence.ts`；schema：`configs/mcp-profiles/project-profile.schema.json` |
| `src/im/` | 远程对话通道（授权开关/会话隔离/输出适配/复用 pipeline + ImChannel 抽象 + OneBot 11 真实适配器 + 常驻入口，v1.0 S5，§4.5 E224+E241） | `gate.ts`、`session.ts`、`format.ts`、`service.ts`、`channel.ts`、`config.ts`、`run.ts`、`onebot/` |
| `src/repo/` | 代码托管联动（仓库白名单/预检门禁/commit+push/审计 JSONL + 真实推送 CLI 编排，v1.0 S6，E225+E244） | `types.ts`、`repo-whitelist.ts`、`push-audit.ts`、`push-service.ts`、`cli.ts` |
| `src/skills/market/` | Skill 市场远程化（索引/校验/权限门禁/安装记录 JSONL + 可执行 handler + 自然语言触发词直连 + 本地安装通道，v1.0 S7，E243+E248+E250+E251 输入通道） | `index-client.ts`、`manifest.ts`、`installer.ts`、`nl-router.ts`、`runner.ts`、`store.ts`、`types.ts`（精选包源 `configs/market-skills/`） |
| `src/agent/` | 三层意图路由、路由表、校准、模式映射、多模态预处理、rewrite/显式记住与纠正记忆指令（E370）、时间表达、路由 case JSONL（追加/轮转） | `router-v2.ts`、`routing-table.ts`、`mode-mapper.ts`、`route-case-store.ts`、`rewrite-with-memory.ts`、`memory-instruction.ts`、`time-expression.ts` |
| `src/skills/` | Skill 注册、生命周期、预置 Skill；project-writer 结构化多文件事务预览、确认与首次裁决执行（E398/E399）；回复连续 👎 达 [P-79] 标记复审并由用户恢复（E378/E379） | `registry.ts`、`lifecycle.ts`、`deps.ts`、`skills/*` |
| `src/maturity/` | 成熟度观测（L0-L3 判定、五维指标；合并 pipeline 路由标注与回复最新反馈，§9.3/§12.4，E247/E377，`npm run maturity:check`）+ 运行时看门狗（E282，synthesis_timeout 环境噪音告警） | `metrics.ts`、`runtime-watchdog.ts` |
| `src/feedback/` | 回复反馈、最新值与按用户每日汇总，Skill 复审、重复修订候选归并，以及 accepted 候选的只读草案预览（§9.3，E374-E387） | `feedback-store.ts`、`skill-candidate-store.ts`、`skill-candidate-draft.ts` |
| `src/memory/` | MemoryStore、ExperienceManager、用户上下文与蒸馏；软件职业画像（E365）；三栏 ACL（E367/E368）；人格事实分层、栏位冲突、时间敏感事实及已解决生活话题出窗/L2 保留（§8.1.3/§8.3，E369/E371-E373） | `store.ts`、`memorycore-store.ts`、`experience.ts`、`distill.ts`、`session-context.ts`、`user-context-store.ts`、`software-profile.ts`、`asset-acl.ts`、`persona-memory.ts`、`time-sensitive-memory.ts` |
| `src/slash/` | 斜杠命令层（/compact 手动压缩、/context 会话状态、/cost AI 运营成本报告，§8.3 E204 / §14 E319） | `slash-commands.ts` |
| `src/reminder/` | 主动提醒存储 | `reminder-store.ts` |
| `src/mail/` | 邮箱通道：凭据多账号容器与认证模型（password/xoauth2）、IMAP 只读收件/读信/搜信/附件（E293-E303）、SMTP 发信、Outlook OAuth2 设备码授权与自动续期（XOAUTH2 收信+发信，E321/E322） | `credentials.ts`、`smtp.ts`、`imap.ts`、`oauth.ts` |
| `src/gateway/` | 单一共享 TurnLoop Express gateway 与 API；普通批准/否决、结构化 choice、project-writer 首次确认及冲突三选一恢复执行（E323/E396/E399/E402） | `app.ts`、`server.ts`、`attachments.ts`、`terminal.ts`、`files.ts`、`artifact-bus.ts`、`project-watcher.ts`、`change-history.ts`、`rate-limit.ts` |
| `src/browser/` | 浏览器会话、CDP 持久化、页面抓取、浏览器操作（E252：AX 树观察 [P-126] 有界 + DSL 交互层 [P-124]/[P-125] + 真实 CDP 驱动） | `session.ts`、`dom-observe.ts`、`operations.ts`、`driver.ts` |
| `src/config/` | PARAM、Provider Registry、模型目录、安全/用量/Skill 配置、AI 运营分档单价表（缓存命中/未命中 × 高峰/空闲） | `params.ts`、`model-catalog.ts`、`provider-order.ts`、`security-config.ts`、`usage-budget.ts`、`model-pricing.ts` |
| `src/trajectory/` | append-only 轨迹日志 | `trajectory-log.ts` |
| `src/log/` | JSONL 追加/轮转（.1 归档）/缓存读 | `jsonl.ts` |
| `src/usage/` | Token 计量与聚合（含缓存拆分）；AI 运营成本估算/阈值告警/硬停门禁/报告（§COST v1）；AI 运营日报/阈值事件写入通知枢纽（§11.3 秘书日报，E318） | `usage-store.ts`、`cost.ts`、`ai-ops-notify.ts` |
| `src/security/` | 沙箱路径白名单、单文件回滚及项目级快照/预检/全量暂存、自动回滚、事务审计、冲突确认/重新确认、进程内 pending 绑定与三选一恢复执行（§11.2 E366/E393-E399/E402）、浏览器抓取 URL 安全、浏览器动作白名单/高风险标记、域名授权持久化（E252） | `sandbox.ts`、`operation-log.ts`、`project-transaction.ts`、`project-conflict-confirmation.ts`、`project-conflict-resolution.ts`、`pending-project-transaction-store.ts`、`url-safety.ts`、`browser-actions.ts`、`domain-auth.ts` |
| `src/security/` | 命令白名单 + 搜索脱敏（v1.0 S4，§10.2/§10.3） | `command-whitelist.ts`、`query-sanitize.ts` |
| `src/postprocess/` | 输出后处理：文化回复、Stage 6 answer_postprocess 运行时及用户级 append-only 启停/使用/反馈复审与恢复账本；待复审规则展示按用户隔离的最近负反馈证据（§9.3，E382-E386） | `cultural-reply.ts`、`answer-postprocess.ts`、`answer-postprocess-store.ts` |
| `src/wiki/` | 冷启动知识种子 | `index.ts` |

## 4. 接口契约

| 契约 | 定义位置 | 说明 |
|------|----------|------|
| 问答契约 | `src/search/pipeline.ts` | `answer(query) -> { answer, confidence, evidence[], gate_triggered }`；`pipeline()` 为唯一实现入口 |
| 搜索适配器 | `src/search/providers/types.ts` | `SearchProvider.search(query, opts) -> SearchProviderResult` |
| 记忆接口 | `src/memory/store.ts` | `put / recall / forget`，对齐需求 `§8.4`；直连与 sidecar 可配置切换 |
| Skill 接口 | `src/skills/registry.ts` | `ExecutableSkill.execute(input, deps)` |
| Skill 依赖 | `src/skills/deps.ts` | `SkillDeps`：VLM、文档解析、LLM 等统一依赖注入 |
| 路由结果 | `src/agent/router-v2.ts` | 特征提取 → 规则匹配 → 置信度门控，输出 `RouteResultV2` |
| 参数注册表 | `src/config/params.ts` | camelCase key ↔ `[P-NN]` 双向映射，数值只来自需求 `§5` |

## 5. Gateway API

`src/gateway/app.ts` 暴露同一 `pipeline` 的运行通道，常用端点：

| 端点 | 用途 |
|------|------|
| `POST /api/ask` | 问答，返回四字段契约 + 路由扩展元数据 |
| `GET /api/health` | 健康检查 |
| `GET /api/model-providers` | 模型目录，供 UI 模型切换 |
| `GET /api/events` | Artifact 事件 SSE |
| `GET/POST /api/providers` | Provider 状态与默认顺序 |
| `GET/POST /api/skills` | Skill 元数据与启用/禁用同步 |
| `GET /api/skill-candidates`、`POST /api/skill-candidates/:id/rule` | Skill 候选、answer_postprocess 规则启停/复审与最近负反馈证据（§9.3，E380-E386） |
| `GET/POST /api/feedback` | 回复反馈审计、最新状态与统计（§9.3，E374-E386） |
| `GET /api/agents` | 子 Agent 目录（类别/名称/接入状态，§4.1.2 角色面板，E350） |
| `GET/POST /api/usage/*` | Token 用量与预算 |
| `GET /api/memory`、`POST /api/memory/forget` | 记忆浏览与删除 |
| `GET /api/notifications` | 通知读 API（最新在前 + 优先级 + 当前用户每日反馈摘要，§9.3/§11.3，E320/E387） |
| `GET /api/decisions`、`POST /api/decisions/:id` | 人类裁决：待裁决队列读 + 批准/否决/结构化 choice 回填；普通 resume、project-writer 首次确认及冲突三选一均显式恢复并返回事务回执（§2.3，E323/E324/E396/E399/E402） |
| `GET/POST /api/security` | 安全中心配置 |
| `POST /api/terminal/exec` | 终端命令执行通道（Shell 权限门控） |
| `GET /api/files` | 产物文件扫描（沙箱根目录白名单） |
| `GET/POST /api/routing/*` | 路由 case 采集、审核与导出 |

## 6. 数据流

1. 入口接收 `query`，经 gateway 或 CLI 进入 `pipeline()`。
2. Stage 1 预处理：黑话映射、脱敏、记忆调用、缓存检查、多模态信号提取。
3. 意图路由：三层路由决定主镜片、意图、executor 与是否需要搜索。
4. Stage 2-5：意图分类、搜索执行、融合评分、秘书合成。
5. Stage 6 后处理：校验 `answer`、钳制 `confidence`、写 L0 记忆。
6. 全程可选记录 trajectory 与 usage，失败不阻塞主问答。

## 7. 更新纪律

- 新增或移动 `src/` 模块时，同步更新本表与 AGENTS.md 目录地图。
- 接口签名变更时，先改需求文档与 ADR，再改代码与测试。
- 量化参数变更时，同步 `src/config/params.ts` 与需求 `§5 [P-NN]`。
- 新增架构决策时，按 `docs/adrs/README.md` 流程追加 ADR。
- 运行时状态只进 `data/`；验收证据只进 `bench/`，两者不混淆。
