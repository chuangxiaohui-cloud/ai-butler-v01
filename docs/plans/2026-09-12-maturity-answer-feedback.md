# 推进计划：回复反馈接入成熟度指标

> 日期：2026-09-12 · 分支：v0.2b · 状态：完成（未提交）

## 目标

继续落实 §9.3：`maturity:check` 除 pipeline 路由标注外，也读取 `FeedbackStore` 每条回复的最新用户反馈。

## 计划

1. 先补聚合口径测试，锁定 route pipeline 样本与回复最新反馈的合并规则
2. `maturity:check` 接入 `FeedbackStore.latest()`
3. 运行构建、成熟度定向单测和 CLI 只读冒烟
4. 更新项目文档与当日交接

**验收标准**

- 回复 accept/reject/correct 全部进入成熟度反馈样本
- 同一回复多次改票只计 `FeedbackStore.latest()` 的最后结果
- route case 仍仅计 source=pipeline，既有口径不回退
- correct 继续按未接受样本计入分母

## 执行过程

### 改动

- `collectMaturityFeedbackSamples()` 统一合并 pipeline 路由标注与回复反馈；非 pipeline 路由样本继续排除。
- `maturity:check` 读取 `FeedbackStore.latest()`，因此同一用户、会话、消息多次改票只计最后一次。
- 回复 accept/reject/correct 沿用既有成熟度公式：`accept / (accept + reject + correct)`。

### 遇到的问题

- 当前工作区 `maturity:check` 输出没有出现新增回复反馈样本，说明本机持久化日志尚无有效回复反馈；接线由聚合单测与 FeedbackStore 最新值单测覆盖。
- `doc-lint` 仍仅被需求文档第 19 行既有 provisional 示例超期阻断，与本轮无关。

## 结果

- `npm run build`：通过。
- maturity + feedback-store 定向单测：10/10 通过。
- `npm run maturity:check -- --json`：只读冒烟通过，当前 L1、反馈 n=23。
- `git diff --check`：通过。
- 未运行 E2E / bench，零外部 LLM 调用，未提交。
