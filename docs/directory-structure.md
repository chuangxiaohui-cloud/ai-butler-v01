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
| `docs/` | 交接、推进计划、ADR、借鉴登记、架构图 |
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
| `src/mcp/` | MCP 子 Agent 骨架（注册表/stdio 客户端/调度器/安全白名单，v1.0 S3） | `registry.ts`、`client.ts`、`dispatcher.ts`、`safety.ts` |
| `src/im/` | 远程对话通道骨架（授权开关/会话隔离/输出适配，v1.0 S5） | `gate.ts`、`session.ts`、`format.ts`、`service.ts` |
| `src/repo/` | 代码托管联动库骨架（仓库白名单/预检门禁/commit+push/审计 JSONL，v1.0 S6） | `repo-whitelist.ts`、`push-audit.ts`、`push-service.ts` |
| `src/skills/market/` | Skill 市场远程化骨架（索引/校验/权限门禁/安装记录 JSONL，v1.0 S7） | `index-client.ts`、`manifest.ts`、`installer.ts`、`store.ts` |
| `src/agent/` | 三层意图路由、路由表、校准、模式映射、多模态预处理、rewrite/记住指令、时间表达、路由 case JSONL（追加/轮转） | `router-v2.ts`、`routing-table.ts`、`mode-mapper.ts`、`route-case-store.ts`、`rewrite-with-memory.ts`、`memory-instruction.ts`、`time-expression.ts` |
| `src/skills/` | Skill 注册、生命周期、预置 Skill | `registry.ts`、`lifecycle.ts`、`deps.ts`、`skills/*` |
| `src/memory/` | MemoryStore（sqlite/memorycore 配置切换）、ExperienceManager、用户上下文、蒸馏 | `store.ts`、`memorycore-store.ts`、`experience.ts`、`distill.ts` |
| `src/slash/` | 斜杠命令层（/compact 手动压缩、/context 会话状态，§8.3 E204） | `slash-commands.ts` |
| `src/reminder/` | 主动提醒存储 | `reminder-store.ts` |
| `src/gateway/` | 单一共享 TurnLoop Express gateway 与 API | `app.ts`、`server.ts`、`attachments.ts`、`terminal.ts`、`files.ts`、`artifact-bus.ts`、`rate-limit.ts` |
| `src/browser/` | 浏览器会话、CDP 持久化、页面抓取 | `session.ts` |
| `src/config/` | PARAM、Provider Registry、模型目录、安全/用量/Skill 配置 | `params.ts`、`model-catalog.ts`、`provider-order.ts`、`security-config.ts` |
| `src/trajectory/` | append-only 轨迹日志 | `trajectory-log.ts` |
| `src/log/` | JSONL 追加/轮转（.1 归档）/缓存读 | `jsonl.ts` |
| `src/usage/` | Token 计量与聚合 | `usage-store.ts` |
| `src/security/` | 沙箱路径白名单、审计、Agent 操作日志与回滚、浏览器抓取 URL 安全 | `sandbox.ts`、`operation-log.ts`、`url-safety.ts` |
| `src/security/` | 命令白名单 + 搜索脱敏（v1.0 S4，§10.2/§10.3） | `command-whitelist.ts`、`query-sanitize.ts` |
| `src/postprocess/` | 输出后处理（文化回复等） | `cultural-reply.ts` |
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
| `GET/POST /api/usage/*` | Token 用量与预算 |
| `GET /api/memory`、`POST /api/memory/forget` | 记忆浏览与删除 |
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
