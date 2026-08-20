# 系统整体架构图

> 权威需求：`一人公司AI-Agent需求文档_v2.5.md` §6.0 / §8.1.4 / §13
> 架构决策：`docs/adrs/0001-architecture-foundation.md`

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
