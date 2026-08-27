# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 7 批（月度汇报 / 会议纪要，E260）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，沉淀 高频办公模板 2 个市场 Skill：
月度汇报 / 会议纪要（复用 E257 docx-write 的 `writeDocx` 底座 + E251 `@input` 输入通道），
用户累积 Skill 24→26，登记附录 A E260。

## 计划

1. **新增 `src/skills/market/templates.ts`**：`buildMonthlyReport`（标题=日期+月份，章节：本月
   概述 / 关键成果 / 数据与指标 / 风险与问题 / 下月计划）、`buildMeetingMinutes`（标题=日期+主题，
   章节：会议信息 / 议题 / 讨论记录 / 决议与行动项 / 待办与负责人）；`writeTemplateDocx`
   （模板文本 → 沙箱 .txt → `writeDocx` 落盘，run 可注入）。
2. **单测扩展**：`templates.test.ts` 新增 5 条（月度模板结构/日期、会议纪要结构/主题、
   writeTemplateDocx 成功链 + 失败归因）。
3. **2 个薄 CLI**：`scripts/market-{monthly-report,meeting-minutes}.ts`（@input 通道）；
   package.json 增 `market:monthly:report` / `market:meeting:minutes`。
4. **2 个 Skill manifest**：`configs/market-skills/{monthly-report,meeting-minutes}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
5. **真实文件验证**：2 Skill 全链 ok:true——monthly-report（真实 query → 月度模板 docx 落盘 +
   python-docx 复核章节）、meeting-minutes（真实 query → 会议纪要 docx 落盘 + 复核）。
6. **文档**：附录 A 登记 E260；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 24→26。
- 2 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/templates.ts`（新）：月度汇报 / 会议纪要模板构建 + writeTemplateDocx。
- `src/skills/market/templates.test.ts`（新）：5 条。
- `scripts/market-monthly-report.ts` / `scripts/market-meeting-minutes.ts`（新）。
- `package.json`：新增 `market:monthly:report` / `market:meeting:minutes`。
- `configs/market-skills/{monthly-report,meeting-minutes}/manifest.json`（新）：command +
  input:query + 中文触发词。
- 附录 A 登记 E260。

### 遇到的问题

- **writeTemplateDocx 中间稿**：初版误把空串当输入路径；已改为模板文本写临时 `-模板.txt`
  （输出 docx 同目录）再调用 `writeDocx`，临时文件随沙箱目录保留可复核。
- **package.json 编辑**：PowerShell `-replace` 多元素报错，改用 node 脚本读写 JSON 完成。

## 结果

- 验证：2 个 Skill 本地安装（--yes）+ `skill:market:run` 全链 ok:true——monthly-report
  （「生成嵌入式项目月度汇报模板」→ 嵌入式项目-模板.docx 落盘，python-docx 复核 6 段落
  五章节）、meeting-minutes（「生成产品评审会议纪要模板」→ 产品评审-模板.docx 落盘，五章节
  +会议信息字段）。
- 测试：单测 1001/1002（1 skip，新增 5 条）+ 集成 32/32；`npm run build` 通过；`doc-lint`
  0 FAIL 0 WARN（C8 49 key）；`maturity:check` 用户累积 Skill 24→26。
- 提交：本批单独提交（按用户指示「先开发，再累积提交」）。
- 遗留事项：下一批候选——器件规格对比细分（复用 part-spec-observe 浏览器通道扩展双型号对比）
  或 高频报告（季度汇报/年度总结）。
