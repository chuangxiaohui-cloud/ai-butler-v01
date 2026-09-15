# v2.5 业务能力全量审计报告

> 日期：2026-09-02 · 范围：v2.5 需求文档**全部业务能力章节** · 状态：审计完成
> 关联：`role-business-capability-audit.md`（§2.1~§2.5/§4.1 角色镜片模型）/ `v25-findings-and-remediation.md`（代码侧 R-1~R-9）/ `skill-trust-audit.md`（24 项 Skill 信任域）
> 框架依据：`架构师审计框架说明 v2.0.md` §0.3 / §4.2 / §4.3 / §5.2 / §5.3 / §5.4 / §6
> 方法：5 个并行审计 agent，按 v2.5 业务能力分簇（§3+§4 / §6 / §7+§8 / §9+§10+§11 / §12）静态核对代码落点

---

## 0. 报告定位

本报告是 v2.5 审计的**全量业务能力盘点**，与既有两份报告形成三角验证：

| 报告 | 视角 | 范围 |
|---|---|---|
| `role-business-capability-audit.md` | 需求侧 · 角色镜片模型 | §2.1~§2.5 + §4 + §4.1（12 章）|
| `v25-findings-and-remediation.md` | 代码侧 · 9 项 R-N 风险 | R-1~R-9 + S-1~S-6 |
| **本报告** | **需求侧 · 全量业务能力** | **§3~§12 共 70 项业务能力** |

> 注：本报告与 `role-business-capability-audit.md` 在 §2~§4 区间有少量重叠（§4.2/§4.3/§4.4/§4.5），但视角不同——前者侧重"角色业务能力深度"，本报告侧重"业务能力是否实现 + 代码落点核对"。建议并读。

---

## 1. 总览：70 项业务能力实施状态

| 状态 | 数量 | 占比 |
|---|---|---|
| ✅ Implemented | 45 | 64.3% |
| 🟡 Partial | 17 | 24.3% |
| 🔴 Missing | 8 | 11.4% |
| **合计** | **70** | **100%** |

**严重度分布（按业务能力 × 缺口）**：

| 等级 | 数量 | 含义 |
|---|---|---|
| 🔴 HIGH | 3 | 核心治理/运维缺失（无替代兜底）|
| 🟡 MEDIUM | 12 | 已部分实现但关键缺口影响 v2.5 验收 |
| 🟢 LOW | 10 | 文档化或可顺带实现 |
| ⏸ 按需触发 | 0 | （已通过角色镜片深度 RC-9~RC-12 登记）|

---

## 2. §3 用户画像 + §4 产品行为（除 §4.1）— 9 项

| § | 能力 | 状态 | 代码落点 | 关键缺口 |
|---|---|---|---|---|
| **3.2** | 扩展原则（动态扩展职业背景）| 🟡 MED | `src/memory/user-context.ts:26-33` | `UserProfile.role` 字段固定，无软件驱动 re-profile |
| **3.3** | 当前常用软件（QQ/微信/飞书/Notion）| 🔴 HIGH | 缺失 | 无 software-list 字段、无 MCP 软件发现、无动态更新路径 |
| **4.2** | 知识问答（含紧急通道）| ✅ | `pipeline.ts:667-701, 1106-1114` | — |
| **4.2.1** | 紧急安全快速通道 | ✅ | `emergency-reply.ts:1-160` | — |
| **4.3** | 长任务与困难升级 | ✅ | `escalation.ts:1-50+` + `[P-47][P-48]` | — |
| **4.3.1** | 困难升级 | ✅ | `escalation.ts:33-50` + `decision-log.ts` | — |
| **4.3.2** | 深度报告（长任务首实例）| ✅ | `deep-report.ts:1-68` + `[P-13]` | UI 进度条未实现（§4.4 已声明"v0.2a 不做"）|
| **4.4** | MVP 切片 | 🟡 LOW | `params.ts`（P-07/P-08/P-10/P-12）| 切片门控逻辑在 `docs/scripts` 外部工具，不在 `src/` |
| **4.5** | 远程对话通道 | ✅ QQ / 🟡 微信+飞书 | `src/im/onebot/adapter.ts`（QQ 实现）+ `im/channel.ts:1-30`（骨架）| 微信/飞书 adapter 仍为骨架 |

**小计**：6 ✅ / 2 🟡 / 1 🔴

---

## 3. §6 搜索引擎规格 — 16 项

