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
| 模块测试 | 126/126 单测全绿（含实体变体、答案覆盖门控、软件官方源识别、错误主题/FAQ 降权、Experience/Skill 注入、Skill 深度输出、Skill 安装器、三层意图路由、执行器注册表、LLM 特征提取、工作记忆消歧、查询改写、子搜索循环、多源质量统计、多模态字段等新增用例）；集成测试 10/10（params/registry/枚举一致性/INT-005） |
| 回归 | `npm run bench:v02a` 31/31 |

## 3.1 E1/E2 复验门首轮复核（2026-08-13）

- E2：累计 n=62（两轮回归），Bocha 超时 0.0%、AnySearch 超时 8.1%；最近一轮双引擎均 0/31 超时。AnySearch@5s ≤30%、Bocha ≤10%，未触发重开。
- E1：`classify:smoke --rounds=3` 累计 n=30，2000ms 下超时率 0.0%，准确率 80.0%（S02/L05 偏差仍由规则③兜底），未触发重开。
- 配套修复：分类默认超时 500ms → 2000ms（对齐 [P-04]）；metrics 增加配额跳过标记；新增 `recheck-gates` 与 `classify-metrics.jsonl`。
- 登记：需求文档附录 A E7（2026-08-13）。

## 3.2 E8 融合评分修正（2026-08-13 续作）

- 校准脚本修正 `how → how_to`、`github → github_analysis` 意图映射，并补 `--debug` 正例误伤/负例漏拦输出。
- 融合层新增意图化答案覆盖评分（answerCoverage），低词面相关性且无答案覆盖的非官方结果降权；官方源与高答案覆盖页面不受误伤。
- 实体过滤器补齐 `TPS5430-Q1` 连字符变体；软件项目官方源识别覆盖 Tauri/OpenWorker 等 GitHub 官方仓库。
- SEO 噪声识别扩展到聚合页、供应商页、词典页、热点清单。
- 校准结果：阈值 0.6 正例保留 67/75（持平），负例拦截 5/18（修订前 3/18）；[P-16]/[P-17] 继续 provisional，阈值未调整。
- 登记：需求文档附录 A E8（2026-08-13）。

## 3.3 P-04/P-02 定稿评估（2026-08-13 续作）

- 新增 `npm run finalize:gates`，输出 E1/E2 定稿评估证据。
- E1：n=30，超时率 0.0%，准确率 80.0%，p95=1140ms，推荐 `[P-04]`=1500ms（原 provisional 2000ms）。
- E2：Bocha n=105 超时率 5.7%，AnySearch n=125 超时率 12.0%；AnySearch p95=4577ms / max=4917ms，`[P-02]`=5s 保持成立。
- 两个复验门均 PASS；[P-04]/[P-02] 仍为 provisional，等待 owner 签认后晋升。
- 登记：需求文档附录 A E9（2026-08-13）。

## 3.4 E10 错误主题/FAQ 降权（2026-08-13 续作）

- troubleshooting 查询带具体错误词（DRC/clearance/constraint/NACK 等）时，标题未命中这些词的结果降权，E15 Bocha 铺铜报错页不再霸占 DRC clearance 报错查询。
- how_to 查询中「常见疑问/FAQ」标题但无操作流程的结果降权。
- 校准结果：阈值 0.6 正例保留 67/75（持平），负例拦截 6/18（E8 后 5/18、修订前 3/18）；[P-16]/[P-17] 继续 provisional，阈值未调整。
- 登记：需求文档附录 A E10（2026-08-13）。

## 3.5 WP11 冷调用续采（2026-08-13 续作）

- 追加 4 轮 `classify:smoke`（n=70）与 4 轮 `search:smoke`（Bocha n=145 / AnySearch n=165）。
- E1 复核：超时率 0.0%，准确率 80.0%，p95=1406ms，`[P-04]` 推荐值稳定在 1750ms。
- E2 复核：Bocha 超时率 4.1%、AnySearch 9.1%，`[P-02]`=5s 保持成立。
- 两个复验门仍 PASS；[P-04]/[P-02] 继续 provisional，等待 owner 签认。
- 登记：需求文档附录 A E11/E12/E13/E14（2026-08-13）。

## 3.6 Experience/Skill 管道注入（2026-08-13 续作）

