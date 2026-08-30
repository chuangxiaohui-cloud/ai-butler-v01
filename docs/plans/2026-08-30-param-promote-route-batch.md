# 推进计划：08-13 批 20 项 PARAM 晋升定稿（owner 拍板）

> 日期：2026-08-30 · 分支：v0.2b · 状态：已完成
> 关联：`docs/audit-t3/param-sample-30.md` §3.3 / `docs/audit-t3/r1-regression.md` / `docs/2026-08-30-progress-handoff.md` §待办 4

## 目标

2026-08-13 Phase 2 PARAM 迁移批 20 项 provisional@2026-08-13 将满 4 周超期检查（截止 2026-09-10）。owner 拍板：**整体晋升定稿**（纯文档变更，数值不动）。

## 范围

P-82 / P-84~P-86 / P-89~P-104 共 20 项（路由阈值 1 + 搜索 2 + 记忆 6 + 路由权重 8 + 路由 base/候选 2；不含 P-63——E197 已定稿；不含 P-80/P-81——E197 已定稿）。

## 依据（§0.3 五条件）

1. 附录 A 变更记录含 PARAM ID → 本条 E289。
2. 引附录 C 证据 ID → C.4 新增登记（B-20260822-06 route 差分 742 条 + B-20260822-08 route:calibrate 742 决策/26 反馈 + route-cases.jsonl 1086 条）。
3. 样本 n≥阈值 → 路由决策样本 1086 条 / 差分样本 742 条；阈值未另设，必要非充分由 owner 签认行使。
4. 附录 C 无相反证据 → E194 差分无新增回退；route:calibrate 无权重/阈值偏移建议（E196/E197）；reject n=7 < 15 未达 E197 重开口径。
5. owner 2026-08-30 签认（本次拍板）。

## 计划

1. 计划文档（本文件）。
2. §5.5 表 20 行状态列 provisional@2026-08-13 → 定稿（数值/约束不动）。
3. 附录 C.4 补一行路由证据登记（bench:B-20260822-06 / B-20260822-08 SHA-256）。
4. 附录 A 登记 E289（含五条件对照 + bench:na 理由）。
5. 同步 param-sample-30.md 13 行状态 + §3.3 拍板结果；交接文档待办 4 更新。
6. 验证：npm run doc-lint 0 FAIL 0 WARN；npm run build 绿。

## 执行过程

- §5.5 20 行：P-82 / P-84 / P-85 / P-86 / P-89~P-94 / P-95~P-104 状态列 `provisional@2026-08-13` → `定稿`（node 正则仅匹配 `| P-(...)|` 表格行，changelog 历史文本不动）。
- 附录 C.4 新增行：`08-13 批路由/搜索/记忆参数定稿证据 | bench/B-20260822-06-route-metric-qa.md + bench/B-20260822-08-provisional-review.md（git 跟踪）+ data/route-cases.jsonl 1086 条（data/，运行时）| <SHA-256> | E194/E196/E197 与 E289 定稿评估（route:calibrate 742 决策/26 反馈，reject 7 < 15 无偏移）`。
- 附录 A E289 条目插入 08-30 块顶部（E288 之前）。

## 结果

- 验证：doc-lint 0 FAIL 0 WARN；build 绿。
- 测试：无代码变更（纯文档治理），不跑 test:all。
- 提交：待收口（与冒烟回填/E284 复测/P-04 勘误同批）。
- 遗留：P-105~P-107（provisional@2026-08-16，截止 09-09）与 P-10（provisional@2026-08-24）、P-132~P-142（08-28/29 批）按各自倒计时处理；E289 后 08-13 批 provisional 债务清零。