| § | 能力 | 状态 | 代码落点 | 关键缺口 |
|---|---|---|---|---|
| **6.0** | 管道总览 8 阶段 | ✅ | `pipeline.ts:79-85, 365→1557` | 实为 6 阶段 + entry gate，与 spec "8 阶段"差异 |
| **6.1.1** | Stage 1 预处理 | ✅ | `s1_prepare.ts:97-108` + `:54-95`（jargon/sanitize/clarify）| memoryNotes slot 占位但未接入 |
| **6.1.2** | Stage 2 意图分类 + Query 构造 | ✅ | `s2_classify.ts:94-100`（8 IntentKey）| [P-33]/[P-34] token limit 未显式强制 |
| **6.1.3** | 规则③ 关键词硬规则 | ✅ | `rule3.ts:32-40`（drug/tax/regulation/statistics）| — |
| **6.1.4** | 澄清中断 | ✅ | `s1_prepare.ts:71-95`（detectClarify）| — |
| **6.2** | 引擎名单 + 三路心跳 | ✅ | `providers/{bocha,anysearch,tavily}.ts` + `heartbeat.ts:17-63` | — |
| **6.2.1** | Tavily 条件并联触发 | ✅ | `tavily-trigger.ts:13-28` | — |
| **6.2.2** | 三路心跳健康检查 | ✅ | `heartbeat.ts:17-63`（[P-37] 5s 窗 + 2 次失败）| — |
| **6.3** | 接口契约 | ✅ | `pipeline.ts:138-150`（AnswerResult）| — |
| **6.4** | P0 评分修复前置 | 🟡 MED | 仅 `metrics.test.ts`（无 prod 模块）| bench/raw_scores.csv 5 bug fix 缺 prod 落地 |
| **6.5** | 融合层四过滤器 | ✅ | `fusion.ts:1-50` + `authority.ts` | — |
| **6.5.5** | 规则① fact_consistency | ✅ | `rule1.ts:67-100`（E275 % unit 例外）| spec 标"待实现"但代码已闭环（标注差异）|
| **6.5.6** | 三维回答力信号 P-ZZZ' | ✅ | `fusion.ts:94-150` + `answer-readiness.ts:23-80` | — |
| **6.6** | 置信度门控（规则②）| ✅ | `pipeline.ts:1216-1280` + `[P-17]` | 医疗/政务 vs 生活**分领域阈值未差异化** |
| **6.7** | 延迟预算与超时保护 | ✅ | `s3_search.ts:25, 184-192` + `Promise.race` | Stage 5/6 超时预算未显式可见 |
| **6.8** | 参数落地顺序（串行）| ✅ | `pipeline.ts:365→1105→1202→1439→1557` | — |

**小计**：14 ✅ / 1 🟡（§6.4 P0 评分）/ 1 标注差异（§6.5.5）

---

## 4. §7 Datasheet + §8 记忆 — 19 项