- `pipeline.ts` 接入本仓库的 `ExperienceManager` 与 `SkillLifecycle`：检索经验、命中技能，注入 Stage 5 合成上下文；LLM 合成成功后记录经验/技能使用。
- `src/main.ts` CLI 默认启用注入；真实冒烟通过（`STM32F103C8T6 最大主频是多少` 正常返回）。
- 新增单测：Stage 5 经验/技能上下文注入 + pipeline 注入与使用记录。
- 登记：需求文档附录 A E15（2026-08-13）。

## 3.7 Skill handler 深度输出（2026-08-13 续作）

- `pipeline.ts` 命中 Skill 后调用 registry 对应 handler，结构化结果注入 Stage 5「技能深度分析」；占位 handler 返回 null 时跳过。
- 真实 CLI 冒烟通过（`STM32F103C8T6 最大主频是多少` 正常返回）。
- 新增 Stage 5 与 pipeline 深度输出单测。
- 登记：需求文档附录 A E17（2026-08-13）。

## 3.8 GitHub/Gitee 代码托管联动（2026-08-13 续作）

- 新增 `scripts/push-to-hosts.ts` 与 `npm run push:hosts`：dry-run 计划 → `npm test` + build 预检 → commit → push GitHub/Gitee。
- 账号写入配置：GitHub `chuangxiaohui-cloud`、Gitee `cxv138`；Token 仅从环境变量读取，不落盘。
- 已验证 `--dry-run` 输出变更清单与目标仓库；真实推送需显式 `--yes`。
- 首推结果：Gitee `cxv138/ai-butler-v01` 私有仓库创建并推送成功；GitHub 因 Token 无创建仓库权限（403）待补权限后重推。
- 登记：需求文档附录 A E18/E19（2026-08-13）。

## 3.9 Skill 市场安装器（2026-08-13 续作）

- 新增 `src/skills/install.ts` 与 `npm run install:skill`：manifest 校验 → 生成 Skill 目录 → 自动注册 registry。
- 已做端到端安装验证（临时 `e2e-test-skill` 安装后清理）。
- 新增 4 条 Skill 安装单测。
- 登记：需求文档附录 A E20（2026-08-13）。

## 3.10 主 Agent 意图路由（2026-08-13 续作）

- 新增 `src/agent/router.ts` 与 `npm run route:query`：按 §2.2 镜片模型输出主镜片，按 §4 一刀测试输出知识/执行、Ask/Craft/Plan、是否搜索、澄清。
- `pipeline.ts` 接入路由：澄清短路 + 主镜片注入 Stage 5 系统提示。
- 新增 7 条路由单测与 1 条 Stage 5 主镜片注入单测。
- 登记：需求文档附录 A E21（2026-08-13）。

## 3.11 三层意图路由 Phase 1（2026-08-13 续作）

- 新增 `intent-feature.ts` / `routing-table.ts` / `router-v2.ts`：特征提取 → 规则路由表 → 置信度门控三层架构。
- `pipeline.ts` 接入 v2：执行/本地动作未接入时明确返回，低置信返回选项式消歧。
- 新增 `[P-80]` / `[P-81]` / `[P-82]` 路由阈值参数。
- 6 条冒烟 case 全部通过，114/114 单测。
- 登记：需求文档附录 A E22（2026-08-13）。

## 3.12 三层路由规格对齐（2026-08-13 续作）

- 特征权重改为常数分母，`scope=unknown` 参与打分；R001-R006 boost 对齐审阅规格。
- 新增 `EXECUTOR_REGISTRY` 与 `not_wired` 诚实降级，pipeline 明确返回“路由成功 + 执行器尚未接入”。
- 新增 `extraction_source`、`[P-83]` 特征提取超时、`[P-84]` fallback 折扣；退役旧 `router.ts`。
- 6 条 case 精确 score 断言 + executor 单测，114/114 全绿。
- 登记：需求文档附录 A E23（2026-08-13）。

## 3.13 Phase 2：LLM 特征提取 + 工作记忆消歧（2026-08-13 续作）

- 新增 `src/agent/extract.ts`：LLM → 校验 → 规则 fallback，fallback 走 `[P-84]` 折扣。
- `routeV2WithLLM` 接入 pipeline，`missing_referent` 选项引用最近记忆候选。
- `createLightClient` 支持 `[P-83]` 超时覆盖；`npm run route:query -- --llm` 可真实冒烟。
- 118/118 单测全绿。
- 登记：需求文档附录 A E24（2026-08-13）。

