# 推进计划：问答体验修复——身份问答直达（你现在是什么模型 / 你是谁，E264）

> 日期：2026-08-27 · 分支：v0.2b · 状态：执行中

## 目标

用户桌面便携版实测反馈：问「你现在是什么模型」无回复（实际是走完整搜索管道，30s+ 且答非所问，
把 MiniMax 新闻当答案）。本批将身份类问题改为确定性直达：不搜索、不调 LLM 分类，秒回当前模型信息。

## 计划

1. **意图层**：`src/agent/intent-feature.ts` 新增 `self_identity` 动作类型 + 规则正则（置于 qa 之前）；
   `routing-table.ts` 新增 `R_SELF_IDENTITY`（secretary / knowledge_qa / searchNeed=false）。
2. **回答构建**：新增 `src/search/self-identity.ts::buildSelfIdentityAnswer`（modelSelection → 模型目录
   provider/label/档位；未选走 defaultTier）。
3. **管道**：`pipeline.ts` 在 routeV2WithLLM 前加确定性硬规则前置短路（免 LLM 分类）+ routeSelected 分支兜底。
4. **单测**：router-v2 +1、self-identity 新文件 +2、pipeline +1。
5. **文档**：附录 A 登记 E264；handoff 追加。

**验收标准**

- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。
- 真实端到端：身份问题 <1s 返回、evidence 0、随 modelId 联动。

## 执行过程

### 改动

- `src/agent/intent-feature.ts`：ACTION_TYPES + `self_identity`；ACTION_RE 在 qa 前插规则（你现在是什么模型/你是谁/你叫什么/介绍你自己 等）。
- `src/agent/routing-table.ts`：+`R_SELF_IDENTITY`（secretary / knowledge_qa / searchNeed=false / baseConfidence 0.65）。
- 新增 `src/search/self-identity.ts`：buildSelfIdentityAnswer（modelSelection → 模型目录 label/档位；未选走 defaultTier）。
- `src/search/pipeline.ts`：routeV2WithLLM 前置规则短路（免 LLM 分类）+ routeSelected self_identity 分支兜底。
- 单测：router-v2 +1、self-identity +2、pipeline +1。

### 遇到的问题

- 首版只在 routeSelected 分支处理，仍先过 LLM 意图分类（~7s）。定位到 `extractIntentFeature` 优先 LLM，改为确定性硬规则前置短路后秒回（44ms/12ms）。

## 结果

- 真实端到端（8788 新 gateway）：「你现在是什么模型」44ms、「你是谁」12ms，evidence 0，mode knowledge；modelId=light/heavy 分别驱动 deepseek-v4-flash/pro label 正确。
- 全量单测 1014/1015（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN；`maturity:check` 不变（Skill 32/50+）。
