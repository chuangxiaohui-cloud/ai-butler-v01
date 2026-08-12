# v0.2b 验收报告

> 日期：2026-08-13｜分支：v0.2b｜验收：WP0-WP6
> 结论：**验收通过（含遗留项）**——L2 蒸馏管道就绪、MemoryCoreStore 可用、ExperienceManager/Skill 生命周期落地、74/74 零丢失迁移、31 条回归通过；L1 提取质量待调。

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
| 模块测试 | 71/71 单测全绿（含 MemoryCoreStore 3 项、Experience 3 项、SkillLifecycle 4 项） |
| 回归 | `npm run bench:v02a` 31/31 |

## 4. 遗留问题

1. **L1 提取质量**：5 条中文对话 L1 提取返回 0 条记忆，L2 跳过；排查方向见 `bench/v02b-l1-extraction-issue.md`。
2. **[P-16]/[P-17] 维持 provisional**：正负例融合分重叠，见 `bench/v02a-rule2-calibration.md`。
3. **MemoryCore delete 缺口**：`deleteL0BySession` 对 standalone 文件存储无效；`--reset` 迁移不可用，采用清空重建。后续可向 MemoryCore 反馈。
4. **P-04/P-02 复验门**：WP11 冷调用 n≥30 后复核（E1/E2）。
5. **Experience/Skill 集成**：模块已就绪，pipeline 注入经验到合成层待 v1.0 或回灌后接入。

## 5. 下一步

- 排查 L1 提取质量问题（MemoryCore prompt/解析）。
- 日常使用积累回灌样本，推进 [P-16]/[P-17] 与 P-04/P-02 定稿。
- 若 v0.2b 需打 tag：等 L1 提取质量有结论后按文档治理登记。
