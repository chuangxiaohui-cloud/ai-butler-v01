# 借鉴设计登记（agent-skills / deepseek-harness / opensquilla）

> 用途：继续开发「一人公司 AI-Agent」前先读本页，避免优秀设计被漏掉，
> 也避免把外部框架误当成底座。
> 状态：持续更新。每次借入外部设计后，必须在此登记，并补齐测试与验收记录。

## 1. 总原则

1. **借思想，不借底座**：外部项目只做架构参考和能力清单，不直接依赖 v0.1 级 API。
2. **保持现有契约**：`answer(query) -> { answer, confidence, evidence[], gate_triggered }`
   是稳定边界；外部能力一律接在这层接口之后。
3. **文档宪法优先**：`一人公司AI-Agent需求文档_v2.5.md` 是需求权威；外部设计只有
   翻译成 AI-Butler 的 Skill / 接口 / 测试后才算落地。
4. **每次借用都要验收**：单元测试 + 全量测试 + 真实场景确认。

## 2. 已落地

### 2.1 agent-skills → delivery-workflow

- 文件：`src/skills/delivery-workflow/index.ts`
- 内容：需求访谈 / 规格先行 / 任务拆解 / TDD / 增量实现 / 代码审查 / 安全加固 /
  性能优化 / 系统化调试 / 安全上线 / 权威来源，共 11 条工作流。
- 接入：`engineer` 生成代码时自动注入；`content-writer` 生成 PRD/方案时自动注入。
- 状态：v0.1.0 已注册进 Skill 生命周期。

### 2.2 agent-skills → 工程流程约束

- `engineer`：生成代码前带上“规格、测试、增量、提交/回滚”约束。
- `content-writer`：写文档前带上规格先行流程，需求不清时输出“待确认问题”，不编造。

### 2.3 deepseek-harness → TrajectoryLog（append-only 轨迹日志）

- 文件：`src/trajectory/trajectory-log.ts`
- 接入：`src/search/pipeline.ts` 记录 `route / skill / search / synthesize / answer`
  五类事件，落盘 `data/trajectory.jsonl`。
- 价值：按 `sessionId` 回放一次完整问答；调试、评估、后续分叉都以此为底稿。

### 2.4 deepseek-harness → plan-validation（计划编译校验）

- 文件：`src/skills/plan-validation/index.ts`
- 内容：把计划解析为结构化任务，检查验收标准、验证步骤、依赖、涉及文件；
  文件超过 5 个提示拆细；缺关键字段判 `invalid`。
- 触发词：计划校验 / 校验计划 / 检查计划 / 任务清单。

### 2.5 opensquilla → Provider Registry + 模型分档路由

- 文件：`src/search/llm-client.ts` / `src/search/llm-registry.ts` / `src/search/model-router.ts`
- 内容：三厂（DeepSeek/MiniMax/智谱）OpenAI 兼容统一抽象；`LLM_PROVIDER_ORDER`
  控制便宜优先顺序；primary 失败自动 fallback（链上限 [P-107]）；按任务难度分档
  （重档 / 中档 / 轻档，[P-105]/[P-106]），Stage 5 合成按档选模型。
- 接入：`src/search/llm.ts` 全部旧入口签名不变；`.env.example` 补三厂配置；
  `npm run bench:provider-router` 本地验证。
- 状态：E104 已落地，需求文档附录 A 登记；bench:B-20260816-04。

## 3. 待借入（按优先级）

