# 架构设计说明书（终版）· v1.0

> 版本快照：2026-08-26（v0.2b 分支）· 文档类型：交付期交付物（documentation-map 第四组 #7）
> 整合来源：`docs/architecture/*`（system-architecture / module-dataflow / module-dependencies /
> interface-contract / deployment）、`docs/adrs/0001-architecture-foundation.md`、
> `docs/adrs/0002-calendar-email-integration.md`、`docs/directory-structure.md`。
> 权威需求：`一人公司AI-Agent需求文档_v2.5.md`。

## 1. 总体架构

本地优先桌面应用，无 Docker。五层：

```text
UI 层（React + Vite 三栏原型 / Electron 主壳，Tauri 备选）
   │ HTTP JSON + SSE（127.0.0.1:8787）
Gateway 层（单一共享 TurnLoop Express：/api/ask + /api/events）
   │ 进程内函数调用（同一 Node 进程）
Pipeline 层（唯一问答链路：Stage 1 预处理 → 意图路由 → Stage 2 分类 → Stage 3 搜索 →
             Stage 4 融合 → Stage 5 合成 → Stage 6 后处理）
   │
   ├─ 记忆层（L0-L2 记忆 / Experience / UserContext / Skill 生命周期）
   └─ 外部服务（LLM 三厂 fallback / 搜索引擎多源 / 浏览器 CDP / MemoryCore sidecar）
```

## 2. 核心设计约束

- **单一 pipeline**：CLI、gateway、UI、IM 通道共用 `src/search/pipeline.ts`，禁止另起问答链路
  （稳定契约 `answer(query) -> { answer, confidence, evidence[], gate_triggered }`）。
- **本地优先 + 无 Docker**：运行时数据落 `data/`（git 忽略）；云端唯一依赖是 LLM 推理请求
  （§8.1.4：只接收推理请求并返回文本，不存储用户数据）。
- **模块边界**：核心域（search/agent/memory/skills）→ 适配层（providers/llm/browser/store）→
  运行通道（CLI/gateway/UI/desktop）→ 观测治理（trajectory/usage/config/scripts/bench/docs）。
- **文档宪法**：需求文档 §0 八项检查由 `scripts/doc-lint.ts` 执法；PARAM 注册表（§5）与
  `src/config/params.ts` 双向同步。

## 3. 数据流（问答主链路）

1. Stage 1 预处理（多模态输入归一化：图片/文档/视频关键帧）。
2. 意图路由（三层：黑话映射 → 意图分类 → 置信消歧；低置信 confirm，E8/E10 校准）。
3. Stage 2 意图分类（LLM 轻模型，[P-04] 超时，失败回退规则）。
4. Stage 3 搜索（Bocha/AnySearch/Tavily 多源并联 + 浏览器兜底 + datasheet 下载校验）。
5. Stage 4 融合（4 过滤器 + 加权评分 + 权威源优先 + 兜底链）。
6. Stage 5 秘书级合成（模型分档 [P-105]：便宜优先，重档任务用 heavy）。
7. Stage 6 后处理（脱敏输出、gate 触发、证据链装配）。

## 4. 关键架构决策（ADR）

| 决策 | 内容 | 出处 |
|------|------|------|
| 技术选型 | Electron 主壳 + Tauri 备选；Node.js/TypeScript ESM+NodeNext；React 三栏原型 | ADR-0001 |
| 搜索多源 | Bocha + AnySearch + Tavily + 浏览器兜底，心跳互备 + 配额熔断 | ADR-0001 / §6 |
| LLM 分档 | OpenAI 兼容客户端 + Provider Registry fallback 链（[P-107]）+ 模型分档（[P-105]/[P-106]） | ADR-0001 / E104 |
| 记忆存储 | SQLite local-first；v0.2b MemoryCore sidecar（`MEMORY_STORE=memorycore` 切换） | ADR-0001 / E206/E227 |
| 单一网关 | CLI / UI / 未来聊天频道共用 `POST /api/ask` | ADR-0001 |
| 日历/邮件 | 本地日历 + SMTP 邮件发送集成（`src/reminder/`、`src/mail/`） | ADR-0002 |

## 5. 真实接入面（v1.0 切片收口）

| 切片 | 落地 | 架构要点 |
|------|------|---------|
| S1 深度报告 | `src/search/deep-report.ts` | 长任务分阶段生成，[P-13] 预算 |
| S2 证据链 UI | `ui/prototype/` 三栏 | `[hard]/[soft]` 证据卡片、SSE 事件流 |
| S3 MCP 子 Agent | `src/mcp/` | stdio 客户端 + 调度器 + 工具名双白名单（E240 真实 server） |
| S4 安全模型 | `src/security/` | 沙箱/命令白名单/脱敏/URL 安全/操作日志（§10） |
| S5 远程对话通道 | `src/im/` | ImChannel 抽象 + OneBot 11 真实适配器（E241），复用 pipeline |
| S6 代码托管 | `src/repo/` | 白名单/预检/commit+push/审计 + CLI（E225+E244），token 不落盘 |
| S7 Skill 市场 | `src/skills/market/` | 索引/校验/门禁/安装/执行（E226+E243） |
| S8 LLM 路由 | `src/search/llm.ts` | LLM 特征提取路由 + MemoryCoreStore 切换（E227） |

## 6. 部署与运行

- 本地进程：CLI（`npm run dev`）/ Gateway（`npm run gateway`，127.0.0.1:8787）/ Electron 桌面壳
  （`npm run desktop`，同源 UI）。
- MemoryCore sidecar：源码启动（`MemoryCore`，端口 8420），SQLite + Markdown，进程退出数据保留。
- 无 Docker；无容器开销；唯一外部依赖为 LLM API 与搜索 API（密钥经 `.env`）。
- 详细部署见 `docs/architecture/deployment.md`。

## 7. 观测与治理

- 轨迹：`src/trajectory/` append-only（`data/trajectory.jsonl`，[P-113] 轮转）。
- 用量：`src/usage/` token 预算（阈值 [P-108]）。
- 审计：命令审计、push 审计、操作日志（回滚）。
- 验收：`doc-lint` 唯一口径 + `bench/devil-v25` 122 条回归基准 + 单测/集成全量。

## 8. 已知限制（诚实登记）

- UI 原型为独立 Vite 工程，与主仓库同构但未并入单一构建；桌面壳为 Electron 主进程壳。
- L2 embedding/向量检索为后置项（`docs/design/memory-system.md`），v1.0 再评估。
- 本说明书为 v1.0 收口快照；架构演进时重新生成，不覆盖本版。
