# 推进计划：架构审计中期批·第四批（P7 + P11）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已收口

## 目标

中期批热路径继续：P7（搜索缓存 Map 无容量上限/无 LRU，长驻 gateway 7/30 天 TTL 死条目
永久驻留内存）+ P11（SQLite 全线无 WAL/busy_timeout；热路径 put/addSessionSummary/
recordUse 每次重编译语句；user-context archiveExpired 逐行 UPDATE 无事务，每行一次 fsync）。

## 计划

1. P7 `src/search/cache.ts`：新增 [P-110] 容量上限（params.ts `cacheMaxEntries`，§5 注册），
   Map 插入序模拟 LRU——get 命中刷新序、set 超容量先清过期再按 LRU 淘汰最冷条目；TTL 与
   不缓存意图行为不变。
2. P11 PRAGMA：source-stats 已有 WAL/busy_timeout/synchronous=NORMAL 作为基准，其余 8 个
   DB 初始化（user-context-store / memory store / experience / reminder-store / lifecycle /
   calendar-skill / im-dispatch / quote-compare）统一补同一组 PRAGMA。
3. P11 热路径语句预编译：`SqliteDirectStore.put`、`UserContextStore.addSessionSummary`、
   `ExperienceManager.recordUse`、`SearchSourceStats.record`、`ReminderStore.dueReminders`
   循环内 reschedule——构造器 exec(schema) 后 prepare 一次复用。
4. P11 事务：`UserContextStore.archiveExpired` 逐行 UPDATE 包 BEGIN/COMMIT（失败 ROLLBACK）；
   `ReminderStore.dueReminders` 同类逐行 UPDATE 一并收口。
5. 测试：cache LRU（容量淘汰 + 命中刷新序）；user-context WAL/busy_timeout 断言 +
   archiveExpired 批量归档。
6. 文档：§5 注册 [P-110]；附录 A E211 登记（affects §5,§6，bench:na(new-param)）；
   本计划补结果；交接登记。

**验收标准**

- 缓存条目数有硬上限，最久未命中条目先被淘汰；过期条目照常失效。
- 全部 SQLite 库 journal_mode=wal 且 busy_timeout=5000（至少一处实测断言）。
- archiveExpired 多条归档一次事务提交；既有行为（计数/加载）不变。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

P7 `src/search/cache.ts` + `src/config/params.ts` + §5：
- 新增 [P-110] `cacheMaxEntries=2000`（§5 注册 + params.ts PARAMS/PARAM_IDS，C8 24 key）。
- Map 插入序模拟 LRU：`getCache` 命中 delete+重插刷新序；`setCache` 超容量先清过期条目
  再按 LRU 淘汰最冷条目（`evictIfOverCapacity`）；TTL/不缓存意图行为不变。

P11 SQLite（9 个库统一，source-stats 已有作基准）：
- PRAGMA 补齐：user-context-store / memory store / experience / reminder-store /
  lifecycle / calendar-skill / im-dispatch / quote-compare 构造器统一加
  `PRAGMA journal_mode = WAL; busy_timeout = 5000; synchronous = NORMAL;`。
- 热路径语句预编译复用：`SqliteDirectStore.put`（putStmt）、
  `UserContextStore.addSessionSummary`（addSessionSummaryStmt）+ archiveStmt、
  `ExperienceManager.recordUse`（recordUseStmt）、`SearchSourceStats.record`
  （recordStmt）、`ReminderStore` 重复提醒顺延（rescheduleStmt）——构造器
  exec(schema) 后 prepare 一次。
- 事务化：`UserContextStore.archiveExpired` 与 `ReminderStore.dueReminders` 的逐行
  UPDATE 包 BEGIN/COMMIT（失败 ROLLBACK），消除每行一次 fsync。

新增/补充测试 5 条：
- `src/search/cache.test.ts`：超容量 LRU 淘汰最冷 / 命中刷新序 / 超容量先清过期（3 条）。
- `src/memory/user-context-store.test.ts`：库文件 journal_mode=wal（P11 持久化断言）+
  archiveExpired 一次事务批量归档 2 条（2 条）。

### 遇到的问题

- calendar-skill/index.ts 为 CRLF 换行，精确 `\n` 锚点失配 → 用容忍 `\r?\n` 的正则替换。
- PowerShell 双引号字符串里反引号是转义符（`"db.exec(`"` 解析错）→ 用 `[char]96` 拼反引号。

## 结果

- 验证：`npm run build` 通过；相关单测（cache/user-context/store/experience/source-stats/
  reminder/lifecycle）27/27 + skill（calendar/im-dispatch/quote-compare）16/16；全量单测
  `npm run test:all` 639/640（1 skip，0 fail）+ 集成 15/15；`npm exec tsx scripts/doc-lint.ts`
  0 FAIL 0 WARN（PARAM 100 项、C8 24 key）。
- 测试：新增单测 5 条（cache 3、user-context 2）。
- 文档：§5 注册 [P-110]；附录 A E211 已登记（affects §5,§6，bench:na(new-param)）。
- 提交：待提交（与安全/正确性/决策/中期第一二三批同批，见当日 handoff「待提交」段）。
- 遗留事项：中期批剩余 P1/P2/P9/P10/P12-P17 + B2/B3 + S1-S3。