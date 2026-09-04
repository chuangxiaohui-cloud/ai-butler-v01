# 推进计划：confirm 恢复执行钉死原裁决 + reminder 市场 Skill 收窄（E330）

> 日期：2026-09-04 · 分支：v0.2b · 状态：已完成
> 承接：owner「按 A+B 开工」——E329 手动验收句「帮我安排明天下午3点的周会，提前10分钟提醒」批准后没建日历事件，
> 反被市场 reminder Skill 抢走执行成一次性提醒（message 残留「安排的周会，提前10分钟」），回执还拼进 git status 噪音。

## 目标

1. 批准恢复执行回到被批准时的 executor/intent，不被恢复路径的二次路由抢走（A 根因）。
2. 市场 reminder 不再把 dirty git 状态拼进回执、触发词不再用裸「提醒/每天/每周」抢日历口语句（B）。

## 改动

### A：恢复执行钉死原裁决动作

- `src/escalation/decision-log.ts`：`resume` 载荷增 `intent?`（E324 挂起登记用，第二刀类型已含 executor）。
- `src/search/pipeline.ts`：E324 挂起写 `resume.intent`；`PipelineOptions` 增内部 `confirmResumeExecutor/confirmResumeIntent`；
  聊天批准递归与 gateway 裁决恢复都转发这两个字段；E324 拦截返回后新增 E330 钉死块——恢复执行强制回到原 executor/intent、
  `searchNeed=false`；市场 Skill 直连块（E243）加 `!opts.confirmResume` 守卫，恢复路径不再二次命中市场触发词。
- `src/gateway/app.ts`：`POST /api/decisions/:id` 批准恢复把 `confirmResumeExecutor/confirmResumeIntent` 透传给 pipeline（回执载荷类型同步）。

### B：reminder 市场 Skill 收窄 + 输出清洗

- `configs/market-skills/reminder/manifest.json` + `data/market-skills/reminder/manifest.json`：
  删除调试遗留 `verify: ["git status --short"]`（runner 每次执行都跑 verify，把 dirty git 状态拼进回执）；触发词收窄为
  定向词 `提醒我/设提醒/设置提醒/查提醒/我的提醒/查看提醒`，移除裸 `提醒/每天/每周`（防抢日历口语句）。
- `src/skills/market/nl-router.ts`：`stripNpmBanner` 改逐行剥离（兼容 Windows `\r\n` 与横幅前空行）。
- `src/skills/market/reminder.ts`：message 清洗追加「帮我/安排/今天/明天/后天」及「，提前N分钟提醒」从句剥离，
  并清前导「的」与尾部标点，避免残句（如「安排的周会」）混进提醒内容。

## 结果

- 验证（全程零外部 LLM/API，¥0）：`npm run build` 绿；定向单测 pipeline 68/68（新增 E330 回归：恢复执行不再调用市场 Skill runner、
  按被批准 executor 分发；E324 挂起用例补断言 `resume.intent=create_calendar`）、reminder 7/7、nl-router 36/36、
  decision-log 4/4、calendar-skill 16/16、market runner/manifest/installer + gateway 69/69；`npm run doc-lint` 0 FAIL 0 WARN。
  全量 `test:all`/bench 未跑（成本纪律）。
- 文档：需求文档附录 A E330 登记；本计划；09-04 交接追加轮。
- 提交：未提交（延续工作区待统一确认批次）。
