# 推进计划：v1.0 S5 远程对话通道（IM 消息 → 同一 pipeline）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

v1.0 切片第五片（S5）：落地 §4.5 远程对话通道骨架——IM 消息（微信/QQ/飞书）统一接入同一搜索问答接口契约（不另起一套行为逻辑）、会话隔离（每用户/群独立 conversationId）、授权开关（默认关闭，绑定/授权后启用）、输出适配（正文尽量短，长报告给附件/链接提示）、紧急通道语义保留。

## 计划

1. **新模块 `src/im/`**：
   - `types.ts`：`ImPlatform`（wechat/qq/feishu）、`ImInboundMessage`（id/platform/sessionKey/isGroup/text/ts）、`ImReply`（text/truncated/attachmentHint）
   - `gate.ts`：`ImGate` 授权开关（默认全关，enable/disable，JSON 落盘 `data/im-gate.json` 原子写，测试可注入路径）
   - `session.ts`：`ImSessionMapper` 会话映射（sessionKey → 确定性 conversationId，重启稳定，用户/群互相隔离）
   - `format.ts`：`adaptReply` 输出适配（短正文原样；长报告截断 + `truncated` + 附件/链接提示，避免刷屏）
   - `service.ts`：`ImService.route(message)`——gate 校验 → 会话映射 → 复用 pipeline（注入 `ask` 契约 `(text, conversationId) => AnswerResult`）→ 输出适配
2. **登记**：需求文档 E224；`docs/code-directory.md`、`docs/directory-structure.md`、handoff。
3. **验收**：doc-lint 0 FAIL 0 WARN + build + 全量单测/集成全绿。

**验收标准**

- gate 默认关闭：未授权平台消息拒绝并说明需绑定；enable 后放行。
- 会话隔离：同一 sessionKey 得到稳定 conversationId，不同 sessionKey 互不相同。
- 输出适配：≤ 上限原样返回；超长报告截断并附 attachmentHint。
- 复用同一 pipeline：`ImService` 注入的 ask 契约即 `pipeline`，不另起问答链路。
- doc-lint 0 FAIL 0 WARN；单测 + 集成全绿。

## 执行过程

### 改动

- `src/im/types.ts` / `gate.ts` / `session.ts` / `format.ts` / `service.ts`（新增）
- 测试：`src/im/*.test.ts`
- 文档：本计划 + 需求文档 E224 + 目录文档 + handoff

### 遇到的问题

- `conversationIdFor` 参数类型为 Pick<platform|sessionKey>，测试多传 isGroup 触发 TS2353 → 去掉多余字段。

## 结果

- 验证：`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN（C8 44 key、附录 520/950）；主项目 `npm run build` 通过；`npm run test:all` 全绿。
- 测试：单测 741/742（1 skip）+ 集成 15/15；新增 12 条（gate 2 + session 2 + format 4 + service 4）。
- 提交：`c18cbd6`（E224）+ `25e24c7`（handoff 登记）
- 遗留事项：S5 骨架完成；真实微信/QQ/飞书适配器按平台协议后续接入（实现 ImChannel 并注入 ask）；剩余切片 S6 代码托管联动、S7 Skill 市场远程化、S8 LLM 增强路由 + fast description + MemoryCoreStore 切换按 `docs/plans/2026-08-23-v1-slicing.md` 排期继续。
