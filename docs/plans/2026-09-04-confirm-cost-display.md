# 计划：confirm 挂起带风险分级与「本次操作预估成本」（E334，2026-09-04）

> 关联：E324（confirm 真阻断三刀）遗留候选 / 需求 §14.5 表行「§2.3 人类裁决 confirm → 高风险操作确认面板应显示“本次操作预估成本”（候选，未实现）」。
> 前置裁决：owner 2026-09-04 拍板成本口径 =「预估成本 = 本次挂起操作批准后会发生的外部调用费用（复用 §COST 单价与调用量估算，展示上界金额）；本地确定性执行直接明示 ¥0」。

## 背景与缺口

E324 三刀收口后，确认挂起文案只有「⏸ 你让我… 我不会擅自执行 + 回复执行/取消」。裁决面板与对话内确认卡均复用同一 question 文本，因此：
- 不展示该写操作的风险等级（低/中/高）；
- 不展示「本次操作预估成本」——执行前用户看不到批下去大概花多少钱。

## 方案（最小改动）

- `src/escalation/confirm-gate.ts`：写类执行器清单由 label 表升级为 profile（label + risk + costKind）。
  - 风险分级（按副作用外发性与可逆性）：calendar_skill=低；project_writer/content_writer/project_packager=中；office_daily/im_dispatch=高。
  - 成本类别：content_writer/office_daily=content_generation（批准后经 LLM 生成内容）；其余=local（本地确定性执行）。
  - 新增 `executorRiskGrade()` 与 `estimateConfirmCostYuan()`；`buildConfirmHoldAnswer()` 追加一行「风险等级：X ｜ 本次操作预估成本：…」。
  - 估算口径：local → ¥0.00（本地确定性执行，无外部模型调用）；content_generation → 默认内容模型 deepseek-v4-flash 单价（E317 表），输入按缓存未命中 + 输出按高峰价（最贵档 = 上界），token 上界读新增 [P-149]（输入 4000）/ [P-150]（输出 2000），分向上取整展示「≤ ¥0.03」。
- `src/config/params.ts`：PARAMS + PARAM_IDS 增 `confirmContentGenInputTokens`/`confirmContentGenOutputTokens`（P-149/P-150）。
- 展示落点零 UI 改动：聊天确认卡与裁决面板都渲染 question 文本，风险/成本随挂起文案透出；decision-log 与通知 detail 一并携带。
- 需求文档：§5 注册表补 P-149/P-150 行；§14.5 表行去掉「候选，未实现」并标 E334；附录 A 增 E334 登记。
- 计划文档：本文件；09-04 交接补 E334 小节与链接。

## 验证计划

- `npm run build`；定向单测（dist 后）：confirm-gate 新增断言——六类执行器文案都含「风险等级/本次操作预估成本」；local 类含 ¥0.00；content_generation 类含「≤ ¥0.03」；风险标签映射正确。跑 dist/escalation/confirm-gate.test.js + dist/search/pipeline.test.js（防挂起文案契约回归）。
- `npm run doc-lint` 0 FAIL 0 WARN（C8 需 params 两新 key 在代码被引用——confirm-gate 使用即满足）。
- 全量 test:all/bench 不跑（成本纪律）；真实 UI/桌面冒烟留 owner。

## 结果

已实现（owner 口径拍板后本日落地 E334）：`src/escalation/confirm-gate.ts` profile（label+risk+costKind）+ executorRiskGrade()/estimateConfirmCostYuan() + 挂起文案追加「风险等级：X ｜ 本次操作预估成本：…」行；`src/config/params.ts` PARAMS+PARAM_IDS 补 P-149/P-150。验证：`npm run build` 绿；confirm-gate 定向 2/2 + pipeline 68/68；`npm run doc-lint` 0 FAIL 0 WARN（150 参数 / 77 key）；零外部 LLM/API（¥0）。需求 §5/§14.5/附录 A E334、code-directory、09-04 交接已同步；已提交 `4ee3548`（2026-09-04，随 e2e A4/B/C 验收回填批次）；A4 冒烟 owner 复验通过，见 e2e 清单结果记录。