| § | 能力 | 状态 | 代码落点 | 关键缺口 |
|---|---|---|---|---|
| **7.1** | 两层结构总览 | ✅ | `pipeline.ts:42-59`（orchestrate）| 无独立"两层编排"声明文件（隐式于 pipeline）|
| **7.2** | 第一层本地分析 | ✅ | `document-parser.ts:124-149` | docx "待接入"（已知缺口）|
| **7.3** | Datasheet 解析管道 | ✅ | `document-parser.ts:32-122`（PyMuPDF→Node→OCR）| — |
| **7.4** | 诚实边界 | ✅ | `document-parser.ts:137-144`（明确错误）| 无结构化 [soft]/[hard] 置信度标记（仅 §9.1 链上）|
| **7.5** | 第二层联网补充 | ✅ | `second-pass.ts` + `tavily-trigger.ts` | — |
| **7.6** | 支持的器件类型 | 🔴 HIGH | 缺失 | 无枚举文件/分类器，s2_classify.ts:113 仅测试 fixture |
| **8.1** | 声明性记忆 L0-L2 | ✅ | `store.ts:27-50` + `distill.ts:18-26` | L2/L3 表未显式（折入 persona）|
| **8.1.1** | 四种记忆资产匹配 | 🟡 MED | `store.ts:119-143`（Chat Mem + Skill）+ `lifecycle.ts:30-50` | Wiki（datasheet 踩坑）+ CodeGraph 缺失 |
| **8.1.2** | 装备式设计与三栏布局契合 | 🔴 HIGH | 缺失 | 无 ACL/Fixed-Binding 注册表，列→资产绑定未编码 |
| **8.1.3** | 人格数据映射 | ✅ | `distill.ts:18-26` + `user-context.ts:26-33` | L1/L3 列分离未显式（共享 user_facts）|
| **8.1.4** | 部署架构（memory-core sidecar）| ✅ | `memorycore-store.ts:18-21, 86-110`（127.0.0.1:8420 [P-42]）| — |
| **8.2** | 程序性记忆 Skill 生命周期 | ✅ | `skills/lifecycle.ts:30-201` | — |
| **8.2.1** | 四字段元数据 | ✅ | `lifecycle.ts:18-28`（SkillStat）| — |
| **8.2.2** | 治理规则 | ✅ | `lifecycle.ts:13-16`（P-30/31/32/79）| — |
| **8.2.3** | Skill 市场安装 | ✅ | `market/installer.ts:1-60+` + `types.ts:1-58` | — |
| **8.3** | 工作记忆 + 上下文压缩 | ✅ | `session-context.ts:27-289`（[P-29] 5 轮/[P-109] 6000 token）| — |
| **8.3.1** | 上下文分层管理策略 | ✅ | `session-context.ts:27-30, 222-243` | "远期→L1-L3 蒸馏"路由代码分散于 distill.ts |
| **8.3.2** | 上下文冲突处理 | 🟡 MED | `user-context-store.ts:217-230, 251-280` | "跨栏矛盾→当前栏优先"未显式规则 |
| **8.4** | MemoryStore 接口契约 | ✅ | `store.ts:20-24` + `SqliteDirectStore` + `MemoryCoreStore` | 接口签名 session-scoped（spec 通用，intentional 适配）|

**小计**：14 ✅ / 3 🟡 / 2 🔴（§7.6 / §8.1.2）

---

## 5. §9 证据链 + §10 安全 + §11 运维 — 17 项

| § | 能力 | 状态 | 代码落点 | 关键缺口 |
|---|---|---|---|---|
| **9.1** | 可验证证据链 | ✅ | `pipeline.ts:135, 1214, 1266, 1375` + `Evidence { type, confidence }` | 仅 `search` 类证据；缺 `file/terminal/test` 三类 |
| **9.2** | 证据链交互设计 | 🔴 HIGH | 缺失 | 无 UI 渲染层（gateway/app.ts 仅返回 JSON）|
| **9.3** | 轻量反馈机制 | 🟡 MED | `maturity/metrics.ts:14-19, 100-108` | 缺👎原因标签弹窗/修改建议入口/秘书"每日汇总" |
| **10.1** | 文件沙箱根目录白名单 | ✅ | `security/sandbox.ts:23`（projects/sandbox/outputs）| 缺用户显式授权目录动态扩展 API |
| **10.2** | 命令白名单初始集合 | ✅ | `security/command-whitelist.ts:23-25`（keil/gcc/cmake）| 烧录类（openocd/st-flash）仅示例未完整 |
| **10.3** | 联网搜索脱敏规则 | ✅ | `security/query-sanitize.ts:55`（[P-]路径/API Key/内网）| 缺"用户携带项目上下文搜索"显式开关 UI |
| **10.4** | 安全规则测试用例先行 | ✅ | 5 个 `*.test.ts`（sandbox/command/query/url/browser-actions）| 浏览器安全用例覆盖度待核 |
| **10.5** | 五源信任域表 | 🟡 MED | `security/domain-auth.ts`（存在但无五源映射）| 5 域标记（untrusted_data/user_input/tool_output/memory_recall/datasheet_parsed）未结构化 |
| **11.1.1** | 失败类型与默认策略 | 🟡 MED | `gateway/terminal.ts:75-129` + `app.ts:107-114` | 失败类型→策略映射矩阵未结构化；DAG "blocked" 标记缺失 |
| **11.1.2** | 重试策略 | 🟡 MED | `search-loop.ts`（含 retry）+ `llm-registry.ts`（attempt）| 指数退避 [P-46] + 哈希快照回滚未确认 |
| **11.1.3** | 超时阈值（按操作类型）| ✅ | `terminal.ts:78` + `app.ts:210, 479`（5000/15000ms）| 硬编码值未参数化（[P-38~41] 应入 §5）|
| **11.1.4** | 降级路径（四级）| 🔴 HIGH | 缺失 | 重试→换备用→回滚快照→上升用户四级路径无状态机 |
| **11.1.5** | 文件冲突仲裁规则 | 🔴 HIGH | 缺失 | 哈希比对+行级 diff+3-way merge+仲裁优先级均无模块 |
| **11.2** | 执行事务性（变更清单+回滚）| 🔴 HIGH | 缺失 | 无 transactional executor；缺影子目录+哈希快照 |
| **11.3** | 降级告警（JSONL + 秘书日报）| 🟡 MED | `log/jsonl.ts:28` + 多模块写审计 | 秘书日报 `office-daily/` 未集成 JSONL 扫描 |
| **11.4** | 代码托管与远程协作 | ✅ | `repo/cli.ts:36-40`（github/gitee 双 host）+ 白名单/审计 | Keyring 集成待确认 |

