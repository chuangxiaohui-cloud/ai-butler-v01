# 推进计划：度量型问答并入 qa 提取词（E194）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成（E194）

## 目标

承接路由参数校准（`npm run route:calibrate`：阈值建议 0.45/0.75 与 P-80/P-81 一致，无规则候选可提），
修复规则侧度量型问句缺口：`X 是多少 / 多少钱 / 什么价位 / 多大 / 几位` 等不在 `QA_RE`，
`extractIntentFeatureRuleBased` 判定 `actionType=unknown`（走 R012 → confirm）甚至误入 create
（“开发板多少钱”因含“开发”被 create 抢走 → option_clarify）。目标是把度量型问句并入 qa，
命中 R016 → secretary/web_search 直答。

## 计划

1. `src/agent/intent-feature.ts`：`QA_RE` 并入度量型模式（是多少/多少钱/什么价位/价位多少/价格多少/
   价格是多少/什么价格/多大/几位/有多少/剩多少）；analyze 守卫增加业务评估豁免
   （`值不值/成本/收益` 命中时仍走 analyze，保住“这个方案成本多少，值不值”的选项式消歧）。
2. `src/agent/router-v2.test.ts`：旧断言 `openclaw最新版本号是多少 → unknown` 改为 `qa + direct`；
   新增度量型问句回归断言（版本号/主频/价格/面积/ADC 位数）；补“成本多少，值不值”仍走
   option_clarify 的守卫回归。
3. 验证：`npm run build` → 相关单测 → `npm run test:all` → `npm exec tsx scripts/doc-lint.ts`。
4. 文档：`bench/B-20260822-06-route-metric-qa.md` 确定性前后对照证据；附录 A 登记 E194
   （附录 950/950 已满，先压缩 E191 头体两行条目腾 1 行）；交接文档补记。

**验收标准**

- `openclaw最新版本号是多少`、`STM32F103C8T6 最大主频是多少`、`这个开发板多少钱`、
  `这款示波器什么价位`、`STM32最小系统多大面积`、`这颗芯片有几位ADC` 全部 `actionType=qa`、
  `decision=direct`、`intent=web_search`。
- `这个方案成本多少，值不值` 仍为 `analyze + option_clarify`（missing_referent），无回归。
- 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/agent/intent-feature.ts`：拆分 GENERIC_QA_RE / METRIC_QA_RE 合成 `QA_RE`（度量模式
  是多少/多少钱/什么价位/多大/几位等）；analyze 守卫改为「通用疑问词优先 qa + 度量词仅在无
  业务评估词 ANALYZE_EVAL_RE（值不值/成本/收益）时让给 qa」。
- `src/agent/router-v2.test.ts`：更新旧断言 + 新增回归用例。

### 遇到的问题

- **业务评估豁免过宽**：初版守卫对 `值不值|成本|收益` 全量豁免，导致「如何权衡成本和交期」
  （如何 + 成本）从 qa 直答回退到 analyze 澄清。改为拆分「通用疑问词 GENERIC_QA_RE」与
  「度量词 METRIC_QA_RE」：度量型问句仅在无业务评估词时才让给 qa，通用疑问词（如何/怎么等）
  维持原「问句优先 qa」；`如何评估这个方案的收益` 恢复旧行为 qa/direct。
- **PowerShell 中文引号解析问题**：`$new.Add("…“…”")` 被 PowerShell 当作字符串定界符，
  改用 here-string 拼接代码块。

## 结果

- 验证：9 条目标度量 query 全部 `qa + direct + web_search`（含 `开发板多少钱` 的 create 误抢修复）；
  样本库 37/37 度量型记录全部直答；全量 742 条决策差分无新增回退（5 条历史分歧不含度量模式）。
  证据：`bench/B-20260822-06-route-metric-qa.md`。
- 测试：`npm run build` ✓；agent 单测 119/119（router-v2 72/72，新增 3 条用例）✓；
  `npm run test:all` 全绿（单测 580/583 + 门控 1 跳过，集成 17/17）✓；`doc-lint` 0 FAIL 0 WARN（附录 950/950）。
- 提交：（待提交）
- 遗留事项：路由校准阈值 P-80/P-81（0.45/0.75）与校准输出一致，无需调整；`route-cases.jsonl`
  中 3 条历史分歧（BOM 封装确认等）留待后续真实样本复核。