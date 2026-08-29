# 系统整体架构图

> 权威需求：`一人公司AI-Agent需求文档_v2.5.md` §6.0 / §8.1.4 / §13
> 架构决策：`docs/adrs/0001-architecture-foundation.md`

## 0. 承诺清单（宣称 vs 实际）

> 状态口径：`✅ 已生产化` / `🟡 可切但默认未开` / `🔴 文档宣称但生产未跑` / `📋 设计阶段`。
> 更新纪律：任何模块状态变化必须在当日交接登记，并同步本表（架构审阅 4.3）。

| 对外承诺 | 状态 | 现状 | 证据 |
|---------|------|------|------|
| 单一问答链路 `pipeline()` | ✅ 已生产化 | CLI、gateway、UI 共用同一 pipeline，禁止另起一套问答链路 | ADR-0001 §3 |
| 三层意图路由（规则 → LLM 特征 → 置信度门控） | ✅ 已生产化 | `routeV2WithLLM` 生产接线（`deps.llm` 注入）；未配置 Provider 时降级规则 + [P-84] 折扣 | E22/E23/E227 |
| LLM 三厂九档（DeepSeek / MiniMax / 智谱） | ✅ 已生产化 | Provider Registry + fallback 链 + 模型目录，UI 切换器可见 | E268/E269 |
| 搜索多引擎并联（Bocha / AnySearch / Tavily / 浏览器兜底） | ✅ 已生产化 | `Promise.allSettled` 并行 + 心跳互备 + 配额熔断 | ADR-0001 §1 |
| MemoryCore sidecar | 🟡 可切但默认未开 | `MEMORY_STORE=memorycore` 切换，默认 `SqliteDirectStore`；L1 蒸馏走项目侧 distill worker | E6/E227 |
| 深度报告（v1.0 S1） | ✅ 已生产化 | 分阶段 + 分节并行 + 取消恢复 + 逐节落盘 | E231/E233 |
| Skill 系统 + 市场 | ✅ 已生产化 | 注册/生命周期/本地安装/触发词直连/@input 通道 | E243/E248/E250/E251 |
| MCP 子 Agent | ✅ 已生产化 | 注册表/stdio 客户端/调度器/白名单 + 真实 windows-mcp server | E240 |
| IM 通道（OneBot 11 QQ 适配） | ✅ 已生产化 | 授权开关/会话隔离/输出适配，复用 pipeline | E224/E241 |
| 代码托管联动 | ✅ 已生产化 | 白名单/预检/commit+push/审计 + 真实 CLI | E225/E244 |
| 浏览器操作受限 Skill | ✅ 已生产化 | CDP 会话 + AX 树观察 + 动作白名单 + 审批双闸 | E252 |
| 运行时看门狗 | ✅ 已生产化 | trajectory 订阅 + `synthesis_timeout` 占比告警进 `toolNotice` | E282 |
| Tauri 备选壳 | 🔴 文档宣称但生产未跑 | Electron 主壳稳定；Tauri 壳同步维护但冻结，不阻塞发布 | ADR-0001 §1 / 审阅 M8 |
| 成熟度 L2+（P-10 条件③） | 📋 设计阶段 | 用户累积 Skill 32/50+、真实使用反馈样本累积中 | E245/E246 |

## 1. 分层总览

```text
┌─────────────────────────────────────────────────────────────────┐
│ UI 层                                                           │
│ React + Vite 三栏（ui/prototype）                                │
│ Electron 主进程（desktop/main.mjs）/ Tauri 备选壳                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP JSON + SSE（127.0.0.1:8787）
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Gateway 层                                                      │
│ 单一共享 TurnLoop Express（src/gateway/app.ts + server.ts）      │
│ /api/ask → pipeline；/api/events → SSE                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ 进程内函数调用（同一 Node 进程）
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Pipeline 层（src/search/pipeline.ts）                           │
│ Stage 1 预处理 → 意图路由 → Stage 2 分类                         │
│ → Stage 3 搜索 → Stage 4 融合 → Stage 5 合成 → Stage 6 后处理    │
│ 依赖：src/agent、src/memory、src/skills、src/config              │
└──────┬───────────────┬────────────────┬────────────────┬─────────┘
       │               │                │                │
       ▼               ▼                ▼                ▼
  HTTP/JSON       HTTPS/JSON       CDP/Playwright    HTTP/JSON
  (8420)          (外部 API)       (本机浏览器)      (外部 API)
       │               │                │                │
       ▼               ▼                ▼                ▼
 MemoryCore      LLM 三厂          Chromium/Edge     Bocha /
 sidecar         DeepSeek/        session          AnySearch /
 SQLite          MiniMax/智谱                       Tavily
```

## 2. 层职责

| 层 | 职责 | 主要位置 |
|----|------|---------|
| UI 层 | 三栏交互、Ask/Craft/Plan、设置、产物栏、终端、证据链 | `ui/prototype/`、`desktop/` |
| Gateway 层 | REST 入口、附件解码、终端门控、文件扫描、SSE 事件、静态 UI | `src/gateway/` |
| Pipeline 层 | 唯一问答链路，所有入口共用 | `src/search/pipeline.ts` |
| 记忆层 | L0-L2 记忆、Experience、UserContext、Skill 生命周期 | `src/memory/`、`src/skills/` |
| 外部服务层 | LLM、搜索引擎、浏览器会话、datasheet 下载 | `src/search/providers/`、`src/search/llm-*`、`src/browser/` |

## 3. 进程边界与通信协议

| 通信对 | 协议 | 说明 |
|--------|------|------|
| UI → Gateway | HTTP JSON + SSE | 问答、设置、事件订阅 |
| Gateway → Pipeline | 进程内函数调用 | 禁止 UI 绕开 gateway 直接实现问答 |
| Pipeline → MemoryCore | HTTP JSON | 默认 `http://127.0.0.1:8420`，SDK 超时按 [P-42] |
| Pipeline → LLM | HTTPS OpenAI 兼容 | Provider Registry 便宜优先 + fallback |
| Pipeline → 搜索源 | HTTPS JSON | Bocha / AnySearch / Tavily，配额与心跳 |
| Pipeline → 浏览器 | CDP / Playwright | 持久化 profile，登录态复用，不回读用户 Chrome 配置 |

## 4. 关键约束

- 只允许一个问答实现：`pipeline()`。
- Gateway 是 UI 与 CLI 的共享 TurnLoop，不新增第二套行为逻辑。
- MemoryCore 是本地 sidecar，不是进程内模块；部署时需单独启动。
- 所有外部服务必须落在适配层，核心域不直接依赖第三方 SDK。
