# 推进计划：Archify 语义修复后补 LLM 布局修复轮（E361）

> 日期：2026-09-06 · 分支：v0.2b · 状态：完成（未提交，待 owner 复测）
> 关联：owner 复测「画个订单系统的系统架构图」得到 0.35 收据——architecture-0906-195729.json 语义已完全正确（订单服务实线连订单库、支付回调指向订单服务、MQ 在位、无死胡同，E360 生效），但版式剩 10 条诊断：order⇄mq 同通道两条反向虚线致 label 重叠、多条连线横穿组件。定位：E360 语义修复通过后直接进本地救援，本地救援只会交换/挪组件/补 sides，无法做「合并往返双线」这类需要 LLM 的重排；且语义修复候选若让版式劣化会被回滚到「语义又错」的版本。owner 拍板 A：语义修复后若版式仍不过，继续跑 LLM 布局修复轮（≤maxRepairRounds），再不行才本地救援。

## 目标

语义修复成功后，若版式仍不过校验，候选继续交给 LLM 布局修复轮（诊断驱动、带拓扑语义守卫），把「需删线合并/整行重排」的几何问题修掉；仍不行才走 E359 本地救援。

## 方案（只动 src/skills/archify/index.ts + 测试）

1. 原「validate 失败 ≤2 轮修复」while 抽成可重入局部函数 `repairRoundOnce()`：按诊断整份重出 JSON（buildRepairPrompt）→ architecture 候选先过 `checkArchitectureSemantics` 语义守卫（布局修复不得牺牲拓扑）→ 写盘 validate → 改善或通过返回 true，未改善返回 false（如实收据）。
2. 首次布局修复循环改为 `for round < maxRepairRounds && !ok` 调 `repairRoundOnce`。
3. E360 语义修复候选**不再回滚**到语义错的版本（语义是硬门槛，版式劣化交给后续修复轮兜底），并记录 after 收据。
4. 新增 2.6 段：语义修复后若 `semanticIssues 为空 && 版式仍 !ok`（architecture），继续 ≤maxRepairRounds 轮 `repairRoundOnce`；全部失败才进 E359 本地救援。

## 测试与验收

- index.test.ts 新增 E361 集成：gen 语义错且版式过 → 语义修复版（语义 ok、版式 fail）→ 补布局轮（第 3 次 LLM）改到版式 ok → 交付；断言 3 次 LLM 调用、修复提示分别含「拓扑铁律」与「layout/constraint」。
- 既有 E352/E356/E359/E360 集成回归不破坏。
- npm run build 绿；定向单测绿；npm run doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0，测试全 Fake）。
- 手动（owner）：重启 gateway 后 5173 重发「画个订单系统的系统架构图」——语义修复后若还出版式诊断，系统会自动多修 ≤2 轮再交付/收据，而不是直接 0.35。

## 执行过程

### 改动

- `src/skills/archify/index.ts`：抽取 `repairRoundOnce`（含语义守卫）；首轮修复与 E361 补轮共用；E360 语义修复候选不再回滚。
- `src/skills/archify/index.test.ts`：+1 E361 集成。

### 遇到的问题

- 语义修复「改对内容但挤坏版式」原被当作劣化回滚——回滚会把候选退回语义错版本，语义自检又通不过，链路自相矛盾；改为保留语义修复候选 + 补布局轮，语义守卫保证布局轮不把语义改坏。

## 结果

- `npm run build` 绿；archify 定向 27/27（新增 E361 集成）；doc-lint 0 FAIL 0 WARN；零外部 LLM（¥0）。
- 现状：architecture 交付链 = 版式修复 ≤N 轮 → 语义自检+修复 → 版式修复 ≤N 轮 → 本地救援 → 如实收据；语义与版式互为守卫。
- 待 owner 重启 gateway 复测短问「画个订单系统的系统架构图」。
