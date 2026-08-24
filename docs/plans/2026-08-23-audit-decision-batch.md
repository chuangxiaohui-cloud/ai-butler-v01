# 推进计划：架构审计短期决策批（H6 / D1-D5）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

处置架构审计 `docs/2026-08-23-architecture-code-audit.md` 「短期（决策）」批次：
H6（三层路由 LLM 层生产入口不可达 → 降级声明）、D1（P-83 死参数 + "登记即生效"
治理空隙）、D2（`COMPACT_TIMEOUT_MS` 死常量 → 接线）、D3（fast-description 死链清理）、
D4（distill-worker 正式入口声明）、D5（MemoryCoreStore 可选切换声明）。

## 计划

1. H6/D4/D5 声明类处置：不接新线，在附录 A E207 统一登记（LLM 增强路由留待 v1.0，
   与 E22/E23 状态一致；`distill-worker.ts` 为 L1 蒸馏正式入口；MemoryCoreStore 为
   可选 sidecar 切换，当前默认 SqliteDirectStore）。
2. D1：删 `params.ts` 中 P-83 `routeLlmTimeoutMs` 键；需求文档 P-83 tombstone；
   doc-lint 新增 C8「PARAM 代码引用」——params.ts 每个 key 在 src 非测试代码至少
   1 次引用，零引用 FAIL（登记即生效）。
3. D2：`COMPACT_TIMEOUT_MS`（8s）接线 /compact 与 pipeline 自动压缩的
   `createLightClient({ timeoutMs })`（原走轻档默认 1750ms，大会话压缩易超时）。
4. D3：删 `multimodal-preprocessor.ts` 的 `maybeFastDescribe`/`withTimeout`/
   `SkillDeps` import；需求文档 P-87/P-88 tombstone。
5. 需求文档：§0.6 检查清单补第 8 项；附录 A E207 登记（affects §5,§8.3,§0.6，
   bench:na(deprec)）。
6. 验证：`npm run build` → 相关单测 → `npm run test:all` → doc-lint 0 FAIL 0 WARN。
7. 文档：本计划补结果；交接登记。

**验收标准**

- params.ts 无 `routeLlmTimeoutMs`/`fastDescriptionEnabled`/`fastDescriptionTimeoutMs`，
  全量 build 通过。
- /compact 与 pipeline 压缩的默认轻模型客户端超时 = `COMPACT_TIMEOUT_MS`（8s）。
- multimodal-preprocessor 无 `maybeFastDescribe`/`withTimeout`/`SkillDeps` 残留。
- doc-lint C8：注入假 key → FAIL 阻断；移除 → PASS；全量 0 FAIL 0 WARN。
- 需求文档 P-83/P-87/P-88 tombstone、§0.6 八检查、附录 A E207 齐全。
- 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/config/params.ts`（D1/D3）：删 P-83 `routeLlmTimeoutMs`、P-87
  `fastDescriptionEnabled`、P-88 `fastDescriptionTimeoutMs` 三 key 及 PARAM_IDS
  对应行；文件头注释 P-80~P-84 → P-80~P-82/P-84；顺手修正删除后残留的注释/缩进瑕疵。
- `src/agent/multimodal-preprocessor.ts`（D3）：删 `maybeFastDescribe` 与 `withTimeout`
  （唯一调用方）及 `SkillDeps`/`PARAMS` import；`RawFileLike`/`toDataUrl` 等既有
  导出保留（均有调用方）。
- `src/slash/slash-commands.ts` + `src/search/pipeline.ts`（D2）：压缩默认客户端
  `createLightClient()` → `createLightClient({ timeoutMs: COMPACT_TIMEOUT_MS })`；
  `session-context.ts` 的 `COMPACT_TIMEOUT_MS` 注释补 D2 接线说明。
- `scripts/doc-lint.ts`（D1）：新增 `checkC8`——解析 params.ts PARAMS 块 key 集合，
  逐 key `rg -l -w`（排除 `params.ts` 与 `*.test.ts`）检引用，零引用 FAIL；rg 无匹配
  （exit 1 无 stderr）视为零引用；`printSummary` 汇总清单补 'C8'；头部「七检查 → 八检查」。
- 需求文档 v2.5：P-83/P-87/P-88 tombstone（`~~数值~~` + 已废弃 + 去向 E207）；
  §0.6 检查清单新增第 8 项「PARAM 代码引用」；§13 doc-lint 行「七检查 → 八检查」；
  §0.1 第 2/3 行合并腾出 §0 行数预算；附录 A 新增 E207（H6 降级 + D1-D5 处置，
  bench:na(deprec)）。
- `AGENTS.md`：文档宪法「七项检查 → 八项检查」。

### 遇到的问题

- doc-lint `printSummary` 按硬编码 `['C1'..'C7']` 汇总，新增 C8 不显示——补 'C8'。
- 新增 §0.6 检查 8 使 §0 行数超预算 1 行（101/100）——合并 §0.1 第 2/3 行
  （术语三件套与 §0.2 规则 8 重复）腾出 1 行。
- PowerShell 锚点精确匹配在 CRLF/LF 混合文件中失败——import 合并改用容忍
  `\r?\n` 的 regex 替换。

## 结果

- 验证：`npm run build`、相关单测、`npm run test:all`、doc-lint 0 FAIL 0 WARN（含 C8）。
- 测试：单测 621/622（1 skip）+ 集成 15/15（INT-005 改断言"无 VLM 入口"、删除 2 条 maybeFastDescribe 死链用例）。
- 提交：615bb62（E207 决策批）
- 遗留事项：中期批 P1-P17（含 P14 摘要合并/压缩失败吞掉）。