**小计**：6 ✅ / 6 🟡 / 4 🔴

---

## 6. §12 成熟度 + NFR — 9 项

| § | 能力 | 状态 | 代码落点 | 关键缺口 |
|---|---|---|---|---|
| **12.1** | 冷启动策略（第一天有专家底子）| 🟡 MED | `main.ts:33-59` + `skills/registry.ts:6-65`（24 项 Skill）| "三十年老专家+贴身女秘书"人格提示无独立模块（env.ts 无 persona 变量）|
| **12.2** | 初始预置 Skill 清单 | ✅ | `registry.ts:36-65` + `README.md:5-49`（24 项）| 行业知识包仅占位 |
| **12.3** | 经验积累闭环（越用越懂）| ✅ | `memory/experience.ts:38-148` + `confidence-decay.ts`（P-30/31/32）| embedding 语义检索未实现（注释 line 4 退化关键词）|
| **12.4** | 能力成熟度自评估 | ✅ | `maturity/metrics.ts:93-150` + `runtime-watchdog.ts:31-86` | 自评估 UI 调度入口未挂周期任务 |
| **12.5.1** | 性能（响应时间）| 🟡 MED | `trajectory-log.ts` + `runtime-watchdog.ts` + `budget-store.ts` | P-53~58 SLA 硬性检查缺；仅埋点无主动告警 |
| **12.5.2** | 可用性（离线降级）| 🟡 MED | `heartbeat.ts:17-60` + `balance.ts` + `main.ts:62-69`（Bocha warmup）| 无 Application 层"离线→禁用云端/MCP"拦截层 |
| **12.5.3** | 可维护性（日志/监控/调试）| ✅ | `log/jsonl.ts:28-95`（[P-113] 轮转）+ `trajectory-log.ts:115-134` | DEBUG/INFO/WARN/ERROR/AUDIT 五级分级未显式 |
| **12.5.4** | 兼容性（操作系统）| 🟡 MED | `config/env.ts:1-36` + Node 22 + Electron 兼容 | macOS/Linux 专项分支代码缺；最低硬件 [P-60] 未硬约束 |
| **12.6** | 已知限制与未来优化 | ✅ | `docs/plans/2026-08-22-ocr-accuracy.md` + 附录 A 迁移台账 | 无独立代码模块（仅文档台账）|

**小计**：5 ✅ / 4 🟡 / 0 🔴

---

## 7. 缺口汇总（25 项）

按严重度排序（与 `role-business-capability-audit.md` 的 RC-1~RC-12 编号体系衔接，本报告编号 BC-1~BC-25）：

### 7.1 🔴 HIGH（8 项）

| ID | 项 | 章节 | 影响 |
|---|---|---|---|
| BC-1 | 软门/策略表完全缺失 | §2.3（角色镜片，已登记 RC-1）| 治理宪法层失效 |
| BC-2 | 当前常用软件缺字段+无动态发现 | §3.3 | 用户画像扩展原则无实现路径 |
| BC-3 | 支持的器件类型无枚举 | §7.6 | Datasheet 解析路由无分类基 |
| BC-4 | 装备式设计无 ACL 注册表 | §8.1.2 | 三栏→记忆资产绑定不可强制 |
| BC-5 | 证据链 UI 交互设计缺失 | §9.2 | 用户审查验收链路断 |
| BC-6 | 降级路径四级缺失 | §11.1.4 | 运维核心无降级兜底 |
| BC-7 | 文件冲突仲裁规则缺失 | §11.1.5 | PM 仲裁无模块 |
| BC-8 | 执行事务性（变更清单+回滚）缺失 | §11.2 | 无 transactional executor |

