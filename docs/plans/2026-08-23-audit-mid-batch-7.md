# 推进计划：架构审计中期批·第七批（P13 + P14）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

中期批继续（数据增长治理主题，衔接 P15）：P13（route-cases.jsonl 无轮转无界增长、
recordFeedback 全文读+全文写、batch-mark 循环调它 = O(m×n) 同步重写）+ P14（会话摘要只
追加不合并——每轮 ≤600 字符永久累加，注入端却只取前 600——存储无界膨胀 + 最新信息静默
丢失；compactIfNeeded 失败被吞时 turns 全量注入 prompt 无硬顶）。

## 计划

1. P13 `src/agent/route-case-store.ts`：`record()` 改走 `appendJsonl`（句柄复用 +
   [P-113] 50MB 轮转 .1 归档，O(1)/事件）；新增 `batchMarkFeedback()` 单趟读+单趟写
   （batch-mark 不再 O(m×n)）；`recordFeedback`/`attachModelRoute` 收敛到共享
   `updateRecord`（单趟读改写的唯一出口）；同进程同步 fs 天然原子，注释说明并发性质。
2. P13 `src/gateway/app.ts` `/api/routing/batch-mark`：校验逻辑保留，改为一次
   `batchMarkFeedback()` 批量回写。
3. P14 `src/memory/session-context.ts`：`compact()` 摘要合并后截断到
   `SUMMARY_INJECT_CAP`（保留最新段，存储有界）；`buildSessionNotes` 摘要改取尾部
   （最新摘要不再被 601 截断静默丢弃）+ 轮次只注入最近 `[P-29]` 窗口（压缩失败时
   prompt 有硬顶）；`buildRecentMemory` 配对只保留最近窗口（同样防无界膨胀）。
4. 测试：`route-case-store.test.ts` 补 batch-mark 批量/部分失败/保留并发追加；
   `session-context.test.ts` 补摘要上限保留最新段、buildSessionNotes 窗口硬顶、
   buildRecentMemory 窗口硬顶。
5. 验证：build + 定向单测 + 全量 test:all + doc-lint 0 FAIL 0 WARN。
6. 文档：附录 A E214 登记；AGENTS.md/code-directory/directory-structure 标注
   route-case-store 走共享 JSONL 追加；交接登记；本计划补结果。

**验收标准**

- route-cases.jsonl 超过 [P-113] 后轮转出 `.1` 归档，主文件继续追加；batch-mark 一次
  批量回写，不再 O(m×n) 全文重写。
- 会话摘要存储有界（≤ 注入截断长度），最新摘要段保留、注入不再丢最新信息；压缩失败时
  prompt 注入轮次与配对均有窗口硬顶。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- P13 `src/agent/route-case-store.ts`：`record()` 改走共享 `appendJsonl`（句柄复用 +
  [P-113] 轮转，O(1)/事件）；新增 `batchMarkFeedback()` 单趟读 + 单趟写批量回写；
  `recordFeedback`/`attachModelRoute` 收敛到私有 `updateRecord`（读改写唯一出口），
  抽 `rewriteAll` 整文件重写。
- P13 `src/gateway/app.ts` `/api/routing/batch-mark`：校验逻辑保留，汇总有效更新后
  一次 `batchMarkFeedback()` 回写，不再循环调 `recordFeedback`（O(m×n) 消除）。
- P14 `src/memory/session-context.ts`：`compact()` 摘要合并后 `.slice(-600)` 截断
  （存储有界，保留最新段）；`buildSessionNotes` 摘要改取尾部（最新信息不再被 601
  截断丢弃）+ 轮次只注入最近 `[P-29]` 逐字窗口；`buildRecentMemory` 配对只保留最近
  窗口（压缩失败被吞时 prompt 注入有硬顶）。
- 测试：`route-case-store.test.ts` 补 2 条（batchMark 批量/部分失败/未标记字段保留、
  回写后新增 record 不丢）；`session-context.test.ts` 补 3 条（摘要上限保留最新段、
  buildSessionNotes 窗口硬顶、buildRecentMemory 窗口硬顶）。

### 遇到的问题

- PowerShell 双引号字符串里 `` `${...}` `` 模板串会被插值、反引号当转义符：route-case
  record 的 `appendFileSync(..., `${JSON.stringify(record)}\n`, ...)` 锚点首次匹配失败
  （未落盘），改用单引号 here-string 后成功。
- P14 摘要截断方向：注入端原取 `slice(0, 600)`（头部 = 旧信息优先，最新信息静默丢），
  改为存储时保留尾部 + 注入取尾部，两处口径一致（最新段优先）。
- batch-mark 迁移到 batchMarkFeedback 后返回结构变为 `{updated, failed}`，与端点原本的
  updated/failed 合并（校验失败的 id 先入 failed，再由 store 补缺失 id）。

## 结果

- 验证：`npm run build` 通过；定向单测 51/51（route-case 7 + gateway 24 +
  session-context 20）；`npm run test:all` 全量单测 653/654（1 skip）+ 集成 15/15；
  `doc-lint` 0 FAIL 0 WARN。
- 测试：新增 5 条全绿；既有 route-case/gateway/session 回归通过。
- 提交：109021b（E208-E214 中期批 1-7）
- 遗留事项：中期批剩余 P1/P2/P10/P17 + B2/B3 + S1-S3。
