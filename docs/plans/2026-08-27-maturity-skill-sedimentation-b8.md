# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 8 批（季度汇报 / 年度总结，E261）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，沉淀 高频报告 2 个市场 Skill：
季度汇报 / 年度总结（复用 E260 `templates.ts` 底座 + E251 `@input` 输入通道），
用户累积 Skill 26→28，登记附录 A E261。

## 计划

1. **扩展 `src/skills/market/templates.ts`**：`buildQuarterlyReport`（标题=日期+季度，章节：季度
   概述 / 关键成果 / 数据与指标 / 风险与问题 / 下季度计划）、`buildAnnualSummary`（标题=年份，
   章节：年度概述 / 重大成果 / 关键数据 / 经验与风险 / 来年展望）。
2. **单测扩展**：`templates.test.ts` 新增 3 条（季度模板结构/季度标签、年度模板结构/年份标签、
   quarterLabel 推算）。
3. **2 个薄 CLI**：`scripts/market-{quarterly-report,annual-summary}.ts`（@input 通道）；
   package.json 增 `market:quarterly:report` / `market:annual:summary`。
4. **2 个 Skill manifest**：`configs/market-skills/{quarterly-report,annual-summary}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
5. **真实文件验证**：2 Skill 全链 ok:true——quarterly-report（真实 query → 季度模板 docx 落盘 +
   python-docx 复核章节）、annual-summary（真实 query → 年度模板 docx 落盘 + 复核）。
6. **文档**：附录 A 登记 E261；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 26→28。
- 2 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/templates.ts`：新增 `buildQuarterlyReport` / `buildAnnualSummary` /
  `quarterLabel`。
- `src/skills/market/templates.test.ts`：+3 条（季度/年度模板结构 + quarterLabel 推算）。
- `scripts/market-quarterly-report.ts` / `scripts/market-annual-summary.ts`（新）。
- `package.json`：新增 `market:quarterly:report` / `market:annual:summary`。
- `configs/market-skills/{quarterly-report,annual-summary}/manifest.json`（新）：command +
  input:query + 中文触发词。
- 附录 A 登记 E261。

### 遇到的问题

- 无阻塞问题；季度/年度模板与 E260 同构，复用 writeTemplateDocx 落盘，唯一差异是标题标签
  （季度用 quarterLabel 推算，年度沿用 todayLabel）。

## 结果

- 验证：2 个 Skill 本地安装（--yes）+ `skill:market:run` 全链 ok:true——quarterly-report
  （「生成嵌入式项目季度汇报模板」→ 嵌入式项目-模板.docx 落盘，python-docx 复核 6 段落
  五章节 + 标题「2026年第3季度」）、annual-summary（「生成嵌入式项目年度总结模板」→
  嵌入式项目-模板.docx 落盘，五章节）。
- 测试：单测 1004/1005（1 skip，新增 3 条）+ 集成 32/32；`npm run build` 通过；`doc-lint`
  0 FAIL 0 WARN（C8 49 key）；`maturity:check` 用户累积 Skill 26→28。
- 提交：本批单独提交（按用户指示「先开发，再累积提交」）。
- 遗留事项：下一批候选——器件规格对比细分（扩展 part-spec-observe 双型号对比，依赖真实
  浏览器冒烟）或 报价单/采购申请 模板（复用 templates 底座）。