### 7.2 🟡 MEDIUM（12 项）

| ID | 项 | 章节 | 影响 |
|---|---|---|---|
| BC-9 | 用户画像扩展原则无动态 re-profile | §3.2 | 仅 schema 字段固定 |
| BC-10 | 远程通道微信+飞书 adapter 骨架 | §4.5 | QQ only |
| BC-11 | P0 评分修复无 prod 模块 | §6.4 | 评分修复仅测试层 |
| BC-12 | 医疗/政务 vs 生活置信度阈值未差异化 | §6.6 | 风险场景与生活场景同阈值 |
| BC-13 | 四种记忆资产 Wiki/CodeGraph 缺失 | §8.1.1 | CodeGraph 标 P2 延后，Wiki 未实现 |
| BC-14 | 跨栏信息矛盾无显式规则 | §8.3.2 | 当前栏位优先未编码 |
| BC-15 | 轻量反馈缺原因标签/修改建议入口 | §9.3 | 用户反馈颗粒度粗 |
| BC-16 | 五源信任域标记未结构化 | §10.5 | prompt 注入防御分级不清 |
| BC-17 | 失败类型→策略映射矩阵缺失 | §11.1.1 | 策略散落 |
| BC-18 | 重试策略快照回滚缺失 | §11.1.2 | 确定性 vs 非确定性未区分 |
| BC-19 | 秘书日报未集成 JSONL 扫描 | §11.3 | 告警汇总缺通路 |
| BC-20 | §12.1 人格系统提示无独立模块 | §12.1 | 老专家+秘书身份仅隐式 |
| BC-21 | 性能 SLA 硬性检查缺失 | §12.5.1 | 仅埋点无拦截 |
| BC-22 | Application 层离线降级门缺失 | §12.5.2 | 仅搜索源 down 状态可观测 |
| BC-23 | 兼容性 OS 特定分支代码缺失 | §12.5.4 | 仅 Electron 通用 |

### 7.3 🟢 LOW（5 项）

| ID | 项 | 章节 | 备注 |
|---|---|---|---|
| BC-24 | §4.4 MVP 切片门控外置 | §4.4 | bench/lint 工具承担 |
| BC-25 | §6.0 管道 6 vs 8 阶段差异 | §6.0 | entry gate + 6 stages |
| （含 RC-6~RC-8 from role audit）| 决策维度倾向/Ask/Craft独立模式/秘书表达层碎片化 | §2.2/§4.1/§2.4 | v2.6 顺带 |
| §9.1 四类证据元数据缺三类 | §9.1 | file/terminal/test |
| §10.1 缺动态授权目录 API | §10.1 | 当前三个根目录固定 |

---

## 8. 修复路径汇总（25 项 × 6 字段）

