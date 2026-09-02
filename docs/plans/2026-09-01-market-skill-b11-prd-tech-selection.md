# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 11 批（PRD 模板 / 技术选型对比，E307）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏（`docs/plans/2026-08-26-maturity-accumulation-path.md`），按 v2.5 需求 §2.1 角色职责沉淀 2 个高频市场 Skill：产品经理「写 PRD」（prd-template）与系统架构师「技术选型」（tech-selection），复用 E260 `templates.ts` docx 底座 + E251 `@input` 输入通道，用户累积 Skill 32→34，登记附录 A E307。

## 计划

1. `templates.ts` 新增 `buildPrdTemplate`（六章节：背景与目标/用户与场景/功能需求/非功能需求/验收标准/里程碑与排期）与 `buildTechSelection`（五章节：选型背景/候选方案/对比维度/评分与结论/决策记录）→ verify: 单测结构断言
2. 薄 CLI `scripts/market-{prd-template,tech-selection}.ts` + package.json 两个 `market:*` 脚本 → verify: `npm run build` 绿
3. 2 个 manifest（command + input:query + 触发词只放「模板/生成」明确意图形式，防抢知识问答）本地安装（--yes）→ verify: `skill:market:run -- --list` 含 34 包
4. 触发词防误触单测（「PRD是什么」「STM32 vs ESP32 选型对比」等知识问法不命中）→ verify: nl-router 定向单测绿
5. 登记附录 A E307 + 今日交接文档 → verify: doc-lint 0 FAIL 0 WARN

**验收标准**

- 两个 Skill 真实执行全链 ok:true，docx 落沙箱
- `npm run maturity:check` 用户累积 Skill 32→34
- 防误触：裸「PRD/选型对比/技术选型」不命中（E301/E305 纪律延续）
- doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/skills/market/templates.ts`：新增 `buildPrdTemplate` / `buildTechSelection`（需求依据 §2.1 产品经理「写 PRD」、系统架构师「技术选型」）。
- `scripts/market-prd-template.ts` / `scripts/market-tech-selection.ts`：E251 `@input` 通道薄 CLI，复用 `writeTemplateDocx`。
- `package.json`：`market:prd:template` / `market:tech:selection`。
- `configs/market-skills/prd-template/manifest.json` / `tech-selection/manifest.json`：command 权限 + input:query + 中文触发词（均为 ≥3 字且带「模板/生成/写」明确意图）。
- `src/skills/market/templates.test.ts`（+3 条）+ `nl-router.test.ts`（+5 条，含 2 条防误触）。

### 遇到的问题

- 触发词需防抢知识问答：裸「PRD」「选型对比」「技术选型」会被子串匹配到「PRD是什么」「STM32 vs ESP32 选型对比」等知识问法（E301 教训）。故只登记带「模板/生成/写」的形式，且补防误触单测锁定。

## 结果

- 验证：两个 Skill 真实执行全链 `ok:true`——prd-template 输出 `智能家居网关-模板.docx`（PRD 六章节）、tech-selection 输出 `STM32 vs ESP32-模板.docx`（五章节+候选/维度/决策字段）。
- 测试：`npm run build` 绿；templates 17/17 + nl-router 18/18（合并 35/35）；`npm run maturity:check` 用户累积 Skill **34/50+**。
- 提交：未提交（owner 未要求）。
- 遗留事项：L2 仍需 Skill 50+（差 16）/ 验收样本 n≥30 / 复用率 60%。
