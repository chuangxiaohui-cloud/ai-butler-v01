# 推进计划：市场 Skill 沉淀第 12 批——PRD 证据链 + 用户故事模板（E310）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

按五角色审阅 P1 第一批（📝产品经理缺口1「竞品/需求证据链」+ 缺口2「本地任务文件 schema」）落地：PRD 模板强制 §9.1 证据链（每个结论带 `[Evidence: URL/Path]` + `[hard]`/`[soft]`），新增 Markdown + YAML Frontmatter 用户故事模板（供项目经理 project-writer 直接读取，如 `tasks/user_story_001.md`）。沉淀市场 Skill `user-story`，用户累积 Skill 35→36。

## 计划

1. `src/skills/market/templates.ts`：`buildPrdTemplate` 增证据链章节 + 新增 `buildUserStory`（YAML frontmatter + 用户故事/AC/任务拆解/证据链）→ verify: templates 单测
2. 薄 CLI `scripts/market-user-story.ts`（输出 `<标题>-用户故事.md`）+ package.json `market:user:story` → verify: build 绿
3. manifest `configs/market-skills/user-story`（触发词带「模板/生成/写/拆」明确意图，不含裸「用户故事/故事」防误触）+ `prd-template` 描述同步 → verify: 安装后市场包 36
4. 单测：templates（证据链强制 + 用户故事结构）+ nl-router（触发命中/自然问法/防误触）→ verify: build + 定向单测全绿
5. 真实冒烟 user-story 全链 ok:true + maturity:check 36/50+ → verify: doc-lint 0 FAIL 0 WARN

**验收标准**

- `buildPrdTemplate` 输出含「## 证据链」与 ≥5 个 `[Evidence: ]` 占位 + `[hard]`/`[soft]`
- `buildUserStory` 输出 YAML frontmatter（id/title/status/priority/type/product/created_at/epic）+ 用户故事/验收标准 AC/任务拆解/证据链 四章节
- user-story 触发词：用户故事模板/生成用户故事/写用户故事/写个用户故事/拆用户故事/故事拆解模板/拆解用户故事；「用户故事是什么」「如何写故事」不命中
- 冒烟 ok:true + 市场包 35→36 + maturity 36/50+ + doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/skills/market/templates.ts`：`buildPrdTemplate` 六章节→六章节+「## 证据链」（每章节 `[Evidence: URL/Path]` 占位 + `[hard]`/`[soft]` 标注，§9.1）；新增 `buildUserStory`（frontmatter 九字段 + 用户故事/验收标准（AC）/任务拆解（供项目经理读取）/证据链）。
- `scripts/market-user-story.ts` + package.json `market:user:story`（E251 @input，输出 `<标题>-用户故事.md`，Markdown 非 docx——本地任务文件走 project-writer 可读的 .md）。
- `configs/market-skills/user-story/manifest.json`（command + input:query + 中文触发词）；`configs/market-skills/prd-template/manifest.json` 描述同步（六章节→六章节+证据链）并重装。
- 测试：templates +2（证据链强制 / 用户故事 frontmatter+四章节+AC）、nl-router +3（模板命中 / 写个用户故事自然问法命中 / 防误触不命中）。

### 遇到的问题

- **触发词粒度**：「写用户故事」用子串匹配，用户说「帮我写个用户故事」不命中——补「写个用户故事」触发词（E305 自然问法纪律延续）；裸「用户故事/故事」不登记，防「什么是用户故事」类知识问答被抢。
- **输出格式**：user-story 输出 Markdown 而非 docx（§8 记忆系统解析 + project-writer 直接读取），不复用 docx-write 底座。

## 结果

- 验证：`npm run build` 绿；templates 19/19 + nl-router 23/23（新增 5 条）；doc-lint 0 FAIL 0 WARN；真实冒烟 user-story 全链 ok:true（`网关告警推送的-用户故事.md` 落沙箱，frontmatter + 四章节）；maturity:check 用户累积 Skill **35→36**/50+。
- 测试：templates 19/19 + nl-router 23/23（42/42）。
- 提交：未提交（owner 未要求）。
- 遗留事项：P1 剩余——接口契约机器可读（架构师缺口1）、里程碑复盘自动触发（项目经理缺口1）；P2——proactive-assistant + notification-hub（秘书）。
