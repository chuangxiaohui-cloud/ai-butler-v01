# ADR-0001 基础架构决策：技术选型、分层策略与模块划分原则

> 状态：accepted（2026-08-17 补记） · 权威需求：`一人公司AI-Agent需求文档_v2.5.md`
> 关联文档：[目录结构与接口契约](../directory-structure.md)、`AGENTS.md`

## 背景

项目从 v2.5 需求文档直接进入开发，技术选型、分层策略和模块边界实际已经分散在
README、AGENTS.md 与历次推进计划中，但没有单一决策记录。本 ADR 把已经落地且稳定
的事实补记成约束，不代表重新选型。

## 决策

### 1. 技术选型

| 维度 | 决策 | 原因与约束 |
|------|------|------------|
| 运行形态 | 本地优先桌面应用，无 Docker | 面向个人桌面工程师，离线可用优先；`§0` 文档宪法约束 |
| 桌面壳 | Electron 主壳，Tauri 壳同步维护 | `desktop/main.mjs` 当前负责拉起 gateway 与同源 UI；`desktop/src-tauri/` 作为备选目标 |
| 语言与构建 | Node.js + TypeScript，ESM + NodeNext | 与 CLI、gateway、UI 共享同一套依赖与类型 |
| UI | 独立 Vite + React 三栏原型 | `ui/prototype/`，薄客户端，不另起问答链路 |
| 问答核心 | 单一 `pipeline` | CLI、gateway、UI 必须共用同一管道，禁止另起一套 |
| 搜索 | Bocha + AnySearch + Tavily + 浏览器兜底 | 多源并联、心跳互备、配额熔断，`§6` 为唯一权威 |
| LLM | OpenAI 兼容客户端 + Provider Registry | DeepSeek / MiniMax / 智谱，fallback 链与模型分档 |
| 记忆 | SQLite local-first；v0.2b MemoryCore sidecar | `§8.4` MemoryStore 接口冻结，切换为配置项 |
| 网关 | 单一共享 TurnLoop Express gateway | CLI / UI / 未来聊天频道共用 `POST /api/ask` |
| 数据 | 运行时数据进 `data/`，验收证据进 `bench/` | 机器轨迹不提交，基准证据 git 跟踪 |

### 2. 分层策略

| 层 | 内容 | 位置 |
|----|------|------|
| 需求与治理 | 需求文档、doc-lint、PARAM 注册表、推进计划 | 根目录需求文档、`scripts/doc-lint.ts`、`docs/` |
| 核心域 | 搜索管道 Stage 1-6、意图路由、记忆、Skill | `src/search/`、`src/agent/`、`src/memory/`、`src/skills/` |
| 适配层 | 搜索 provider、LLM、浏览器、记忆存储、文档解析 | `src/search/providers/`、`src/search/llm-*`、`src/browser/`、`src/memory/*store` |
| 运行通道 | CLI、gateway、UI、桌面壳 | `src/main.ts`、`src/gateway/`、`ui/prototype/`、`desktop/` |
| 观测与治理 | 轨迹、用量、配置、脚本、基准、文档 | `src/trajectory/`、`src/usage/`、`src/config/`、`scripts/`、`bench/`、`docs/` |

依赖规则：

- 运行通道只允许调用 `pipeline` 或 gateway API，禁止各自实现问答逻辑。
- 核心域依赖稳定接口，不反向依赖运行通道。
- 外部服务全部经过适配层，不直接散落在核心域。
- 新增依赖必须先说明理由并登记；外部参考项目只读、不修改、不直接依赖其内部 API。
- 行为或参数变更先写计划，涉及需求/参数时同步 E-NN 与 bench。

### 3. 稳定契约

- 问答契约：`answer(query) -> { answer, confidence, evidence[], gate_triggered }`，
  实现入口为 `src/search/pipeline.ts` 的 `pipeline()`。
- 扩展元数据：路由层附加 `mode` 与可选 `submode`，不改变四字段契约。
- 搜索适配器：`SearchProvider.search(query, opts)`，统一 `SearchProviderResult`。
- 记忆接口：`MemoryStore.put / recall / forget`，对齐 `§8.4`；v0.1 直连 SQLite，
  v0.2b 可切 MemoryCoreStore。
- Skill 接口：`ExecutableSkill.execute(input, deps)`，依赖统一走 `SkillDeps`。
- 参数纪律：量化参数只来自 `src/config/params.ts` 与 `§5 [P-NN]`，不背裸数值。

### 4. 模块划分原则

- 一个模块一个职责，命名与目录即边界。
- 模块间只通过稳定接口协作，不共享内部实现细节。
- 数据流单向：入口 → 路由 → 管道 → 适配器 → 存储/输出。
- Skill 是能力扩展点，注册、生命周期、启用开关统一由 `src/skills/` 管理。
- 运行时状态（SQLite、JSONL、浏览器 CDP 端口、缓存）全部落在 `data/`，不提交。
- 目录变化时同步更新 `docs/directory-structure.md` 与 AGENTS.md 目录地图。

## 备选方案

| 方案 | 结论 | 原因 |
|------|------|------|
| Docker + 微服务 | 否决 | 个人桌面场景，安装与运维成本高，违反无 Docker 约束 |
| 纯 Web SaaS | 否决 | 本地优先、离线可用、记忆与文件都在本机 |
| UI 独立实现问答链路 | 否决 | 会导致 CLI / UI 行为分叉，破坏稳定契约；E106 已统一到 TurnLoop gateway |
| 引入重型编排框架 | 否决 | 核心依赖保持精简，外部项目只借鉴思想、不借底座 |

## 后果

正面：

- 所有入口共享同一管道，行为一致、测试可复用。
- 适配层隔离外部服务波动，Provider 与搜索源可独立替换。
- 目录与接口契约有单一描述，新 Agent 或人类开发者都能快速看清全貌。

代价：

- 新增能力必须先符合既有接口与分层，不能绕过 pipeline 快速接出。
- 目录文档需要随模块增删持续维护，否则会再次漂移。
