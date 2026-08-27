# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 5 批（提醒管理 / 图片文字提取，E258）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，把 日历/提醒管理 与 图片文字提取 固化为可执行
市场 Skill（复用 E251 `@input` 输入通道 + time-expression/ReminderStore 既有能力），用户累积
Skill 20→22，登记附录 A E258。

## 计划

1. **新增 `src/skills/market/reminder.ts`**：`parseReminderQuery`（查询提醒→list / 含时间→add，
   复用 `parseRepeatQuery`/`parseTimeExpression` 与 calendar-skill `parseLeadMs`；复杂周期诚实
   拒绝）、`runReminderCommand`（ReminderStore 落仓库 `data/reminders.db`，dbPath 可注入）。
2. **扩展 `src/skills/market/file-readers.ts`**：`ocrText`（office_image_ocr.py 普通模式 →
   沙箱 txt + 字符数 + 关键词命中）。
3. **单测扩展**：`reminder.test.ts` 新增 6 条 + `file-readers.test.ts` 新增 2 条。
4. **2 个薄 CLI**：`scripts/market-{reminder,image-ocr}.ts`（@input 通道）；package.json 增
   `market:reminder` / `market:image:ocr`。
5. **2 个 Skill manifest**：`configs/market-skills/{reminder,image-ocr}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
6. **真实文件验证**：reminder（新增 + 查询全链）、image-ocr（真实裁剪图 → 字符数 + 关键词命中）。
7. **文档**：附录 A 登记 E258；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 20→22。
- 2 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/reminder.ts`（新）：提醒解析 + 执行（list/add 双模式）。
- `src/skills/market/reminder.test.ts`（新）：6 条。
- `src/skills/market/file-readers.ts`：新增 `ocrText`；`file-readers.test.ts` +2 条。
- `scripts/market-reminder.ts` / `scripts/market-image-ocr.ts`（新）。
- `package.json`：新增 `market:reminder` / `market:image:ocr`。
- `configs/market-skills/{reminder,image-ocr}/manifest.json`（新）：command + input:query +
  中文触发词。
- 附录 A 登记 E258。

### 遇到的问题

- **消息残留周期词**：「每天早上9点提醒我站会」的时间表达式不含「每天」（周期词由 repeat 承载）→
  消息清洗增加 每天/每日/每周/每星期 剔除。
- **提醒库路径**：runner 沙箱 cwd 会导致 ReminderStore 默认路径指向沙箱 → 用 import.meta.url
  解析仓库根 `data/reminders.db`（独立于 cwd），dbPath 可注入便于单测。

## 结果

- 验证：2 个 Skill 本地安装（--yes）+ `skill:market:run` 全链 ok:true——reminder（「明天下午3点
  提醒我交周报」→ add 交周报 remindAt=明天 15:00；「查询我的提醒」→ 待触发 1 条）、image-ocr
  （真实裁剪图 → 759 字符 + 「编号」命中，txt 落沙箱）。
- 测试：单测 984/985（1 skip，新增 8 条）+ 集成 32/32；`npm run build` 通过；`doc-lint`
  0 FAIL 0 WARN（C8 49 key）；`maturity:check` 用户累积 Skill 20→22。
- 提交：本批与 E254-E257 累积批次一并提交（按用户指示「先开发，再累积提交」）。
- 遗留事项：GitHub 项目解读细分仍需先按 `docs/plans/2026-08-26-github-project-analysis.md`
  完成 skill 本体升级（LLM 合成 + 借入登记）；通过率/复用率观察继续按累积路径节奏记录。
