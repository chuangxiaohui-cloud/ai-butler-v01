# OpenSquilla 借鉴审阅（v0.2b 收官项）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成
> 范围：本地 `opensquilla/`（v0.5.3）源码 + 官方文档；只做借鉴审阅，不改外部仓库。

## 目标

判断 OpenSquilla 对「一人公司 AI-Agent」有哪些值得借鉴的设计，按
「可直接借鉴 / 需裁剪 / 不建议照搬」三层落地到 `docs/borrowed-designs.md`，
避免继续开发时漏掉或误把外部框架当底座。

## 审阅对象

- 定位：Token-Efficient AI Agent，微内核 + 单一共享 TurnLoop；
  本地模型路由（SquillaRouter）按任务难度选最便宜能处理的模型；
  持久记忆、分层沙箱、内置搜索、设备端 embedding；CLI/Web UI/聊天频道共用同一 loop。
- 关键源码：`src/opensquilla/squilla_router/`、`engine/turn_runner/`、
  `provider/selector.py`、`engine/steps/skills_filter.py`、`memory/`、`sandbox/`。
- 关键文档：`docs/features/squilla-router.md`、`LLM-ensemble-design.md`、
  `memory.md`、`compaction-and-cache.md`、`tool-compression.md`。

## 可直接借鉴（按优先级）

### 1. Provider Registry + 便宜优先模型路由 + 兜底链

**它怎么做**：SquillaRouter 在设备端把每一轮分到 C0-C3 档，按任务难度选最便宜
能处理的模型；`selector.py` 维护 primary + ordered fallback chain，一次调用失败
自动换下一家，并保留“直连单模型”模式，路由可随时关闭。

**我们现状**：`src/search/llm.ts` 只有 `createLightClient` / `createHeavyClient` /
`createVisionClient`，全部是 DeepSeek OpenAI 兼容客户端，模型名靠 env 写死；
UI 已做出 DeepSeek/MiniMax/智谱模型切换器，但后端没有 registry、没有 fallback。

**借法**：先把 `llm.ts` 升级成轻量 Provider Registry（provider/model/baseUrl/
apiKey/timeout/fallback），UI 切换器只改“当前路由配置”；再按现有意图路由的
难度信号分 3 档（日常问答 / 中等检索合成 / 重推理代码），便宜档优先，失败按
fallback 链切换。模型路由决策写入 trajectory + route-case，为数据飞轮留底。

**前置**：`.env` 增加三厂配置；llm.ts 增加 `resolveProvider`；测试覆盖 fallback。

### 2. 单一共享 TurnLoop（CLI/UI/API 行为一致）

**它怎么做**：所有入口——Web UI、CLI、聊天频道——都跑同一个 TurnRunner，
工具分发、重试、决策日志完全一致。

**我们现状**：`pipeline()` 已是 CLI 主链路，但 `ui/prototype` 还是独立前端模拟，
存在“UI 演示一套、CLI 行为一套”的风险。

**借法**：UI 继续做薄客户端，后续把三栏（工程开发 / 知识咨询 / 生活助手）只映射为
`answer(query)` 的上下文/模式参数，不复制管道逻辑；所有入口的决策日志统一走
trajectory。这正好落实需求文档 §4.2 / §6.3 的 `answer(query)` 稳定边界。

### 3. Harness-Native Data Flywheel（路由失败自动沉淀校准样本）

**它怎么做**：官方技术报告核心是“把日常 agent 流量变成自我改进数据飞轮”：
router 每次决策都落盘特征与结果，失败/低置信自动成为训练样本。

**我们现状**：已有 `trajectory.jsonl` + `route-case-store` + `route:apply-calibration`，
但“自动把低置信/澄清/用户反馈转成校准样本”还没有闭环。

**借法**：模型路由决策也写入 route-case（query / 难度档 / 所选 provider /
fallback 是否触发 / 结果好坏）；用户 accept/reject/correct 自动进校准队列；
每次基准重跑可对比“路由决策变化”。现有校准脚本只需扩展 record 字段。

### 4. 记忆双通道召回（关键词 + 语义，低分兜底）

**它怎么做**：SQLite FTS 全文检索 + sqlite-vec 语义检索双通道；向量分低时强
关键词匹配仍可用；记忆条目与 session 导出分开；可选指数衰减与 “dream” 合并
（候选 → 证据 → quarantine → apply）。

