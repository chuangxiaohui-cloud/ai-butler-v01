# 推进计划：§8.3 会话上下文分层压缩落地（P-109）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

把需求文档 §8.3「工作记忆与上下文压缩」的代码侧落地：同一会话内超出逐字窗口（[P-29] 5 轮）或
token 预算（新增 [P-109]）的早期轮次，由轻模型压缩为「实体 + 决策 + 未决事项」结构化摘要，
与逐字窗口一起注入后续问答；远期会话仍走 L1-L3 蒸馏，不改变记忆分层。

## 计划

1. 新增 `src/memory/session-context.ts`：`SessionContextStore`（按 conversationId 持久化 turns + 滚动 summary，
   `data/session-context/<id>.json`）、`estimateTokens` 粗估、逐字窗口 [P-29] 截取、[P-109] token 预算双触发、
   `compact`（轻模型压缩窗口外轮次 → 摘要，合并旧摘要，防重入）。
2. pipeline 集成：`PipelineDeps.sessionContext`（默认真实 store，测试可注入 fake）；
   开头 load 会话上下文 → 摘要 + 窗口轮次并入 memoryNotes/recentMemory；主路径回答后 append 用户轮 + 助手轮，
   `compactIfNeeded` 异步执行（不阻塞回答，失败静默）。
3. 参数与文档：§5 新增 [P-109] 会话上下文 token 预算 6000；§8.3 触发条件补 [P-109] 引用；
   附录 A 登记 E193（bench:B-20260822-05 真实轻模型压缩冒烟）。
4. 测试：`session-context.test.ts`（估算/持久化/窗口/双触发/压缩合并/防重入）+ pipeline 注入与 append 调用单测。
5. 验证：doc-lint + build + test:all + 一次真实压缩冒烟；更新计划/交接/code-directory/borrowed-designs。

**验收标准**

- `npm exec tsx scripts/doc-lint.ts`：0 FAIL 0 WARN（附录 A 949→950/950）。
- `npm run build` + `npm run test:all`：单测/集成全绿（新增 session-context + pipeline 用例）。
- 真实冒烟：2 轮合成对话经轻模型压缩输出「实体/决策/未决」摘要（bench:B-20260822-05）。
- 行为：同一 conversationId 第 6+ 轮起，注入中自动出现「【会话摘要】…」，窗口内轮次逐字保留。

## 执行过程

### 改动

1. 新增 `src/memory/session-context.ts`（E193）：SessionContextStore 按 conversationId 持久化
   `data/session-context/<id>.json`；读改写 runExclusive 串行化、compact 防重入（compacting Set）、
   每轮唯一 id 增量合并（修正早期 ts 毫秒碰撞导致压缩后轮次不减的缺陷）；[P-29] 逐字窗口 5 轮 +
   [P-109]=6000 token 双触发（token 为硬约束：窗口超预算最早轮次也移入压缩）；轻模型压缩
   （createLightClient，max_tokens=300，8s 超时静默失败）。
2. pipeline 集成：PipelineDeps 新增 sessionContext（默认真实 store）；`opts.conversationId` 显式传入才
   启用——开头 load 摘要 + 窗口轮次并入 memoryNotes/recentMemory，回答后 append 用户/助手轮次并异步
   compactIfNeeded（失败静默不阻塞主回答）；UI 主聊天发送稳定 conversationId。
3. 参数与文档：§5 新增 [P-109]=6000（定稿，E193 登记）；§8.3 触发条件补 [P-109] 引用；附录 A 登记 E193
   （bench:B-20260822-05）；code-directory/borrowed-designs/交接同步。
4. 测试：`session-context.test.ts` 14 条 + pipeline 2 条（摘要注入路由上下文并 append、无 conversationId 不启用）。

### 遇到的问题

- apply_patch 在本环境被拒（WindowsApps 权限），改用临时 .cjs 脚本精确替换。
- compact 原按 ts 时间戳增量合并，同一毫秒生成的轮次 ts 碰撞导致 kept 误保留全部轮次（压缩无效）；
  改为每轮唯一 id，按 overflow id 集合过滤，正确保留并发 append 的新轮次。
- estimateTokens 测试期望与实现口径不一致（5 汉字按 2 字符/token = 3），修正测试期望。

## 结果

- 单测：session-context 14/14 + pipeline 34 条全绿（含新增 2 条）。
- 构建：npm run build 通过；npm run test:all 全绿（集成 17/17）。
- 真实冒烟：bench:B-20260822-05 轻模型压缩 2 轮合成对话 → 输出「实体/决策/未决」摘要。
- 验收：npm exec tsx scripts/doc-lint.ts 0 FAIL 0 WARN（附录 A 950/950 到上限）；
  行为：同一 conversationId 第 6+ 轮起注入自动出现「【会话摘要】…」，窗口内轮次逐字保留。

### 遇到的问题

（执行中补充）

## 结果

（完成后补充）
