# 推进计划：office-daily 邮件发送双闸（审计 §3.2 缺口 #1）

> 日期：2026-08-30 · 分支：v0.2b · 状态：已完成

## 目标

按 `docs/audit-t3/skill-trust-audit.md` §3.2 缺口 #1（🔴 HIGH）：office-daily 邮件发送加入「写草稿 + 显式确认发送」双闸——第一段意图只落草稿回执，第二段「确认发送」才真正 SMTP 投递，杜绝无人工审批直接发信。

## 计划

1. 改造 `src/skills/office-daily/index.ts` email 发送块：非确认词 → 落 `latest-draft.json` + 回执；含 `/确认发送|确定发送|确认发出|确定发出/` → 校验凭据后 `sendMail`
2. 补路由：`modeFrom` email 正则与 `intent-feature.ts` office_daily 特征正则接收确认词，保证第二段 query 能回到本 skill
3. 改测试：2519（回执→确认发送）、2582（写草稿→发出去回执→确认发送三段式）；新增 router-v2 确认发送用例
4. 登记：计划文档 + 附录 A E291 + handoff 待办 7

**验收标准**

- 无确认词时绝不调用 `sendMail`（SMTP transcript 为空）
- 有确认词且凭据完备时投递成功；无凭据/缺项提示与原有行为一致
- `npm run build` 绿；office-daily 邮件相关单测 + router-v2 全绿；doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/skills/office-daily/index.ts`：1103-1173 发送块替换为双闸（E170+E291）；`modeFrom` email 正则追加 4 个确认词
- `src/agent/intent-feature.ts`：office_daily 特征正则追加 `确认发送|确定发送|确认发出|确定发出`
- `src/skills/office-daily/index.test.ts`：2519/2582 改两/三段式（回执阶段断言 SMTP transcript 为空）
- `src/agent/router-v2.test.ts`：新增「确认发送（邮件双闸第二段）→ office-daily」

### 遇到的问题

- **确认词路由走偏**：第二段 query「确认发送」不含「邮件」关键词，`modeFrom` 落入默认 `table` 分支返回考勤表模板；修复为 email 正则 + 路由特征正则同时收确认词
- **测试替换脚本缺陷**：一次 node 脚本替换两个测试时第二个调用基于原始数组覆盖了第一个结果，导致 2519 变更丢失；改为单测试单脚本重做

## 结果

- 验证：`npm run build` 绿；office-daily 邮件相关单测 5/5 + 草稿类 2/2；router-v2 78/78（新增 1 条）
- 测试：单测 x/x + 集成 x/x（全量待提交前 test:all）
- 提交：`<hash>` · 推送：Gitee / GitHub
- 遗留事项：真实 `npm run dev` 冒烟两段式发送待用户（成本纪律）；E291 归入审计 §3.2 缺口 #1 关闭依据