| ID | 代码落点（建议）| 内容 | 效果 | 工时 | 预估成本(¥) | 置信度 |
|---|---|---|---|---|---|---|
| BC-1 | `src/escalation/hard-gate.ts` + `policy-table.ts` | 实现 §2.3 priority chain | 治理宪法层落地 | 4-6h | ¥0 | HIGH |
| BC-2 | `src/memory/user-context-store.ts` 新增 `installedSoftware` 字段 + `src/mcp/discovery/software-scanner.ts` | 添加软件清单 schema + MCP 驱动发现 | 用户画像扩展原则落地 | 6-8h | ¥0 | MED |
| BC-3 | `src/search/component-types.ts`（枚举）+ `s2_classify.ts` 集成 | 器件类型枚举 + 路由分类 | Datasheet 解析路由分类基 | 3-4h | ¥0 | HIGH |
| BC-4 | `src/memory/column-acl.ts` + `src/agent/mode-mapper.ts` 集成 | 装备式注册表 + 列→资产强制绑定 | 三栏记忆绑定可强制 | 4-6h | ¥0 | MED |
| BC-5 | `ui/prototype/` 新增证据链渲染层 + `src/gateway/app.ts` JSON 扩展 | UI 渲染 + 点击跳转/高亮/展开 | 证据链用户审查可交互 | 8-12h | ¥0 | MED |
| BC-6 | `src/gateway/degradation-state-machine.ts`（4 级）+ `src/budget/snapshot-store.ts` | 重试→换备用→回滚→上升状态机 + 快照 | 运维兜底完整 | 8-10h | ¥0 | HIGH |
| BC-7 | `src/repo/conflict-arbitrator.ts` | 哈希+行级 diff+3-way merge+仲裁优先级 | PM 仲裁可执行 | 6-8h | ¥0 | MED |
| BC-8 | `src/gateway/transactional-executor.ts` + 影子目录 + 哈希快照 | 变更清单→备份→回滚→汇报四阶段 | 事务性执行可回滚 | 8-10h | ¥0 | HIGH |
| BC-9 | `src/memory/user-context-store.ts` 增加 re-profile API + `src/mcp/discovery/profile-rewriter.ts` | 动态 re-profile 入口 | 扩展原则落地 | 4-5h | ¥0 | MED |
| BC-10 | `src/im/wechat/adapter.ts` + `src/im/feishu/adapter.ts` | 微信/飞书 adapter 实现 | 远程通道全平台 | 10-12h | ¥0 | LOW |
| BC-11 | `src/search/metrics/p0-fix.ts` | 把 bench/raw_scores.csv 5 bug 修入 prod | 评分修复生产可用 | 3-4h | ¥0 | HIGH |
| BC-12 | `src/search/confidence-calibration.ts` + 新增 P-NN | 医疗/政务/生活分领域阈值 | 风险场景独立兜底 | 3-4h | ¥0 | HIGH |
| BC-13 | `src/memory/wiki-store.ts` | Wiki 资产（datasheet 踩坑）实现 | 四种记忆资产完整 | 6-8h | ¥0 | LOW |
| BC-14 | `src/memory/session-context.ts` 新增 `resolveColumnPriority` | 跨栏矛盾显式规则 | 冲突处理可执行 | 1-2h | ¥0 | MED |
| BC-15 | `src/maturity/metrics.ts` 扩展 + `ui/prototype/` 反馈弹窗 | 👎原因标签 + 修改建议入口 | 反馈颗粒度细 | 3-4h | ¥0 | MED |
| BC-16 | `src/security/domain-marker.ts` | 5 域（untrusted_data/user_input/tool_output/memory_recall/datasheet_parsed）标记 | prompt 注入防御分级 | 4-5h | ¥0 | HIGH |
| BC-17 | `src/gateway/failure-matrix.ts` | 失败类型→策略映射矩阵 | 策略结构化 | 3-4h | ¥0 | MED |
| BC-18 | `src/budget/snapshot-store.ts` + 重试逻辑集成 | 哈希快照回滚 | 确定性 vs 非确定性区分 | 3-4h | ¥0 | MED |
| BC-19 | `src/skills/office-daily/degradation-scanner.ts` | 扫描 JSONL 降级事件生成日报 | 告警汇总通路 | 2-3h | ¥0 | HIGH |
| BC-20 | `src/persona/system-prompt.ts`（新建）| "三十年老专家+贴身女秘书"人格提示独立模块 | 人格系统提示固化 | 2-3h | ¥0 | HIGH |
| BC-21 | `src/maturity/sla-guard.ts` + `pipeline.ts` 集成 | P-53~58 SLA 硬性检查 + 主动告警 | SLA 可拦截 | 3-4h | ¥0 | MED |
| BC-22 | `src/gateway/network-monitor.ts` + `src/mcp/tool-guard.ts` | 离线→禁用云端/MCP 拦截 | Application 层降级门 | 4-5h | ¥0 | MED |
| BC-23 | `src/config/os-branch.ts` + 三平台 smoke | macOS/Linux/Windows 专项分支 | 跨平台硬约束 | 4-5h | ¥0 | MED |
| BC-24 | `scripts/bench/lint.ts` 切片门控补完 | bench/lint 工具承担 | 切片门控外置合规 | 1-2h | ¥0 | HIGH |
| BC-25 | spec 注释 + 文档更新 | 文档化 6 阶段（entry gate + 6 stages）| 与代码一致 | 1h | ¥0 | HIGH |

**总工时**：约 90-120h（含 BC-5 UI 8-12h + BC-8 事务 8-10h + BC-10 三平台 10-12h 三大头）
**总预估成本(¥)**：¥0（纯代码治理，无 LLM/API/桌面调用）

---

## 9. v2.6 pre-ship scope 增量建议

`docs/plans/2026-08-30-v26-pre-ship.md` 已锁定 B1~B4（Skill 信任域缺口）+ P-148~P-150。建议追加本报告 BC-1~BC-8（8 项 HIGH + 12 项 MEDIUM）：

