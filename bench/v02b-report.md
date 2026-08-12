# v0.2b 验收报告

> 日期：2026-08-13｜分支：v0.2b｜验收：WP0-WP6
> 结论：**验收通过（含遗留项）**——L2 蒸馏管道就绪、MemoryCoreStore 可用、ExperienceManager/Skill 生命周期落地、74/74 零丢失迁移、31 条回归通过；E1/E2 复验门首轮未触发重开。

## 1. 工作包状态

| WP | 内容 | 状态 |
|---|---|---|
| WP0 | MemoryCore sidecar 启动（端口 8420，DeepSeek LLM，BM25 zh） | ✅ |
| WP1 | L0 零丢失迁移 74/74 | ✅ |
| WP2 | MemoryCoreStore（同接口，分页 recall，[P-42] 3s 超时） | ✅ |
| WP3 | 蒸馏管道就绪（L1/L2 调度 + DeepSeek 调用 + 写入不阻塞） | ✅（L1 提取质量遗留） |
| WP4 | ExperienceManager（检索/置信度演化/衰减/冷存/复审） | ✅ |
| WP5 | Skill 生命周期（四字段/使用反馈/特异性优先/冷存） | ✅ |
| WP6 | 31 条回归 + 迁移校验 + 蒸馏冒烟 | ✅ |

## 2. WP6 回归结果（2026-08-13 全量）

- 31/31 全部返回结果，3 条 safety（L05/S01/S02 规则③），无 0 分硬答。
- gate 分布：none=17 / low_confidence=11 / safety=3。
- confidence 中位数约 0.79；平均耗时约 9s。
- 分引擎时延与逐条明细见 `bench/v02a-report.md`（判定结果：[P-12] 通过 30/31）。
- 本次回归前修复配额日期 bug：`FileQuotaStore` 改用本地日期（原 UTC 导致中国时区凌晨配额不重置，Bocha 首轮仅 5 次可用，现已修正）。

## 3. 关键验收证据

| 项 | 证据 |
|---|---|
| 历史迁移 | `data/memory.db` 74 条 L0 → MemoryCore，零丢失校验 74/74（备份 `memory.db.bak-v0.2b`） |
| 蒸馏冒烟 | L1/L2 调度、DeepSeek 调用、L1 complete、写入不阻塞 |
| 模块测试 | 78/78 单测全绿（含新增实体精确匹配、AbortError timedOut、配额跳过日志用例） |
| 回归 | `npm run bench:v02a` 31/31 |

## 3.1 E1/E2 复验门首轮复核（2026-08-13）

- E2：累计 n=62（两轮回归），Bocha 超时 0.0%、AnySearch 超时 8.1%；最近一轮双引擎均 0/31 超时。AnySearch@5s ≤30%、Bocha ≤10%，未触发重开。
- E1：`classify:smoke --rounds=3` 累计 n=30，2000ms 下超时率 0.0%，准确率 80.0%（S02/L05 偏差仍由规则③兜底），未触发重开。
- 配套修复：分类默认超时 500ms → 2000ms（对齐 [P-04]）；metrics 增加配额跳过标记；新增 `recheck-gates` 与 `classify-metrics.jsonl`。
- 登记：需求文档附录 A E7（2026-08-13）。

## 4. 遗留问题

1. **L1 提取**：已缓解（E6）——项目侧 distill worker 全量 137 条 L0 → 191 条记忆；MemoryCore 内置 L1 不作为主路径。
2. **[P-16]/[P-17] 维持 provisional**：融合评分已修复中文相关性、精确型号匹配与 5 轮校准聚合，正负例分布仍重叠（修订报告见 `bench/v02a-rule2-calibration.md`）；复验门不变。
3. **MemoryCore delete 缺口**：结论已定，局部清理不可靠，`--reset` 采用整目录重建（已验证 137/137）；排查结论见 `bench/v02b-memorycore-delete-issue.md`。
4. **P-04/P-02 定稿**：E1/E2 复验门首轮未触发重开，维持 provisional；定稿继续等 WP11 回灌样本 n≥30。
5. **Experience/Skill 集成**：模块已就绪，pipeline 注入经验到合成层待 v1.0 或回灌后接入。

## 5. 下一步

- 日常使用积累回灌样本，推进 [P-16]/[P-17] 与 P-04/P-02 定稿。
- v0.2b 已打 tag；后续变更按附录 A 登记（E7 已入档）。
