# 推进计划：架构审计中期批·第一批（H7 + P4）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

开工架构审计「中期」批次（P1-P17 + B2/B3 + S1-S3），本批先收两件资源/正确性类问题：
H7（video-learner 固定共享 `tmp` 工作目录，并发执行互删文件——审计报告批次表漏排的
高危项）+ P4（s3_search 超时 race 的 setTimeout 从不清理导致 timer 泄漏、stage 超时后
底层 provider fetch 不取消继续烧配额）。

## 计划

1. H7 `src/skills/video-learner/index.ts:574`：`workDir = join(outDir,'tmp')` 改
   `mkdtempSync(join(outDir, 'learn-'))` 独立目录（每执行唯一），finally 的
   `rmSync(recursive+force)` 语义不变（只删自己的目录）。
2. P4 `src/search/stages/s3_search.ts`：`timeoutRace` 的 setTimeout 句柄保存并在
   race 结束后 `clearTimeout`；stage 级 `AbortController` 在超时触发时 `abort()`，
   并把 `signal` 传入各 provider.search。
3. P4 信号穿透：`src/search/providers/types.ts` 的 `SearchOptions` 增加
   `signal?: AbortSignal`；bocha/anysearch/tavily 三个 provider 合并外部 signal →
   内部 AbortController（外部 abort 时取消 fetch），finally 清理监听。
4. 测试：H7 提取 `createLearnerWorkDir` helper 并断言两次调用目录唯一、默认基目录；
   s3_search 超时用例断言 provider 收到已 abort 的 signal、timer 被清理；
   provider（bocha 等）断言外部 signal 可即时取消 fetch。
5. 文档：附录 A E208 登记（affects §6,§8.2，bench:na(new-param)）；本计划补结果；
   交接登记。

**验收标准**

- video-learner 两次执行的工作目录互不相同；finally 只清理自己的目录。
- s3_search 超时后：进行中的 provider.search 收到 aborted signal；race 后 timer 句柄
  已清理（无 timer 泄漏）。
- provider 在外部 signal abort 时立即取消 fetch（不等到自身 timeoutMs）。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- H7 `src/skills/video-learner/index.ts`：新增 `createLearnerWorkDir(outDir?)`
  （`mkdtempSync(join(baseDir,'learn-'))`），execute 内 `workDir` 改用它；
  fs import 补 `mkdtempSync`。单测：两次调用目录唯一、基目录正确、finally 可清理。
- P4 `src/search/providers/types.ts`：`SearchOptions` 新增 `signal?: AbortSignal`。
- P4 bocha/anysearch/tavily：外部 signal 注册 `onExternalAbort`（外部 abort → 内部
  controller.abort），finally 里 `removeEventListener` 防泄漏。
- P4 `src/search/stages/s3_search.ts`：stage 级 `AbortController` 在超时触发时
  `abort()` 并透传 `signal` 给 provider.search；`timeoutRace` 的 setTimeout 句柄
  保存，race 结束后 `clearTimeout`。单测：s3 超时后 provider 收到 aborted signal；
  bocha 外部 signal 立即取消 fetch（不等到自身超时）。

### 遇到的问题

- PowerShell 双引号 here-string 写 TS 模板字符串时，`${r.error}` 被 PS 插值、
  反引号被当作转义符，bocha 测试断言行被打坏（build TS1160）——改用单引号字符串
  逐行重建修复。
- s3_search 的 stage 控制器需在 `Promise.allSettled` 之前创建（provider 闭包要引用
  signal），timeoutRace 仍放在 allSettled 之后，二者顺序与原结构兼容。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 全绿；doc-lint 0 FAIL 0 WARN（含 C8）。
- 测试：单测 624/625（1 skip，+3：H7 目录唯一 / s3 超时取消 / bocha 外部取消）+ 集成 15/15。
- 文档：附录 A E208 登记（affects §6,§8.2，bench:na(new-param)）。
- 提交：109021b（E208-E214 中期批 1-7）
- 遗留事项：中期批剩余 P1-P3/P5-P17 + B2/B3 + S1-S3
