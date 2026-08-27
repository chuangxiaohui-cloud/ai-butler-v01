# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 10 批（会议邀请函 / 通知公告，E263）

> 日期：2026-08-27 · 分支：v0.2b · 状态：执行中

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，沉淀 办公文书 2 个市场 Skill：
会议邀请函 / 通知公告（复用 E260/E261/E262 `templates.ts` 底座 + E251 `@input` 输入通道），
用户累积 Skill 30→32，登记附录 A E263。

## 计划

1. **扩展 `src/skills/market/templates.ts`**：`buildMeetingInvitation`（标题=主题（日期），四章节：
   会议信息（时间/地点/参会人/议题）/ 议程安排 / 参会确认 / 备注）、
   `buildNoticeAnnouncement`（标题=主题（日期），五章节：通知对象 / 通知事项 / 时间与地点 /
   注意事项 / 落款）。
2. **单测扩展**：`templates.test.ts` 新增 3 条（邀请函结构/字段、公告结构/字段、标题日期参数化）。
3. **2 个薄 CLI**：`scripts/market-{meeting-invitation,notice-announcement}.ts`（@input 通道）；
   package.json 增 `market:meeting:invitation` / `market:notice:announcement`。
4. **2 个 Skill manifest**：`configs/market-skills/{meeting-invitation,notice-announcement}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
5. **真实文件验证**：2 Skill 全链 ok:true——meeting-invitation（真实 query → 会议邀请函 docx 落盘 +
   python-docx 复核章节）、notice-announcement（真实 query → 通知公告 docx 落盘 + 复核）。
6. **文档**：附录 A 登记 E263；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 30→32。
- 2 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- 扩展 `src/skills/market/templates.ts`：`buildMeetingInvitation`（标题=主题（日期），四章节 会议信息/议程安排/参会确认/备注）、`buildNoticeAnnouncement`（五章节 通知对象/通知事项/时间与地点/注意事项/落款）。
- `src/skills/market/templates.test.ts` +3 条；新增 `scripts/market-{meeting-invitation,notice-announcement}.ts`（E251 @input 通道）；package.json +2 个 `market:*` 脚本。
- 新增 `configs/market-skills/{meeting-invitation,notice-announcement}/manifest.json` 并本地安装（--yes），status=installed。
- 附录 A 登记 E263（E262 锚点前插入，LF 无 BOM）；handoff 追加第 10 批。

### 遇到的问题

- 无阻塞问题；标题清洗中 `请` 触发词会吃掉「邀请/申请」内的字（如「会议邀请函」→「邀函」残留），为 E262 起的既有稳定行为，与历史批次保持一致，不额外处理。

## 结果

- 真实冒烟 2 Skill 全链 ok:true——meeting-invitation「生成产品评审会议邀请函模板」→ `sandbox/market-skills/meeting-invitation/产品评审邀函-模板.docx`（python-docx 复核 11 段落四章节）；notice-announcement「生成国庆放假通知公告模板」→ `sandbox/market-skills/notice-announcement/国庆放假-模板.docx`（python-docx 复核 10 段落五章节）。
- 全量单测 1010/1011（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN；`maturity:check` 用户累积 Skill 30→32。