| 设计 | 来源 | 价值 | 前置条件 |
|------|------|------|----------|
| 工具执行 Hook 流水线 | Harness | `tools/pre-execute → execute → post-execute`，是审批/沙箱/超时/结果改写的插入点 | MCP 子 Agent / 文件沙箱落地 |
| Agent Preset + Profile | Harness | 一套运行时按场景组合工具、提示词和子 Agent，可映射三栏/多模式 | 路由与 Skill 生命周期稳定后 |
| Subagent Provider Seam | Harness | Spawn / Fork / 外部 Agent 共用同一子 Agent 接口，接 KiCad/Keil/FreeCAD | v1.0 MCP 子 Agent |
| Session Fork / Replay | Harness | 基于轨迹做分叉、恢复、回放 | TrajectoryLog 使用稳定 |
| 可回放上下文压缩 | Harness | 用 replacement 事件保留原始历史的压缩 | §8.3 工作记忆开发时 |
| 计划权限/异常分支校验 | Harness | 校验命令是否可执行、步骤是否越权、异常分支是否完整 | plan-validation 有真实使用反馈 |
| 单一共享 TurnLoop | OpenSquilla | UI/CLI/API 共用同一 pipeline，UI 只做薄客户端 | §4.2/§6.3 契约稳定后接网关 |
| 路由数据飞轮闭环 | OpenSquilla | route/model 决策 + 用户反馈自动进校准队列 | route-case-store 扩展字段 |
| 记忆双通道召回 | OpenSquilla | SQLite FTS + embedding 语义，低分关键词兜底 | §8 语义检索实现时 |
| 分层沙箱 + 拒绝账本 | OpenSquilla | Standard/Strict/Locked 三档 + 连续拒绝暂停自主执行 | sandbox.ts 档位化 |
| 工具结果压缩 + 上下文预算 | OpenSquilla | bounded preview + handle + compact 摘要 | §8.3 工作记忆开发时 |
| Skill 按需过滤 + eligibility | OpenSquilla | 每轮检索/门控后注入，环境依赖不可用则不注入 | Skill 元数据扩展 |

## 4. 不借 / 暂缓

- **整体迁移到 dsh**：v0.1 Developer Preview，API 会快速变化；AI-Butler 已有自己的
  路由、Skill、记忆和搜索体系，迁移等于重写主链路。
- **照搬 Web UI 三栏**：dsh 有 Web UI 和 UI 插件，但没有内置三栏模板；只参考组件
  与事件流，三栏仍要自建。
- **角色插件化直接抄**：dsh 没有内置“老板 / PM / 架构师 / 秘书”插件；它只有
  Agent Preset 机制，角色逻辑、人格层和意图分类仍要自己实现。
- **SquillaRouter ML 分类器照搬**：LightGBM/ONNX 本地分类器维护成本高，先沿用
  规则 + 轻模型分类，数据量大到能证明收益再上 ML。
- **B5 Ensemble 全量照搬**：4 proposer + 1 aggregator 是 N+1 次模型调用，只在
  低置信/高风险场景按需做双模型交叉验证。
- **20+ Provider / WebUI / 聊天频道整套迁移**：只做三厂 + OpenAI 兼容抽象；
  三栏 UI 保持自研薄客户端；cron/频道等非当前痛点。

## 5. 审阅结论摘要（2026-08-14）

1. deepseek-harness 是“架构规格库 / 施工蓝图”，不是“60% 已实现的技术合伙人”。
2. “一切皆插件”是理念；真正已实现的是 Cordis 插件树、append-only 会话日志、
   工具执行流水线、MCP Client、Web UI 插件机制。
3. 最值得借的三样：append-only 轨迹、工具执行 Hook 流水线、计划编译校验。
4. 文档宪法能保护需求稳定，但不能消除外部代码迁移成本；需要在外部与内部之间
   保留稳定适配层。

## 审阅结论摘要（2026-08-16 OpenSquilla）

1. OpenSquilla 最值钱的三样：**按任务难度选模型并便宜优先**、**所有入口共用同一
   TurnLoop**、**路由决策自动变训练数据（数据飞轮）**。
2. 分别对应我们的模型切换器、CLI/UI 双皮问题、路由校准闭环；第 1 项已落地
   （E104），另两项仍待推进。
3. 详见 `docs/plans/2026-08-16-opensquilla-review.md` 与
   `docs/plans/2026-08-16-provider-registry.md`。
4. 复杂 ML 路由、B5 集成、全渠道接入暂缓：当前规则 + 轻分类 + 三厂抽象足够，
   等真实数据积累后再评估。

## 6. 来源

- agent-skills：<https://github.com/addyosmani/agent-skills>
- dsh 官方架构文档：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md>
- dsh MCP Client：<https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/mcp/mcp-client>
- InfoQ 分析：<https://www.sohu.com/a/1062640652_122014422>
- OpenSquilla：<https://github.com/opensquilla/opensquilla>（本地 `opensquilla/` v0.5.3）
- OpenSquilla Agentic Routing 技术报告：<https://arxiv.org/abs/2607.11399>