**我们现状**：已有 L0 MemoryCore + L1 distill + ExperienceManager，但主要是
关键词/顺序召回，缺语义通道和清理衰减策略。

**借法**：项目侧加 SQLite FTS（关键词）+ embedding（语义）双召回；向量低分时
关键词仍可用；记忆条目带 source/时间戳/置信度；L2 蒸馏参考 dream 的
“候选 → 证据 → 隔离 → apply”流程，避免直接把噪音写进长期记忆。

### 5. 分层沙箱 + 拒绝账本

**它怎么做**：Standard / Strict / Locked 三档策略 + 权限矩阵；连续拒绝后自动
暂停自主运行；拒绝有归因（denial attribution），被拒绝的输出会清理。

**我们现状**：`src/security/sandbox.ts` 只有 `projects/ sandbox/ outputs/` 根目录
白名单 + 审计日志。

**借法**：把沙箱升级为可配置档位（普通 / 严格 / 锁定），并加一个简单的
“连续拒绝计数”：短时间多次越界或高危操作时，要求人工确认或暂停自主执行。

### 6. 工具结果压缩 + 上下文预算 + Compaction

**它怎么做**：tool 原始结果存 runtime view，模型只看到 bounded preview /
`tool_result_handle`；接近上下文预算自动 compact 成“目标 / 状态 / 未完成步骤 /
已知失败 / 下一步”摘要。

**我们现状**：搜索页正文最多 5000 字直接塞给 LLM，长会话没有上下文预算和压缩。

**借法**：先做“bounded tool preview”（截断 + 结构化投影），再在需求文档 §8.3
工作记忆开发时落地 compaction，避免未来长任务被大结果挤爆上下文。

### 7. Skill 按需加载 + 环境可用性门控

**它怎么做**：Skill 不常驻 prompt，按轮次做关键词/语义检索 + eligibility 门控
（环境、依赖、OS），只在任务需要时注入。

**我们现状**：19 项 Skill 全注册、按需 execute，但 prompt 注入仍可能全量带出；
`skillLifecycle.findBest` 已有雏形。

**借法**：给 Skill 加 eligibility 元数据（依赖 bin / env / 平台），每轮先过滤
再注入，降低 token 与误触发。

## 需裁剪（只借思想，不抄实现）

1. **SquillaRouter 的 LightGBM/ONNX 本地分类器**：一人公司没有必要维护模型资产
   和 ONNX 运行时；先复用现有规则 + 轻模型分类，等数据量大到能证明收益再上 ML。
2. **B5 Ensemble（4 proposer + 1 aggregator）**：成本是 N+1 次模型调用；当前只在
   “低置信 / 高风险”场景按需做双模型交叉验证，不做全量 ensemble。
3. **20+ Provider 全支持**：只做 DeepSeek / MiniMax / 智谱 + OpenAI 兼容抽象，
   不追求厂商全覆盖。

## 不建议照搬

- **迁移整套 WebUI/Electron/控制台**：我们已有三栏 UI 原型，只借“薄客户端 + 统一
  loop”思想，不迁移前端框架。
- **cron/scheduler 与 Feishu/Telegram 等聊天频道**：不是当前一人公司痛点，等
  核心闭环稳定后再议。
- **router_dynamic 复杂评分权重/槽位模板**：当前规则 + 轻分类足够，等数据积累后
  再考虑评分式动态选模型。

## 审阅结论

OpenSquilla 最值钱的三样：**按任务难度选模型并便宜优先**、**所有入口共用同一
TurnLoop**、**路由决策自动变训练数据（数据飞轮）**。它们分别对应我们的模型切换器、
CLI/UI 双皮问题、路由校准闭环，都是下阶段可以直接落地的。复杂 ML 路由、B5 集成、
全渠道接入属于过度设计，暂缓。

## 结果

- 审阅产物：本文 + `docs/borrowed-designs.md` 新增 OpenSquilla 段 + 需求文档附录 A E103。
- 未改动：`opensquilla/` 外部仓库、`src/`、`ui/` 代码。
- 验证：`npm run build`、`npm run test:all`、doc-lint 通过（本次仅文档变更）。
- 提交：E103 文档提交；推送 Gitee + GitHub。
- 遗留：Provider Registry 与模型路由为下一步实现项，落需求文档 §13 与 PARAM 后再编码。
