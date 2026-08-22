# Bench B-20260822-06：度量型问答并入 qa 提取词（E194）

> 日期：2026-08-22 · 对应 E194（路由参数校准 · 度量型问句直答）

## 目的

验证「X 是多少 / 多少钱 / 什么价位 / 多大 / 几位」等度量型问句在 `QA_RE` 并入后，
从 `unknown → R012 confirm`（或 `create → option_clarify`）改为 `qa → R016 secretary/web_search direct`；
同时确认业务评估词（值不值/成本/收益）与通用疑问词（如何/怎么）路由不回退。

## 实测记录（确定性，无网络）

| 项 | 值 |
|----|-----|
| 样本 | `data/route-cases.jsonl` 度量型问句 37 条 + 目标回归 9 条 + 守卫用例 9 条 |
| 工具 | `routeV2()` 规则特征（`extractIntentFeatureRuleBased`），无 LLM |

### 1) 目标 9 条前后对照

| query | 改前 | 改后 |
|-------|------|------|
| openclaw最新版本号是多少 | unknown / confirm | qa / direct web_search |
| STM32F103C8T6 最大主频是多少 | unknown / confirm | qa / direct web_search |
| 这个开发板多少钱 | create / option_clarify | qa / direct web_search |
| 这款示波器什么价位 | unknown / confirm | qa / direct web_search |
| STM32最小系统多大面积 | unknown / confirm | qa / direct web_search |
| 这颗芯片有几位ADC | unknown / confirm | qa / direct web_search |
| TPS5430的输入电压范围是多少 | unknown / confirm | qa / direct web_search |
| 北京大学今年本科线是多少 | unknown / confirm | qa / direct web_search |
| 七号电池电压是多少 | unknown / confirm | qa / direct web_search |

- 37 条样本库度量型记录全部覆盖（含已 accept 的 TPS5430 电压、七号电池电压、STM32 主频、arduino 版本号）。

### 2) 守卫用例（无回归）

| query | actionType | decision |
|-------|-----------|----------|
| 这个方案成本多少，值不值 | analyze（missing_referent） | option_clarify |
| 这个方案成本多少 | analyze（missing_referent） | option_clarify |
| 如何评估风险 | qa | direct web_search |
| 如何评估这个方案的收益 | qa | direct web_search |
| 帮我评估这个方案的收益 | analyze | analyze 路由 |
| 帮我检查一下这个PCB的安全性 | analyze | analyze 路由 |
| 对比一下这两家价格多少 | compare | direct web_search |
| 内存还剩多少 | qa | direct web_search |
| 查一下今天天气多少度 | query | direct web_search（裸“多少”未并入，不误伤） |

### 3) 全量 742 条决策差分

- 样本库度量型问句 37/37 全部 `direct`（34 条由 confirm/option_clarify 晋升，3 条原本已 direct）。
- 全量差分中「当前 clarify 且旧记录非 clarify」共 5 条，均为不含度量模式的历史记录分歧
  （BOM 封装确认 ×3、改口重说 ×1、泛化写码 ×1），与 E194 无关，非本改动引入。

## 结论

- 度量型问句全部直答（qa → secretary/web_search），`开发板多少钱` 的 create 误抢修复；
- 业务评估（值不值/成本/收益）与通用疑问词路由保持原行为，无回归；
- 与 `route:calibrate` 阈值建议（0.45/0.75 = P-80/P-81）兼容，无规则候选需新增。