## 3.14 搜索管道：查询改写 + 子搜索循环（2026-08-13 续作）

- 新增 `query-rewrite.ts`：口语 → 1-4 条子查询，LLM 优先、规则兜底。
- 新增 `search-loop.ts`：Stage 3 子搜索循环 + LLM 覆盖度判断，`[P-85]` 次上限、`[P-86]` 结果下限。
- `pipeline.ts` Stage 3 切换为 `runSearchLoop`。
- 123/123 单测全绿。
- 登记：需求文档附录 A E25（2026-08-13）。

## 3.15 多源质量闭环（2026-08-13 续作）

- 新增 `src/search/source-stats.ts`：按 源 × 意图 记录调用/成功/耗时。
- `runSearchLoop` 接入统计，`npm run sources:stats` 可查看。
- 124/124 单测全绿。
- 登记：需求文档附录 A E26（2026-08-13）。

## 3.16 多模态接入层 Week 1（2026-08-13 续作）

- 新增 params 双结构（P-87~P-94）、SkillDeps/RawFileLike/VLMClient 契约、UserContext 类型。
- 新增 `multimodal-preprocessor.ts`：零成本信号提取 + maybeFastDescribe（P-87/P-88）。
- registry 新增 `ExecutableSkill / wrapLegacySkill / toDisplayText`，旧接口未动。
- `tests/integration/` 建成，集成 10/10，单测 124/124。
- 登记：需求文档附录 A E27（2026-08-13）。

## 3.17 Week 1 C3：Skill 注册表迁移（2026-08-13 续作）

- `getSkills/findSkill` 返回 `ExecutableSkill`，6 项预置 Skill 全部过 `wrapLegacySkill`。
- `pipeline.ts` Skill 深度输出切换为 `execute + toDisplayText`。
- 安装器目标数组更新为 `LegacySkillDef[]`。
- 124/124 单测 + 10/10 集成全绿。
- 登记：需求文档附录 A E28（2026-08-13）。

## 3.18 Week 1 C4：IntentFeature 多模态字段（2026-08-13 续作）

- `IntentFeature` 新增 `hasImage / hasDocument / attachmentTypes / fastImageDescription`。
- 规则提取与 LLM 提取均接收附件信号，路由入口支持附件参数。
- 未扩枚举、未加路由。
- 126/126 单测 + 10/10 集成全绿。
- 登记：需求文档附录 A E29（2026-08-13）。

## 3.19 Week 1 收口 C5（2026-08-13 续作）

- `npm run test:all` 最终全绿：单测 126/126 + 集成 10/10。
- `doc-lint` 0 FAIL / 0 WARN。
- 打基线 tag `v0.3-week1`，Week 1 收口。
- 登记：需求文档附录 A E30（2026-08-13）。

## 4. 遗留问题

1. **L1 提取**：已缓解（E6）——项目侧 distill worker 全量 137 条 L0 → 191 条记忆；MemoryCore 内置 L1 不作为主路径。
2. **[P-16]/[P-17] 维持 provisional**：E8/E10 已补答案覆盖门控、型号变体、官方源识别与错误主题/FAQ 降权，阈值 0.6 负例拦截 6/18、正例保留 67/75；复验门不变（修订报告见 `bench/v02a-rule2-calibration.md`）。
3. **MemoryCore delete 缺口**：结论已定，局部清理不可靠，`--reset` 采用整目录重建（已验证 137/137）；排查结论见 `bench/v02b-memorycore-delete-issue.md`。
4. **P-04/P-02 定稿**：E1/E2 复验门样本已达标且评估 PASS（E9/E11-E14）；[P-04] 推荐 1750ms、[P-02] 保持 5s，等待 owner 签认后晋升。
5. **Experience/Skill 集成**：最小闭环已接入（E15），Skill handler 深度输出已接入（E17）——经验/技能 + 深度结构化输出注入合成上下文并记录使用。

## 5. 下一步

- 日常使用积累回灌样本，推进 [P-16]/[P-17] 与 P-04/P-02 定稿。
- v0.2b 已打 tag；后续变更按附录 A 登记（E7-E30 已入档）。
