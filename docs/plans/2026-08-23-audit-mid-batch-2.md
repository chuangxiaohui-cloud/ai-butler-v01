# 推进计划：架构审计中期批·第二批（P3 + P5）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已收口

## 目标

继续中期批热路径顺序（P4 已完成 → P5/P3 收益最大）：P5（quota 每请求全量同步读写
JSON、读-改-写无锁并发丢计数）+ P3（defaultRegistry 每请求重建、provider-order
每次读盘）。

## 计划

1. P5 `src/search/quota.ts`：按文件路径的进程内互斥链（withFileLock，Promise 链串行化
   读-改-写，防 gateway 多请求并发丢计数）；写改 temp+rename 原子落盘（防半截 JSON）；
   单进程内配额状态内存缓存 + mtime 校验（同进程不再每次 readFileSync+parse，跨进程写
   靠 mtime 变化感知重读）。
2. P3 `src/search/llm-registry.ts`：`defaultRegistry()` 改模块级惰性单例（复用同一
   Registry，process.env 为活引用不受影响）。
3. P3 `src/config/provider-order.ts`：`readProviderOrder` 按 mtime 缓存
   （statSync 命中即返回，免每次 existsSync+readFileSync+parse）；`writeProviderOrder`
   写后显式失效缓存。
4. 测试：quota 并发 take（同实例 + 跨实例同文件）不丢计数；provider-order 缓存命中与
   write 后失效；defaultRegistry 同一引用。
5. 文档：附录 A E209 登记（affects §6，bench:na(new-param)）；本计划补结果；交接登记。

**验收标准**

- gateway 多请求并发取配额最终计数 = 实际放行数（并发测试断言）。
- 配额文件任意时刻为完整 JSON（原子写）。
- 同进程内连续 take 不再每次 readFileSync+parse（mtime 缓存命中路径）。
- defaultRegistry() 多次调用返回同一实例；provider-order 文件外部变更可被感知。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

P5 `src/search/quota.ts`：
- 新增 `fileLocks = Map<string, Promise<void>>` 进程内互斥链 `withFileLock`，读-改-写按
  文件路径串行化（gateway 多请求并发不再丢计数）。
- 新增 `stateCache = Map<string, {mtimeMs, state}>` + `readStateCached`：同进程 statSync
  命中即复用，免每次 readFileSync+parse；跨进程写靠 mtime 变化感知重读。
- 新增 `writeStateAtomic`：temp+rename 原子落盘（防半截 JSON），写后刷新缓存；失败静默
  不计数。
- 新增 `takePeriodQuota(filePath, periodKey, current, key, limit)` 共用日/月取配额逻辑，
  `FileQuotaStore.take` 与 `FileMonthlyQuotaStore.take` 统一走它（重置/达限行为不变）。
- imports 增加 `renameSync, rmSync, statSync`；`QuotaState` 接口保留，`readMonthlyQuota`
  只读快照不变。

P3 `src/search/llm-registry.ts`：
- `defaultRegistry()` 改模块级惰性单例（`cachedDefaultRegistry`），复用同一 Registry；
  registry 的 `env` 是 process.env 活引用，`createForRole` 仍实时读 key/model/超时，
  行为不变。

P3 `src/config/provider-order.ts`：
- `readProviderOrder` 改 mtime 缓存（`providerOrderCache`），文件缺失/损坏 → null 并清
  缓存；`writeProviderOrder` 写后显式失效。

新增/补充测试 6 条：
- `src/search/quota.test.ts`：P5 并发 take 不丢计数（同实例 10 并发）+ 跨实例同文件并发
  也不丢计数（2 实例 4 并发 → [true,true,false,false]，最终计数 2）。
- 新建 `src/config/provider-order.test.ts`：缺失→null、写入后读到新值+缓存命中、再次写入
  失效缓存、外部改文件 mtime 变化可感知。
- `src/search/llm-registry.test.ts`：defaultRegistry 返回同一实例（P3 单例缓存）。

### 遇到的问题

- quota.ts 中带模板字符串的锚点（`return \`${...}\``）在 PowerShell 双引号 here-string 里
  被插值导致锚点失配、反引号变转义符 → 改用单引号 here-string（@'...'@）拼装后成功。
- 需求文档为 LF 换行，精确锚点（含 \r\n）失配 → 先 `.Contains`/regex 验证换行风格再改。
- 全量单测首轮偶发 1 fail（未复现），连续两轮复跑 630/631（1 skip）稳定通过；本批相关
  测试 5 连跑全过，判定与本批无关的瞬时抖动。

## 结果

- 验证：`npm run build` 通过；本批相关单测 `node --test dist/search/quota.test.js dist/config/provider-order.test.js dist/search/llm-registry.test.js` 18/18；全量单测 `npm run test` 630/631（1 skip，0 fail）；集成 `npm run test:integration` 15/15；`npm exec tsx scripts/doc-lint.ts` 0 FAIL 0 WARN。
- 测试：新增单测 6 条（quota 并发 2、provider-order 缓存 3、defaultRegistry 单例 1）。
- 文档：附录 A E209 已登记（affects §6，bench:na(new-param)）；附录 941/950 行数安全。
- 提交：待提交（与安全/正确性/决策/中期第一批同批，见当日 handoff「待提交」段）。
- 遗留事项：中期批剩余 P1/P2/P6-P17 + B2/B3 + S1-S3。