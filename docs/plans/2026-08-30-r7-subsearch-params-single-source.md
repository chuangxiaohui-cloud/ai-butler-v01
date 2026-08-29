# 推进计划：R-7 子搜索参数单一来源（P-85/P-86 迁入 params.ts）

> 日期：2026-08-30 · 分支：v0.2b · 状态：已完成

## 目标

消除 §0.2 数值单家违规：`src/search/search-loop.ts:32-33` 硬编码 `DEFAULT_MAX_SUB_SEARCHES=5`（[P-85]）、`DEFAULT_MIN_RESULTS=5`（[P-86]），改为统一从 `src/config/params.ts` PARAMS 读取，行为值不变（¥0 结构性迁移，bench:na）。

## 计划

1. `src/config/params.ts`：PARAMS 新增 `subSearchLoopCap: 5`（P-85）、`subSearchCoverageFloor: 5`（P-86）；PARAM_IDS 补对应映射。
2. `src/search/search-loop.ts`：删除两个 DEFAULT 导出常量，`opts.maxSubSearches ??` 与 `opts.minResults ??` 兜底改读 `PARAMS.subSearchLoopCap` / `PARAMS.subSearchCoverageFloor`。
3. 补单测：断言默认兜底值等于 PARAMS 登记值（防双处漂移回归）。
4. 需求文档附录 A 登记 E286 + §5.5 表 P-85/P-86 引用位置补 `params.ts`（如适用）。

**验收标准**

- `npm run build` 退出 0；单测全绿（search-loop 相关不回归）。
- `npm run doc-lint` 0 FAIL 0 WARN（C8 自动识别新 key 且均有引用）。
- §5.5 [P-85]/[P-86] ↔ params.ts ↔ search-loop.ts 三处一致，`rg DEFAULT_MAX_SUB_SEARCHES|DEFAULT_MIN_RESULTS` 零命中。
- bench:na(new-param) 理由：行为值不变，纯结构迁移。

## 执行过程

### 改动

- `src/config/params.ts`：PARAMS 新增 `subSearchLoopCap: 5`（P-85）、`subSearchCoverageFloor: 5`（P-86）；PARAM_IDS 补 `subSearchLoopCap: 'P-85'` / `subSearchCoverageFloor: 'P-86'`。
- `src/search/search-loop.ts`：删除 `DEFAULT_MAX_SUB_SEARCHES` / `DEFAULT_MIN_RESULTS` 导出常量，`opts.maxSubSearches ??` / `opts.minResults ??` 兜底改读 `PARAMS.subSearchLoopCap` / `PARAMS.subSearchCoverageFloor`。
- `src/search/search-loop.test.ts`：补 R-7 防漂移断言（值 + P-NN 映射）。
- 需求文档附录 A 登记 E286（changelog + bench:na 理由）。

### 遇到的问题

- 无。测试全部显式传 opts，不依赖被删常量，迁移零破坏。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN（C8 67 key 全部有引用）；`rg DEFAULT_*` 零命中。
- 测试：search-loop 单测 22/22（含新增 1 条）
- 测试：（待填）
- 提交：待收口提交（计划文档回填后一并提交）
- 遗留事项：
