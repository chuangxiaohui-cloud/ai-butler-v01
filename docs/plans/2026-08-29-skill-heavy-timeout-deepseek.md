# 推进计划：Skill heavy 客户端超时对齐 P-122（DeepSeek 优先完成，避免落到智谱 429）

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成

## 背景

用户复测 github-reader 时 `synthesisError=智谱 429 余额不足`，要求「deepseek 还有钱，智谱没钱就切到 deepseek」。排查发现运行时 heavy 链本来就是 `deepseek → minimax → zhipu`（未设置 `LLM_PROVIDER_ORDER`，默认 DeepSeek 第一），但 `createSkillHeavyClient` 只放开 `totalBudgetMs=P-122` 90s，单 provider 超时仍用默认 30s；deepseek-v4-pro 长报告超过 30s 被切，随后兜底到 minimax/zhipu，最终撞上智谱 429。

## 计划

1. `createSkillHeavyClient` 传入 `timeoutMs=P-122`，让每个 provider 最多跑 90s → 验证：build + llm 单测
2. 补单测：单 provider 超时对齐 P-122 → 验证：`node --test dist/search/llm.test.js`
3. 文档：计划 + progress-handoff → 验证：doc-lint

## 结果

- **改动**：`src/search/llm.ts` `createSkillHeavyClient` 增加 `timeoutMs: PARAMS.skillGenerationBudgetMs`；`src/search/llm.test.ts` 新增 1 条断言。
- **验证**：`npm run build` 绿；`dist/search/llm.test.js` + `dist/search/llm-registry.test.js` 19/19 绿；运行时探针 chain `timeoutMs=[90000,90000,90000]`；doc-lint 0 FAIL 0 WARN。
- **说明**：未改 provider 顺序；DeepSeek 本来就在首位，本次是让它有足够时间完成，而不是 30s 被切后落入智谱 429。
- **提交**：未提交。
