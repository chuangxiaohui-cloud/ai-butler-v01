# 推进计划：架构审计中期批·第九批（P1 + P2 + P10）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

中期批继续（二次取证与图片归一化的延迟/磁盘治理）：P1 `src/search/pipeline.ts:749-793`
低置信二次取证逐 target 串行 `fetchPage(url, 8000, 3000)`，每目标最坏 8s+ 无总预算，
叠加进 [P-15] 关键路径；PDF 分支 `readFileSync` 同步读整份 datasheet（可达数十 MB）阻塞
事件循环且无大小上限。P2 取证 PDF 每次新文件名从不清理，磁盘无界增长。P10
`multimodal-preprocessor.ts` PNG 归一化同步写整图 Buffer + python/python3 串行候选各 15s，
单张图最坏 ~30s。

## 计划

1. P1/P2 新增 `src/search/second-pass-fetch.ts`：`fetchSecondPassTargets` 并发抓取全部
   target + 共享 [P-117] 总预算（deadline + withBudget race，预算耗尽整体放弃）；
   `fetchSecondPassTarget` 单目标：HTML 走浏览器会话，PDF 下载 → [P-118] 大小上限判断 →
   异步 `readFile`（不再 readFileSync）→ `parseDocumentFile` → finally 删除落盘 PDF（P2）。
2. P1 `src/search/pipeline.ts`：二次取证循环改调 `fetchSecondPassTargets`（传
   `PARAMS.secondPassBudgetMs`），删除 readFileSync/resolve/parseDocumentFile 直引。
3. P10 `src/agent/multimodal-preprocessor.ts`：`tryNormalizeToPng` 改异步 fs
   （mkdtemp/writeFile/readFile/rm），多个 python 候选共享总预算（每候选只拿剩余时间），
   候选支持完整 argv（`string | string[]`）便于测试。
4. 参数与文档：`params.ts` 注册 [P-117] `secondPassBudgetMs=8_000`、[P-118]
   `pdfParseMaxBytes=20MB`；需求文档 §5 登记 + 附录 A E216。
5. 测试：`second-pass-fetch.test.ts` 新增 6 条；`multimodal-preprocessor.test.ts` 新增 2 条。
6. 验证：build + 定向单测 + 全量 test:all + doc-lint 0 FAIL 0 WARN。

**验收标准**

- 二次取证总墙钟 ≤ [P-117] 8s，目标并发抓取（总耗时≈最慢目标而非串行叠加）。
- 取证 PDF 超过 [P-118] 上限不解析；落盘文件用后即删（data/datasheets 不再增长）。
- 图片归一化总预算 15s（每候选拿剩余时间），写/读图不再同步阻塞事件循环。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- P1/P2 `src/search/second-pass-fetch.ts`（新增）：`fetchSecondPassTarget`（PDF 分支
  size 上限 → async readFile → parse → finally rm，HTML 分支 fetchPage）+ `withBudget`
  race + `fetchSecondPassTargets`（Promise.allSettled 并发，预算耗尽 reject 整体放弃）。
  单目标失败不影响其他目标。
- P1 `src/search/pipeline.ts`：二次取证循环替换为 `fetchSecondPassTargets(targets, query,
  browserSession, PARAMS.secondPassBudgetMs)`；清理 `readFileSync`/`resolve`/
  `parseDocumentFile` 导入（不再直引）。
- P10 `src/agent/multimodal-preprocessor.ts`：`tryNormalizeToPng` 导出并支持
  `NormalizeToPngOptions{candidates, timeoutMs}`；`runImageConvert(argv, dst, timeoutMs)`
  单候选执行；deadline 共享总预算；临时目录用后异步清理。
- 参数：`params.ts` PARAMS + PARAM_IDS 注册 [P-117]/[P-118]。
- 测试：`second-pass-fetch.test.ts` 6 条（HTML 抓取/空正文/PDF 用后即删/大小上限跳过/
  预算超时快速返回/并发耗时≈最慢）；`multimodal-preprocessor.test.ts` 2 条（候选回退/
  总预算耗尽快速返回）。
- 文档：需求文档 §5 [P-117]/[P-118] + 附录 A E216；本计划；交接更新。

### 遇到的问题

- apply_patch 工具在本环境被 WindowsApps 权限拒绝，沿用 Python 精确锚点替换落盘
  （每处校验唯一命中）。
- TS 测试里 `\r\n` 被 Python 转义成真实换行导致字符串字面量中断，改用字面 `\\r\\n`；
  后因 `.cmd` 垫片无法被 spawn 直接执行（EINVAL），改为候选支持完整 argv，用
  `[python, '-u', '-c', 'import time; time.sleep(60)']` 确定性挂起，跨平台不依赖 shell。
- `runImageConvert` 初始重构丢失 dst 参数（readFile(dst) 编译报错），补回 dst 参数后通过。

## 结果

- 验证：`npm run build` 通过；定向单测 50/50（second-pass-fetch 6 + pipeline 35 +
  multimodal 9）；`npm run test:all` 全量单测 664/665（1 skip）+ 集成 15/15；`doc-lint`
  0 FAIL 0 WARN（PARAM 108、C8 32 key、附录 945/950）。
- 测试：新增 8 条全绿；既有 pipeline/multimodal 回归通过。
- 提交：待提交（与安全/正确性/决策/中期第一~八批同批）。
- 遗留事项：中期批 P1-P17 全部收口，剩余 B2/B3 校准回路 + S1-S3。
