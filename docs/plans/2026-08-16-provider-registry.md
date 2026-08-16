# 推进计划：Provider Registry + 模型分档路由（E104）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成
> 来源：OpenSquilla 借鉴审阅（E103）第 1 项。

## 目标

把 UI 模型切换器背后的能力真正落到后端：三厂（DeepSeek/MiniMax/智谱）OpenAI
兼容统一抽象，按任务难度便宜优先选模型，primary 失败自动 fallback，同时保持旧
`LLM_PRIMARY_*` / `DEEPSEEK_API_KEY` 单家配置行为不变。

## 计划

1. 拆分 `OpenAiCompatibleClient` 到 `src/search/llm-client.ts`，`llm.ts` 保持旧导出。
2. 新增 `src/search/llm-registry.ts`：三厂 Provider 定义、`LLM_PROVIDER_ORDER`
   顺序、角色解析、fallback 链（上限 [P-107]）。
3. 新增 `src/search/model-router.ts`：重档/中档/轻档分档规则（[P-105]/[P-106]）。
4. `llm.ts` 旧入口（light/heavy/vision）改走 registry；Stage 5 合成按档选模型。
5. `.env.example` 补三厂配置；新增 `scripts/bench-provider-router.ts` 本地 bench。
6. 补单测、登记需求文档（§5 PARAM / §6 / §13 / 附录 A E104）、更新 borrowed-designs
   与 progress-handoff，跑 build/test/doc-lint/bench，提交推送。

**验收标准**

- 旧配置下 `createLightClient/createHeavyClient/createVisionClient` 行为不变。
- registry：provider 顺序可控、缺 key 自动跳过、primary 失败自动切 secondary。
- 模型分档：execute/GitHub/文档写作走重档，普通问答走默认中档。
- `npm run build`、`npm run test:all`、doc-lint 全绿；bench:B-20260816-04 产出。

## 执行过程

### 改动

- 新增 `src/search/llm-client.ts`：OpenAI 兼容客户端与类型（原 llm.ts 内容迁移）。
- 新增 `src/search/llm-registry.ts`：三厂 Provider 定义、`LlmProviderRegistry`、
  `FallbackLLMClient`、legacy profile 兼容。
- 新增 `src/search/model-router.ts`：`resolveModelTier` 按 intent/actionType/图片文档/
  置信度分档；`params.ts` 新增 P-105/P-106/P-107。
- 修改 `src/search/llm.ts`：旧入口委托 registry，新增 `createClientForRole`。
- 修改 `src/search/stages/s5_synthesize.ts` + `pipeline.ts`：Stage 5 按 `modelTier`
  选模型，缺省仍为 heavy，行为不回退。
- 新增单测 `llm-registry.test.ts`（6 条）与 `model-router.test.ts`（5 条）。
- 新增 `scripts/bench-provider-router.ts` 与 `npm run bench:provider-router`；
  `.env.example` 补 `LLM_PROVIDER_ORDER` 与三厂 key/base/model 配置。

### 遇到的问题

- `llm.ts` 与 registry 双向依赖：把客户端类与类型抽到 `llm-client.ts`，registry 与
  llm.ts 均只依赖该层，无循环。
- 模型名默认值：DeepSeek 沿用 `deepseek-chat`；MiniMax/智谱默认值为 UI 已列型号
  （M3/M2.7、GLM-5.3/5.2/5-Turbo），全部可用 env 覆盖，待三厂 API 实测校准。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 308/308 + 集成 17/17 全绿；
  `npm run bench:provider-router` 产出 `bench/v01b-provider-router.md`
  （bench:B-20260816-04）；doc-lint 0 FAIL / 0 WARN。
- 提交：E104 已提交并推送 Gitee/GitHub。
- 遗留：三厂模型名/超时需真实 API 冒烟校准；模型路由决策写入 trajectory/route-case
  的数据飞轮闭环为下一步（E105 候选）。
