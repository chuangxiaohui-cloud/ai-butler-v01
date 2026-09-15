# 推进计划：PM 角色 Xmind 技能（E340，2026-09-05）

> 关联：owner「项目经理一般要会操作 Xmind，加个技能」。方向已确认：做「生成/读取 .xmind 文件」的预置 Skill（scope B：生成 + 读取回文本大纲），不驱动 Xmind GUI（无官方 CLI，UI 自动化脆）。Xmind 文件 = zip 包（content.json 存树），仓库已依赖 jszip，零新依赖。
> 立项裁决：owner「好！那就搞xmind」；实现范围按推荐 B + 预置 Skill + 触发词（思维导图/Xmind/脑图/WBS/任务拆解）。

## 目标

新增预置 Skill `pm-xmind`（executor `pm_xmind`，走与 calendar-skill 相同的「路由→confirm 写类确认卡→批准后恢复执行→skill 落盘」链路）：把文本大纲（WBS 编号或缩进）生成为 Xmind 可打开的 `.xmind`，落盘 `outputs/pm-xmind/` 进产物区；同时支持把已有 `.xmind`（沙箱路径或附件）读回文本大纲。全程本地确定性执行、零外部模型、零新增依赖。

## 计划

1. 纯格式核心 `src/skills/pm-xmind/format.ts`：大纲→树解析（WBS 编号 / 缩进 / `-` 列表）、树→文本大纲、jszip 组包（content.json/metadata.json/manifest.json）、解包取首 sheet 根话题转大纲、文件名清洗。
2. Skill `src/skills/pm-xmind/index.ts`：`createPmXmindSkill({ outDir? })`——生成（有结构）写盘、读取（沙箱路径/附件 .xmind）回大纲、结构缺失给使用引导（不写盘）；写盘过沙箱门禁 + 审计。
3. 意图/路由：`src/agent/intent-feature.ts` 增 actionType `xmind` + 触发词（思维导图/xmind/脑图/mind map/WBS），置于 extract_structure/create 之前；`routing-table.ts` 增 R_XMIND（lens project_manager、executor pm_xmind、baseConfidence 落 confirm 带）；`executors.ts` 登记 available。
4. 确认闸：`src/escalation/confirm-gate.ts` CONFIRM_WRITE_EXECUTORS + EXECUTOR_PROFILE（label「处理 Xmind 思维导图（读写本地文件）」risk low costKind local→¥0.00）；pipeline 的 .xmind 读取路径用 originalQuery。
5. 注册与清单：registry EXECUTABLE_SKILLS + `src/skills/README.md`；同步 registry/lifecycle 计数断言 24→25。
6. 测试与文档：format/skill/router/confirm 单测；附录 A E340；本计划；目录地图；09-04/09-05 交接。

**验收标准**

- `npm run build` 绿；新增单测全绿 + 既有受影响断言更新后回归绿；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 test:all/bench 不自主跑（成本纪律）。
- 手动验收：聊天输入带结构的拆解文本（第一行中心主题 + WBS/缩进行）→ 出 confirm 卡（低风险 ¥0）→ 批准后产物区出现 .xmind 且回复带大纲预览；用 Xmind 打开确认结构正确；读已有 .xmind 回大纲。

## 执行过程

### 改动

- `src/skills/pm-xmind/format.ts`（新）：大纲解析（WBS 编号/缩进/- 列表，引导句剔除）、树↔文本、jszip 组包（content.json/metadata.json/manifest.json）/解包（兼容根数组或对象）、文件名清洗、唯一 id。
- `src/skills/pm-xmind/index.ts`（新）：`createPmXmindSkill`——生成（含结构）落盘 `outputs/pm-xmind/`（guardSkillOutputPath + 审计），读（附件/沙箱路径 isPathAllowed）回大纲，无结构给使用引导不写盘。
- 意图/路由：`intent-feature.ts` ACTION_TYPES + prompt 枚举增 `xmind`，触发词置于 analyze/office/create 之前（正文“分析/对比”不再抢意图），问句守卫让位 QA、带大纲结构/做成…脑图实义不误让；`routing-table.ts` 增 R_XMIND（lens project_manager、intent xmind、executor pm_xmind、strict actionType-only、base 0.55 + boost 0.15 落中带 confirm）；`executors.ts` 登记 `pm_xmind` available。
- 确认闸：`confirm-gate.ts` 写类清单 + EXECUTOR_PROFILE 增 `pm_xmind`（label「处理 Xmind 思维导图（读写本地文件）」risk low、costKind local=¥0）。
- 注册/清单：registry EXECUTABLE_SKILLS 增 `createPmXmindSkill()`（25 项）；README 原生 Skill 表加行；pipeline 对 pm-xmind 直传原句并把 `.xmind` 加入产物路径识别；`files.ts` 面板 kind 标「思维导图」。
- 测试：pm-xmind 5 条 + router-v2-xmind 5 条新增；registry/lifecycle/confirm-gate 计数与清单 24→25 同步。
- 文档：需求文档 §12.2 行 + 附录 A E340；本计划结果；code-directory Skill 目录 23→24；今日交接。

### 遇到的问题

- 触发词只放在原 summarize/extract_structure 之前仍不够：大纲正文含“分析/方案/对比/安排”会先命中 analyze/office_daily/schedule，导致落错执行器 → 把 xmind 规则前移到 analyze 之前 + 问句（怎么做/是什么）守卫让位 qa，并保留“带大纲结构行或做成…脑图实义短语不误让”。
- Xmind 文件格式：content.json 顶层在真实文件里可能是数组或对象两种形态，组包按 Xmind 2020+ 数组 sheet.rootTopic 写、解包两种都兼容（测试用 jszip 往返验证）。
- 写类 confirm 与“读 .xmind”共用同一 R_XMIND + 低风险闸门（读取也会出一张低风险 ¥0 confirm 卡）；skill 内部按 query 自判读/生成，避免路由拆分复杂化。

## 结果

- `npm run build` 绿；定向单测 pm-xmind 5/5 + router-v2-xmind 5/5 + registry/lifecycle/confirm-gate/router-v2 回归全绿 + pipeline 68/68 + routing-enum 集成 1/1；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。全量 `test:all`/bench 未跑（成本纪律）。
- 能力：PM 在对话里贴大纲即可让 AI-Butler 落盘 Xmind 文件（产物区可见），也可读回大纲；写操作走低风险 confirm 卡（¥0）。
- 遗留：真实 UI 冒烟（gateway + 5173）与 Xmind 打开核对待 owner 手动验收；未提交（并入现有未提交批次，待 owner 拍板）。
