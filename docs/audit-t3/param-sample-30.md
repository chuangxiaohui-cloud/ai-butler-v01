# T+3 PARAM 抽样核对报告（30 条）

> 交付物 1 / 5 | 关联：`architecture-audit-2026-08-30.md` §9.1
> 抽样口径：27 provisional（含 2026-08-13 批 13 项：P-82 / P-84~P-86 / P-89~P-90 / P-92 / P-94 / P-95~P-97 / P-103~P-104 + P-04 + P-10 + P-105~P-107 + 数值 predicate 链 P-136~P-139 + 看门狗链 P-141 + github cache 链 P-142）+ 3 定稿（P-17 / P-22 / P-128）
> 核对维度：① §5.5 表行值 ↔ params.ts（或 src/ 实际常量）值 ② 状态机（provisional@日期 + 4 周超期倒计时）③ constraint 列逻辑 ④ 是否被代码引用

---

## 1. 抽样清单与核对结果总表

| # | ID | 名称 | §5.5 声明值 | 代码实际值 | 状态 | 超期倒计时（28 天） | constraint | 引用位置 | 一致？ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | P-04 | Stage 2 意图分类预算 | 2500ms | `LLM_CLASSIFY_TIMEOUT_MS` env，light 档默认 `resolveTimeoutMs() = 2500`（llm-registry.ts:115，E288 临时上调；非 params.ts PARAMS key） | provisional@2026-08-30 | 剩 28 天（截止 2026-09-27，E1 复验门回退） | — | llm-registry.ts（+ classify-smoke/finalize-gates 同步点） | ✅ |
| 2 | P-17 | 低置信标注阈值 | 0.6 | `lowConfidenceThreshold: 0.6` | 定稿 | n/a | P-17 ≥ P-16 (0.4) | params.ts | ✅ |
| 3 | P-22 | relevance 默认权重 | 0.3 | `relevanceWeight: 0.3` | 定稿 | n/a | — | params.ts | ✅ |
| 4 | P-128 | Stage 5 网页正文单篇注入 prompt 上限 | 1500字符 | `synthesizePageTextChars: 1_500` | 定稿（E272 签认） | n/a | — | params.ts | ✅ |
| 5 | P-82 | 候选路由歧义差阈值 | 0.15 | `routeCandidateGap: 0.15` | 定稿 | n/a | — | params.ts | ✅ |
| 6 | P-84 | 路由 fallback 置信度折扣 | 0.9 | `fallbackDiscount: 0.9` | 定稿 | **剩 11 天** | — | params.ts | ✅ |
| 7 | P-85 | 子搜索循环上限 | 5次 | `DEFAULT_MAX_SUB_SEARCHES = 5`（硬编码，**非 PARAMS**） | 定稿 | **剩 11 天** | 3 ≤ P-85 ≤ 10 | src/search/search-loop.ts:32 | ⚠️ 数值在代码 + §5.5 双处，**§0.2 数值单家违规** |
| 8 | P-86 | 子搜索覆盖度下限 | 5条 | `DEFAULT_MIN_RESULTS = 5`（硬编码，**非 PARAMS**） | 定稿 | **剩 11 天** | — | src/search/search-loop.ts:33 | ⚠️ 同 P-85，§0.2 数值单家违规 |
| 9 | P-89 | wrapLegacySkill 默认置信度 | 0.8 | `legacySkillConfidence: 0.8` | 定稿 | **剩 11 天** | — | params.ts | ✅ |
| 10 | P-90 | 长期事实注入最低置信度 | 0.6 | `injectMinConfidence: 0.6` | 定稿 | **剩 11 天** | — | params.ts | ✅ |
| 11 | P-92 | 30 天未访问衰减系数 | 0.9/周 | `decayFactor30d: 0.9` | 定稿 | **剩 11 天** | — | params.ts | ✅ |
| 12 | P-94 | 长期事实归档阈值 | 0.3 | `archiveThreshold: 0.3` | 定稿 | **剩 11 天** | — | params.ts | ✅ |
| 13 | P-95 | 路由特征 actionType 权重 | 0.3 | `actionTypeWeight: 0.3` | 定稿 | **剩 11 天** | sum(P-95..P-102)=1.0 | params.ts + router-v2.ts | ✅ |
| 14 | P-96 | 路由特征 targetDomain 权重 | 0.25 | `targetDomainWeight: 0.25` | 定稿 | **剩 11 天** | sum(P-95..P-102)=1.0 | params.ts | ✅ |
| 15 | P-97 | 路由特征 scope 权重 | 0.15 | `scopeWeight: 0.15` | 定稿 | **剩 11 天** | sum(P-95..P-102)=1.0 | params.ts | ✅ |
| 16 | P-103 | 路由候选 base 最低分 | 0.29 | `routeBaseThreshold: 0.29` | 定稿 | **剩 11 天** | P-103 ≤ P-80 (0.75) | params.ts | ✅ |
| 17 | P-104 | 单次路由最多候选数 | 3 | `routeMaxCandidates: 3` | 定稿 | **剩 11 天** | 1 ≤ P-104 ≤ 10 | params.ts | ✅ |
| 18 | P-10 | v1.0 全量验收（替 P-09） | 5 条件链 | `P-10` 在 v1 验收报告逐条落地 | provisional@2026-08-24 | **剩 22 天**（截止 2026-09-21） | — | v1-acceptance-report-2026-08-26.md | 🟡 条件③「成熟度 L2+」未达成（R-4 LOW） |
| 19 | P-105 | 模型路由默认档 | medium | `modelRouterDefaultTier: 'medium'` | provisional@2026-08-16 | **剩 14 天**（截止 2026-09-09） | — | params.ts + router | ✅ |
| 20 | P-106 | 模型路由轻档最低置信度 | 0.9 | `modelRouterLightConfidence: 0.9` | provisional@2026-08-16 | **剩 14 天** | — | params.ts | ✅ |
| 21 | P-107 | Provider fallback 链上限 | 3家 | `providerFallbackMax: 3` | provisional@2026-08-16 | **剩 14 天** | — | params.ts | ✅ |
| 22 | P-132 | 融合评分答案覆盖加成权重 | 0.15 | `coverageScoreWeight: 0.15` | provisional@2026-08-28 | **剩 26 天**（截止 2026-09-25） | — | params.ts + fusion.ts | ✅ |
| 23 | P-133 | 跨域转载同文 Jaccard 阈值 | 0.75 | `syndicatedDupJaccard: 0.75` | provisional@2026-08-28 | **剩 26 天** | — | params.ts | ✅ |
| 24 | P-134 | Stage 5 合成单次 maxTokens | 1500 | `synthesisMaxTokens: 1_500` | provisional@2026-08-28 | **剩 26 天** | — | params.ts | ✅ |
| 25 | P-136 | 数值形态密度加权 | 0.15 | `numericPatternBonus: 0.15` | provisional@2026-08-28 | **剩 26 天** | — | params.ts | ✅ |
| 26 | P-137 | 数值 predicate 补检索后缀 | "数据 参数 对比" | `numericSupplementSuffix: ' 数据 参数 对比'` | provisional@2026-08-28 | **剩 26 天** | — | params.ts | ✅ |
| 27 | P-138 | 数值形态密度计数上限 | 5 | `numericPatternCountCap: 5` | provisional@2026-08-28 | **剩 26 天** | — | params.ts | ✅ |
| 28 | P-139 | 数值 predicate 增强子查询轮数上限 | 2轮 | `numericJudgeExtraSearchCap: 2` | provisional@2026-08-29 | **剩 27 天**（截止 2026-09-26） | — | params.ts | ✅ |
| 29 | P-141 | 运行时看门狗告警阈值 | 0.2 | `watchdogTimeoutRatio: 0.2` | provisional@2026-08-29 | **剩 27 天** | — | params.ts | ✅ |
| 30 | P-142 | github-reader GitHub API JSON 缓存 TTL | 300000ms | `githubApiCacheTtlMs: 300_000` | provisional@2026-08-29 | **剩 27 天** | — | params.ts | ✅ |

