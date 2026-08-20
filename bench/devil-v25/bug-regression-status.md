# 35 条系统级 Bug 状态与回归用例

> 状态基准：2026-08-17 新基线（E126）｜35/35 已修复
> 清单源：`bench/devil-v25/魔鬼训练_系统级故障Bug清单.csv`
> 验证依据：`bench/devil-v25/new-baseline-scores.csv` + `src/**/*.test.ts`

## 一、系统路由错误（BUG-001..024）

| Bug | 题号 | 当前状态 | 回归用例 | 验证依据 |
|-----|------|---------|---------|---------|
| BUG-001 | ET04 | ✅ 已修复 | `router-v2: 负样本 ET04 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-002 | ET20 | ✅ 已修复 | `router-v2: 负样本 ET20 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-003 | ET28 | ✅ 已修复 | `router-v2: 负样本 ET28 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-004 | SM03 | ✅ 已修复 | `router-v2: 负样本 SM03 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-005 | SM04 | ✅ 已修复 | `router-v2: 负样本 SM04 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-006 | SM05 | ✅ 已修复 | `router-v2: 负样本 SM05 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-007 | SM07 | ✅ 已修复 | `router-v2: EDA 工具对比 → web_search 而非 vendor 报价` | 全量重跑 web_search |
| BUG-008 | SM11 | ✅ 已修复 | `router-v2: 回归 BUG-008 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-009 | SM13 | ✅ 已修复 | `router-v2: 负样本 SM13 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-010 | SM29 | ✅ 已修复 | `router-v2: 负样本 SM29 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-011 | SM31 | ✅ 已修复 | `router-v2: 负样本 SM31 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-012 | EC03 | ✅ 已修复 | `router-v2: 缺功能信息写代码 → 澄清功能/语言` | 全量重跑 must_clarify |
| BUG-013 | EC07 | ✅ 已修复 | `router-v2: 负样本 EC07 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-014 | EC11 | ✅ 已修复 | `router-v2: 无参考设计画原理图 → 澄清` | 全量重跑 must_clarify |
| BUG-015 | EC19 | ✅ 已修复 | `router-v2: 回归 BUG-015 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-016 | EC21 | ✅ 已修复 | `router-v2: 回归 BUG-016 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-017 | EC22 | ✅ 已修复 | `router-v2: 综述字数不限 → 澄清范围/格式` | 全量重跑 must_clarify |
| BUG-018 | EC30 | ✅ 已修复 | `router-v2: 选技术栈 → qa/web_search` | 全量重跑 web_search |
| BUG-019 | P05 | ✅ 已修复 | `router-v2: Protel 还能用吗 → qa/web_search` | 全量重跑 web_search |
| BUG-020 | P10 | ✅ 已修复 | `router-v2: 回归 BUG-020 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-021 | C02 | ✅ 已修复 | `router-v2: 修正指令 → modify/execute 而非排期选项` | 全量重跑 execute |
| BUG-022 | C06 | ✅ 已修复 | `router-v2: GitHub 链接分析 → github_analysis skill` + `github-reader` 三个用例 | 全量重跑 github_analysis |
| BUG-023 | C08 | ✅ 已修复 | `router-v2: 回归 BUG-023 不再路由到执行型意图` | 全量重跑 web_search |
| BUG-024 | E39 | ✅ 已修复 | `router-v2: 明确单文件代码 → execute 直接执行` | 全量重跑 execute |

> C05 说明：E127 修复后，带路径的“打包 <目录>”会真实执行 `project-packager`，
> 不再被 pipeline 提前短路；CLI 实测 `M:\202608111\src\wiki` 成功产出 zip。

## 二、JSON 泄漏（BUG-025..031）

| Bug | 题号 | 当前状态 | 回归用例 | 验证依据 |
|-----|------|---------|---------|---------|
| BUG-025 | SM01 | ✅ 已修复 | `registry: toDisplayText 拦截 JSON 泄漏并输出友好文本` | 新基线无 JSON 直出 |
| BUG-026 | SM09 | ✅ 已修复 | 同上 | 新基线无 JSON 直出 |
| BUG-027 | SM18 | ✅ 已修复 | 同上 | 新基线无 JSON 直出 |
| BUG-028 | SM19 | ✅ 已修复 | 同上 | 新基线无 JSON 直出 |
| BUG-029 | EC28 | ✅ 已修复 | 同上 | 新基线无 JSON 直出 |
| BUG-030 | P08 | ✅ 已修复 | 同上 | 新基线无 JSON 直出 |
| BUG-031 | E40 | ✅ 已修复 | 同上 | 新基线无 JSON 直出 |

## 三、安全路由误匹配（BUG-032..035）

| Bug | 题号 | 当前状态 | 回归用例 | 验证依据 |
|-----|------|---------|---------|---------|
| BUG-032 | EC04 | ✅ 已修复 | `router-v2: 非法请求 → safety_refusal` + `emergency-reply: 破解 WiFi 返回合规拒绝而非救援` | 新基线 gate=safety |
| BUG-033 | EC12 | ✅ 已修复 | `emergency-reply: rm -rf 返回合规拒绝` | 新基线 gate=safety |
| BUG-034 | EC13 | ✅ 已修复 | `router-v2: 非法请求 → safety_refusal` + `emergency-reply: 破解 WiFi 返回合规拒绝而非救援` | 新基线 gate=safety |
| BUG-035 | EC26 | ✅ 已修复 | `router-v2: 手机进水 → property_emergency` + `emergency-reply: 手机进水返回财产止损步骤` | 新基线 emergency 且无溺水模板 |

## 四、维护说明

- 新增修复必须给对应 Bug 行补或更新“回归用例”。
- 全量重跑后用 `npm run compare:devil-v25` 复核，状态不允许凭单测“脑补”。
- 本表与 `魔鬼训练_系统级故障Bug清单.csv` 同步维护；题号以 CSV 为准。