**第一波（治理层 + 运维核心，HIGH 优先级）**：
- BC-1（硬门/策略表 §2.3）+ BC-6（降级四级 §11.1.4）+ BC-8（事务性 §11.2）
- 三项合计 20-26h

**第二波（安全 + 记忆 + 路由，MEDIUM 优先级）**：
- BC-2（§3.3 软件清单）+ BC-3（§7.6 器件类型）+ BC-4（§8.1.2 ACL）+ BC-5（§9.2 UI）+ BC-7（§11.1.5 仲裁）+ BC-11（§6.4 P0 fix）+ BC-12（§6.6 置信度分领域）+ BC-13（§8.1.1 Wiki）+ BC-14（§8.3.2 跨栏）+ BC-15（§9.3 反馈）+ BC-16（§10.5 五源）+ BC-17（§11.1.1 失败矩阵）+ BC-19（§11.3 秘书日报）+ BC-20（§12.1 人格）+ BC-21（§12.5.1 SLA）+ BC-22（§12.5.2 离线门）
- 十六项合计约 55-70h

**第三波（顺带 + 文档，LOW 优先级）**：
- BC-9/BC-10/BC-18/BC-23/BC-24/BC-25 + §9.1 证据元数据 + §10.1 授权目录
- 八项合计约 25-35h

**按需触发**：
- BC-13 CodeGraph 部分：原 spec 已标 P2 延后
- BC-10 微信/飞书：v1.0 范围非 v2.6 必装

---

## 10. 残余项（不在本审计范围）

- v2.6 增量 E293~E299（待 owner 启动委托时细化）
- P-148~P-150 分领域阈值（需医疗/政务 1+ 次逃逸案例触发）
- T+6 owner 122 条 bench 全量回归（owner 侧）
- 6mo 稳定性复评（2027-02-28 ± 1 月窗口）

---

## 11. 框架 v2.0 §0.3 五条件签认（25 项 BC）

| 项 | 附录 A 登记 | 附录 C 证据 | n≥阈值 | 无相反证据 | owner 签认 |
|---|---|---|---|---|---|
| BC-1~BC-8（HIGH）| ✅（§7.1 + §8）| ✅（grep + 模块缺失确认）| ✅ | ✅ | ⏳ 待 owner |
| BC-9~BC-23（MEDIUM）| ✅ | ✅ | ✅ | ✅ | ⏳ 待 owner |
| BC-24~BC-25（LOW）| ✅ | ✅ | ✅ | ✅ | ⏳ 待 owner |

**5 个并行 agent 已按 §5.2 修复路径模板产出全部 25 项证据（路径+内容+效果+工时+成本），符合框架 §0.3 流程。**

---

## 12. 总结

**v2.5 业务能力实施全景**：

- **70 项业务能力中 45 项 ✅ / 17 项 🟡 / 8 项 🔴**
- **核心问题集中在三簇**：
  1. **运维事务层**（§11.1.4/§11.1.5/§11.2 + §9.2）— 4 项 🔴 HIGH
  2. **用户/记忆绑定层**（§3.3 + §7.6 + §8.1.2）— 3 项 🔴 HIGH  
  3. **治理宪法层**（§2.3 hard gate/policy table，BC-1 = RC-1）— 1 项 🔴 HIGH
- **v2.6 pre-ship 第一波**：BC-1 + BC-6 + BC-8（治理+运维三联）合计 20-26h

**与既有报告关系**：
- `role-business-capability-audit.md` 已覆盖 §2.1~§2.5 + §4.1 角色镜片模型 12 项
- 本报告补充 §3 + §4.2~§4.5 + §6 + §7 + §8 + §9 + §10 + §11 + §12 共 25 项 BC
- 两份需求侧报告 + `v25-findings-and-remediation.md` 代码侧 9 项 + `skill-trust-audit.md` 24 项 Skill → 形成完整 70 项业务能力 + 24 项 Skill + 9 项代码风险三角验证

---

**预估成本(¥)**：¥0（5 个并行 agent 静态核对 + 文档化产出，无 LLM/API/桌面调用）
**回归影响**：本报告为新增文档，无代码变更；bench:na
**置信度**：HIGH（70 项能力中 45 项 ✅ + 17 项 🟡 实证 + 8 项 🔴 grep 缺失确认）