---

## 2. 核对结果统计

| 维度 | 数量 | 比例 |
|---|---|---|
| ✅ 完全一致（值 + 状态 + 引用） | 27 | 90% |
| ⚠️ 数值双处存储（§0.2 违规） | 2（P-85、P-86） | 6.7% |
| 🟡 状态正确但有外部未达成条件 | 1（P-10 条件③） | 3.3% |
| ❌ 不一致 | 0 | 0% |

---

## 3. 关键发现

### 3.1 ⚠️ R-NEW（建议编号 R-7）：P-85 / P-86 数值双处存储

- **现象**：§5.5 表登记 P-85=5次、P-86=5条；实际值在 `src/search/search-loop.ts:32-33` 硬编码为 `DEFAULT_MAX_SUB_SEARCHES = 5` 与 `DEFAULT_MIN_RESULTS = 5`，**未走 PARAMS**。
- **违反条款**：§0.2.1 数值单家规则 + §5.1 登记纪律
- **L1 业务影响**：✅ 中等（修改时易遗漏一处导致行为漂移；E239 修复 `extractPartNumber` 时已暴露此风险）
- **L2 修复成本**：✅ ≤0.25 人天（迁移至 params.ts + 改 1 个 import）
- **修复路径**：
  1. `params.ts` 新增 `subSearchLoopCap: 5` 与 `subSearchCoverageFloor: 5` 两 key
  2. `search-loop.ts` 删除硬编码常量，改 `import { PARAMS } from '../config/params.js'`
  3. `PARAM_IDS` 反向映射补登记
  4. 同步 `scripts/doc-lint.ts` C8 校验（已有 65 key → 67 key）
