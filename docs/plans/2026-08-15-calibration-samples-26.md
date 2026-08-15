# 推进计划：路由校准样本扩到 26

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

把最近真实查询（ST 数据手册、立创商城、芯查查、半导小芯）的确认路由标记为 accept，继续积累路由校准样本，确认阈值提案稳定。

## 执行过程

- 当前反馈基线：22 条（accept 15 / reject 7）。
- 给 4 条 `pipeline` case 补 `accept`：
  - `STM32F103C8T6 数据手册`
  - `STM32F103C8T6 立创商城 数据手册`
  - `STM32F103C8T6 芯查查 数据手册`
  - `STM32F103C8T6 半导小芯 数据手册`
- 4 条路由均为 `secretary/web_search`，与真实问答行为一致。

## 结果

- 反馈样本：26/10（accept 19 / reject 7）。
- `route:apply-calibration` 提案仍为 `routeConfidenceLow 0.45 / routeConfidenceHigh 0.75`，稳定。
- 样本文件 `data/route-cases.jsonl` 为本地数据（gitignore），不随仓库同步。
