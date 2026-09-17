# 推进计划：澄清路径优先市场 Skill 触发词

> 日期：2026-09-16 · 分支：v0.2b · 状态：已完成

## 目标

修复「帮我写日报」等明确市场触发词被 `option_clarify` 抢先返回、导致 `market_trigger` 漏计、复用率虚低的问题。

## 结果

- `tryMarketSkillTrigger` 抽出共用；澄清早退前 `minTriggerLength=2` 优先命中。
- 单测：`pipeline: option_clarify 时仍优先命中市场 Skill 触发词（写日报）`；pipeline **82/82**。
- CLI：`npm run dev -- "帮我写日报"` → `skillName=docx-write`。
- `market_trigger` 事件 4→12；复用率 20.9%→21.5%（长期仍需有机使用抬升至 60%）。
