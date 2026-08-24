# 推进计划：架构审计中期批·第十批（B2 + B3）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

校准回路与 LLM 规则提案的质量治理：B2 `confidence-calibration.ts` 两个系统性偏差——
① percentile 用 `Math.floor(p*n)`，小样本（n=4, p=0.75）取最大值而非 75 分位，建议阈值
方向性偏激；② `Math.max(现值, 建议值)` 棘轮——阈值只升不降，全量历史样本无时间窗，早期
一条误标把 Low 永久钉在 clamp 上限，回路不收敛。B3 `llm-rule-proposer.ts` 的
`confidenceBoost` 仅 `Number.isFinite` 即接受（可 0.9/负值），进 ROUTING_TABLE 后直接支配
排序；确定性路径固定 0.15，LLM 路径无 clamp，不对称。

## 计划

1. B2 `src/agent/confidence-calibration.ts`：percentile 改 nearest-rank
   （`Math.ceil(p*n)-1`）；去掉 `Math.max` 棘轮——建议阈值按样本分位双向收敛（clamp 限定
   安全范围）；新增 [P-119] 30 天时间窗，只取窗口内样本，无时间戳旧样本视为窗口内；
   `CalibrationRecord` 增加 `timestamp?`；`current` 参数改为显式 `CalibrationParams`
   （只声明用到的三个阈值字段）。
2. B3 `src/agent/llm-rule-proposer.ts`：LLM `confidenceBoost` 夹到
   `[0, PARAMS.llmRuleBoostMax]`（[P-120] = 0.25，对齐确定性路径最大取值）。
3. 参数与文档：`params.ts` 注册 [P-119]/[P-120]；需求文档 §5 登记 + 附录 A E217。
4. 测试：新增 `confidence-calibration.test.ts` 5 条；`llm-rule-proposer.test.ts` 补 2 条；
   既有 apply-calibration / route-case-store 校准用例改近期时间戳（时间窗生效）。
5. 验证：build + 定向单测 + 全量 test:all + doc-lint 0 FAIL 0 WARN。

**验收标准**

- 小样本 75/25 分位不再取极值；阈值可双向收敛（当前 0.6 遇低分位样本建议下调）。
- 窗口外早期误标不参与建议；样本不足保持现值。
- LLM 提案 boost 恒在 [0, 0.25]，负值取 0、超界截断，不再支配排序。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- B2 `src/agent/confidence-calibration.ts`：`percentile` 改 nearest-rank；`calibrateThresholds`
  增加 `windowMs` 参数（默认 `PARAMS.calibrationWindowDays * 86400000`），按
  `record.timestamp` 过滤窗口（无时间戳保留）；低/高阈值建议改 `clamp(样本分位, 范围)`
  去掉 `Math.max` 棘轮；`CalibrationRecord.timestamp?`；新增 `CalibrationParams` 接口。
- B3 `src/agent/llm-rule-proposer.ts`：导入 PARAMS，`confidenceBoost` 夹到
  `[0, PARAMS.llmRuleBoostMax]`。
- 参数：`params.ts` PARAMS + PARAM_IDS 注册 [P-119] `calibrationWindowDays=30`、
  [P-120] `llmRuleBoostMax=0.25`。
- 测试：新增 `confidence-calibration.test.ts` 5 条（小样本 75 分位、双向收敛、时间窗排除
  误标、accept 25 分位、样本不足）；`llm-rule-proposer.test.ts` 补 2 条（boost 超界/负值）；
  `apply-calibration.test.ts` 与 `route-case-store.test.ts` 校准用例 timestamp 改近期。
- 文档：需求文档 §5 [P-119]/[P-120] + 附录 A E217；本计划；交接更新。

### 遇到的问题

- `PARAMS` 是 `as const`，测试里覆盖 `routeConfidenceLow: 0.6` 触发字面量类型冲突
  （TS2352/TS2322），`calibrateThresholds` 的 `current` 参数改为显式 `CalibrationParams`
  接口（number 类型）解决。
- 时间窗把既有测试的 `timestamp: 1` 旧样本全部排除（apply-calibration 2 条 +
  route-case-store 2 条失败），改用 `Date.now()` 近期时间戳回归。
- 分位修正后 accept 用例期望值按真实 `routeCandidateGap=0.15` 校准为 0.75。

## 结果

- 验证：`npm run build` 通过；定向单测 24/24（confidence-calibration 5 + proposer 5 +
  apply-calibration 2 + route-case-store 12）；`npm run test:all` 全量单测 671/672（1 skip）
  + 集成 15/15；`doc-lint` 0 FAIL 0 WARN（PARAM 110、C8 34 key、附录 946/950）。
- 测试：新增 7 条全绿；既有校准回路用例更新后回归通过。
- 提交：f575040（E217 B2/B3）
- 遗留事项：B2/B3 完成，剩余 S1-S3（SSRF 内网黑名单 / CDP 显式关闭 / sidecar 弱 key）。
