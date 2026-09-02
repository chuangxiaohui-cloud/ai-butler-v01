# 推进计划：困难升级 + 人类裁决（§4.3.1 [P-47]/[P-48]/[P-16] + §2.3 裁决记录，E309）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

按五角色审阅结论（👑老板缺口1「决策留痕」+ 📅项目经理缺口2「失败重试/上报阈值」）落地 §4.3.1 困难升级与 §2.3 人类裁决记录：连续失败 [P-47] 停止重试主动求助、用户连续纠正 [P-48] 停止当前方向询问换思路、综合分 < [P-16] 明确「我不确定」、`option_clarify` 摆选项写入 `data/decision-log.jsonl`（裁决结果记录）。**非破坏式**：不改 confirm 语义与核心链路行为；「confirm 阻断式 + 批准/否决面板 UI」登记为待 owner 在 UI 阶段拍板。

## 计划

1. `src/config/params.ts` 补 [P-47]/[P-48]/[P-16]（§5 已定稿，代码侧同步）→ verify: build 绿 + doc-lint C8 引用通过
2. `src/escalation/decision-log.ts`：append-only `data/decision-log.jsonl`（trigger/options/decision/note/conversationId），复用 P15 JSONL 工具 → verify: 单测（追加/读取/limit/缺文件空）
3. `src/escalation/escalation.ts`：`isUserCorrection`（锚定开头防误伤）/`countConsecutiveCorrections`/三分支文案/P-47/P-48/P-16 消息 → verify: 单测（命中/不误伤/连续计数/中断归零）
4. `src/escalation/escalation-state.ts`：会话级连续失败计数（failure/success 事件，倒序遇 success 归零）→ verify: 单测（计数/阈值/归零/多会话隔离）
5. pipeline 接线：入口 P-48/P-47 检查、`option_clarify|must_clarify` 记 pending、low_confidence 且置信度 < [P-16] 加诚实声明、结尾失败/成功计数 → verify: build + test:all 全绿 + 定向单测
6. 登记附录 A E309 + 计划/交接文档 → verify: doc-lint 0 FAIL 0 WARN

**验收标准**

- 连续 2 次纠正 → 返回「哪里不对？我换个方向」并记 decision-log（escalation/escalate）
- 连续失败 ≥3 次 → 停止重试「建议求助」，gate=low_confidence，记 decision-log
- 澄清问题返回时记 decision-log（human_arbitration/pending）
- 搜索全空 + 低置信 < 0.4 → 答案含「我不确定」声明并记 low_confidence
- 成功回答清零连续失败计数；build + test:all + doc-lint 全绿

## 执行过程

### 改动

- `src/config/params.ts`：`failureEscalationThreshold: 3`（P-47）/ `correctionEscalationThreshold: 2`（P-48）/ `confidenceDropThreshold: 0.4`（P-16）。
- `src/escalation/decision-log.ts`：DecisionLog（P15 appendJsonl 复用，env `DECISION_LOG_PATH` 覆盖，import.meta.url 锚定 repo 根）。
- `src/escalation/escalation.ts`：isUserCorrection / countConsecutiveCorrections / escalationMessage（capability|information|tool）/ failureEscalationMessage / correctionEscalationMessage / lowConfidenceHonestMessage。
- `src/escalation/escalation-state.ts`：EscalationState（append-only failure|success 事件，consecutiveFailures 倒序遇 success 归零，failureThresholdReached，env `ESCALATION_STATE_PATH` 覆盖）。
- `src/search/pipeline.ts`：PipelineDeps 增 `escalation?`（测试可注入）；入口（路由前）P-48 连续纠正 / P-47 连续失败检查并记 decision-log；`option_clarify|must_clarify` 返回前记 human_arbitration/pending；low_confidence 且 confidence < [P-16] 时答案前置「我不确定」声明并记录；结尾搜索全空或合成失败记 failure、成功记 success（归零）。
- 测试：`src/escalation/*.test.ts`（10 条）+ `src/search/pipeline.test.ts` 新增 5 条（P-48 纠正升级 / P-47 失败升级 / 澄清记录 pending / 搜索全空记失败+P-16 诚实声明 / 成功清零）。

### 遇到的问题

- **FakeLLM 特判干扰路由**：pipeline 测试基座 FakeLLM 对意图提取 system prompt 中的特定词（如「文档」）返回特判 JSON，导致澄清 query 被路由成 direct 而非 must_clarify。解法：澄清用例注入纯文本 LLM（`complete → '根据证据，这是一个测试答案。'`）强制规则提取，路由结果确定。
- **confirm 阻断式未做（诚实登记）**：§2.3 人类裁决的「阻断执行 + 批准/否决面板」依赖 §4.1 三栏交互 UI，本轮只做记录侧（decision_log pending）；「confirm 是否改阻断式」需 owner 在 UI 阶段拍板，已登记交接文档后续候选。
- **P-48 跨轮语义**：CLI 与 gateway 共用 `conversationId` 持久会话（`data/session-context/`），连续纠正计数从会话轮次倒序计算，无需新增状态文件；P-47 需显式失败/成功事件故单独落 `data/escalation-state.jsonl`。

## 结果

- 验证：`npm run build` 绿；单测 1238/1239（1 skip，含新增 escalation 10 + pipeline 5）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 67→70 key）；真实行为由 owner 后续 `npm run dev` 验证（成本纪律不代跑 LLM 链路）。
- 测试：escalation 三模块 10/10；pipeline 61/61（含 5 条 E309）。
- 提交：未提交（owner 未要求）。
- 遗留事项：confirm 阻断式 + 批准/否决 UI（待 owner 拍板）；decision_log 的 approve/reject 回填（用户答复「批准/否决」时更新 pending→approve/reject）留待交互层。
