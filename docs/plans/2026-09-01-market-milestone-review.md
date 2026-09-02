# 推进计划：市场 Skill 沉淀第 14 批——里程碑复盘自动触发（E312）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

按五角色审阅 P1（📅项目经理缺口1「里程碑复盘自动触发」）落地：新增市场 Skill `milestone-review`（生成 `milestone_review.md` 存入 L2 项目记忆），并在 `plan-validation` 增加「里程碑全部子任务状态为 done/已完成 → 自动触发信号」，闭环「子任务全 Done → 复盘」链路。用户累积 Skill 37→38。

## 计划

1. `src/skills/market/templates.ts`：`buildMilestoneReview(title, dateLabel)`——Markdown + YAML Frontmatter（id/type/project/milestone/status/created_at）+ 六章节（里程碑信息/完成情况/验收结果/问题与风险/经验沉淀 L2/后续行动）→ verify: templates 单测
2. `src/skills/plan-validation/index.ts`：`PlanTask.status?` 可选 + `checkMilestoneDone` 纯函数 + `validatePlanTasks` 返回 `milestoneDone` + `formatPlanValidation`/followUpAction 输出自动触发提示 → verify: plan-validation 单测
3. 薄 CLI `scripts/market-milestone-review.ts`（E251 @input，输出 `<标题>-里程碑复盘.md`）+ package.json `market:milestone:review` → verify: build 绿
4. manifest `configs/market-skills/milestone-review`（触发词带 模板/生成/写/做 明确意图；不含裸「里程碑/复盘」防知识问答被抢）本地安装 → verify: 市场包 38
5. 真实冒烟全链 ok:true + maturity:check 37→38 + doc-lint 0 FAIL 0 WARN

**验收标准**

- `buildMilestoneReview` 输出含 frontmatter（type: milestone_review/milestone/status: done）与六章节，无 undefined
- `checkMilestoneDone`：全部 done/已完成 → allDone=true；混有 todo → false 且 pendingTitles 正确；空数组 → false
- `validatePlanTasks` 全 done 时 `milestoneDone=true`，format 输出「自动触发里程碑复盘」，followUpAction 提示回复「生成里程碑复盘」
- 触发词：里程碑复盘模板/生成里程碑复盘/写里程碑复盘/做里程碑复盘/里程碑复盘一下/复盘模板/生成复盘/写复盘/阶段复盘模板；「里程碑复盘是什么」「什么是复盘」不命中
- 冒烟 ok:true + 市场包 37→38 + maturity 38/50+ + doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/skills/market/templates.ts`：`buildMilestoneReview`——frontmatter（id: milestone_review_001/type: milestone_review/project/milestone/status: done/created_at）+ 六章节，触发方式行写明「自动触发（plan-validation 检测到全部子任务 Done）」。
- `src/skills/plan-validation/index.ts`：`PlanTask.status?`（可选，非破坏）+ `checkMilestoneDone`（done/已完成 归一）+ `validatePlanTasks` 结果带 `milestoneDone` + `formatPlanValidation` 追加「✅ 里程碑全部子任务已完成 → 自动触发里程碑复盘」+ followUpAction 全部 done 时改为「回复『生成里程碑复盘』生成 milestone_review.md」。
- `scripts/market-milestone-review.ts` + package.json `market:milestone:review`（E251 @input；标题清洗去 帮我/请/生成/模板/里程碑/复盘 等触发词，输出 `<标题>-里程碑复盘.md`）。
- `configs/market-skills/milestone-review/manifest.json`（command + input:query + 中文触发词，裸词不登记）本地安装。

### 遇到的问题

- **触发词防误触**：裸「里程碑」「复盘」不登记——「里程碑复盘是什么」「什么是复盘」「阶段复盘怎么做」是知识问答，会被子串匹配抢走；只登记带 模板/生成/写/做/一下 的明确意图形式（E301/E305 纪律延续）。
- **自动触发边界**：plan-validation 是预置 Skill（SkillDeps 无 marketSkillRunner），「自动触发」落地为「检测 + 提示」——全子任务 Done 时结果带 `milestoneDone=true` 并明确提示回复「生成里程碑复盘」生成文档；真实 pipeline 自动链式执行市场 Skill 留作后续候选（需改 SkillDeps 契约，本轮不做过度设计）。

## 结果

- 验证：`npm run build` 绿；templates 23/23 + plan-validation 14/14 + nl-router 29/29（新增 8 条：模板结构 / 全 done 触发 / 未完成不触发 / 中文已完成+汇总 / followUpAction / 触发词命中×2 / 防误触）+ pipeline 61/61 无回归；doc-lint 0 FAIL 0 WARN；真实冒烟全链 ok:true——「生成网关告警项目的里程碑复盘模板」→ `网关告警项目的-里程碑复盘.md` 落沙箱（frontmatter + 六章节 + 自动触发说明）；maturity:check 用户累积 Skill **37→38**/50+。
- 测试：templates 23/23 + plan-validation 14/14 + nl-router 29/29 + pipeline 61/61。
- 提交：未提交（owner 未要求）。
- 遗留事项：P1 已清空；P2 剩余——proactive-assistant + notification-hub（秘书）；E309-后 confirm 阻断式（等 owner 拍板）；pipeline 级「plan-validation 全 done → 自动执行 milestone-review」链式接线（本轮为检测+提示，真实自动执行待 SkillDeps 扩展）。