- **预估成本(¥)**：¥0（纯结构性迁移）
- **置信度**：HIGH（直接对比）
- **回归影响**：bench:na（行为值不变）

### 3.2 🟡 P-10 条件③ 未达成（R-4 LOW 已记录）

- v1.0 全量验收 §5 项之一「成熟度 §12.4 达 L2+」依赖真实使用累积，不在本次审计可强制范围内。
- 已在架构审计报告 §7.2 R-4 LOW 项登记，按 E197 复验门 + 真实使用累积。

### 3.3 🟢 全部 30 条抽样无状态机错位

- 原距 4 周超期检查最近的 2026-08-13 批（**20 项**：路由权重 P-95~P-104 共 10 项 + 其他 10 项 P-82 / P-84~P-86 / P-89~P-94）已于 2026-08-30 按 §0.3 晋升定稿（**E289**，owner 拍板），本批 provisional 治理债务清零。
- 本抽样覆盖该批 **13/20**（未列 7 项：P-91、P-93、P-98~P-102），晋升时全 20 项状态在 §5 注册表同步更新。
- 后续超期检查：P-105~P-107（provisional@2026-08-16，截止 2026-09-09）、P-10（provisional@2026-08-24，截止 2026-09-21）、08-28/29 批（P-132~P-142，截止 09-25/09-26/09-27）。

---


### 3.4 勘误：P-04 引用位置与状态（2026-08-30 下午）

- **原记录（本表第 1 行）**：`stageBudgets.classifyMs = 1750` (src/agent/pipeline.ts)，状态定稿。
- **勘误**：代码库中不存在 `stageBudgets` 对象或 `classifyMs` key，P-04 也非 `params.ts` 的 PARAMS key——该超时经 `src/search/llm-registry.ts` `resolveTimeoutMs()`（light 档）实现：读环境变量 `LLM_CLASSIFY_TIMEOUT_MS`，无配置时默认 2500ms（llm-registry.ts:115）；另有 `scripts/classify-smoke.ts`（显示默认）与 `scripts/finalize-gates.ts:127`（E1 建议值上限）两处同步点。
- **状态更新**：E288（2026-08-30）已按 R-1 修复路径 1 将 [P-04] 1750→2500ms，§5.5 状态 定稿→provisional@2026-08-30（bench:B-20260830-01 classify 8/10 达标）。
- **待 owner 拍板**：维持 2500ms（选项 A 生效中）或回退 1750ms（选项 B，等 provider 自然恢复）。2026-08-30 12:18 抽样 6/10、4/8 LLM 调用超 2500ms → 建议维持 A，按矩阵 09-01/09-02 信号监控，稳定后走 E1 复验门（n≥30 / 超时率 ≤10% / 准确率 ≥80% / p95×1.2）重定稿回退。
## 4. 抽样方法论说明（框架 v2.0 §6 沟通原则）

- **抽样代表性**：按状态机分层 + 按业务域分层（路由 / 记忆 / LLM / 数值 predicate / 看门狗 / GitHub cache / 核心 / E272 签认）
- **核对工具**：`Read` + `Grep` 静态对比 + `npm run doc-lint`（C8 PARAM 代码引用校验通过 65 key 全部被引用）
- **未覆盖**：P-10 条件③的「成熟度 L2+」真实使用累积（属业主侧运营指标，非审计可量化项）
- **不替代**：本抽样不替代 §5 全 142 项登记的逐项审查；T+3 内完成 30/142 ≈ 21% 抽样，剩余 112 项建议在 v2.5 交付前一次性扫尾（按 §0.2.1 文档治理 §5.5 ↔ params.ts ↔ 附录 A 三处一致）

---

## 5. 交付状态

- **交付物 1** ✅ 已完成
- **后续动作**：R-NEW（P-85/P-86 数值单家）建议作为 R-7 加入审计报告 §7.2 附录
- **关联交付**：交付物 4（R-3 CodeGraph 隔离）实施时可同步检查 §5.5 ↔ 代码数值是否还有遗漏的双处存储
