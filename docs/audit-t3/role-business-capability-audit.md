# v2.5 需求审计 — 五角色业务能力审查报告

> 日期：2026-08-30 · 分支：v0.2b · 状态：定稿
> 角色：**v2.5 需求侧诊断**（与既有 `v25-findings-and-remediation.md` 代码侧诊断互为镜像）
> 关联：`一人公司AI-Agent需求文档_v2.5.md` §1 / §2 / §4 / §6 / §11 / §12 + `src/agent/types.ts` + `src/agent/routing-table.ts` + `src/agent/router-v2.ts` + `src/agent/mode-mapper.ts` + `src/search/pipeline.ts` + `src/escalation/decision-log.ts` + `src/skills/market/proactive.ts` + `src/skills/jargon-map/index.ts` + `src/search/companion-reply.ts` + `src/search/emergency-reply.ts` + `src/postprocess/cultural-reply.ts`
> 框架依据：`架构师审计框架说明 v2.0.md` §0.3 / §4.2 / §4.3 / §5.2 / §5.3 / §5.4 / §6

---

## 0. 报告定位与审计范围说明

| 项 | 角色 | 内容 |
|---|---|---|
| 本报告 | **需求侧诊断** | v2.5 §2 五角色 + §2.2-§2.5 镜片调度机制 + §4 一刀测试 + §4.1 三栏交互 + Ask/Craft/Plan 的「业务能力」是否落地 |
| `v25-findings-and-remediation.md` | 代码侧诊断 | R-1~R-9 + S-1~S-6（架构/参数/技能信任域）|
| 关系 | **镜像补充** | 本报告与代码侧诊断互为镜像——前者看「需求是否落地」，后者看「代码是否有漏洞」；本报告发现的部分问题正是代码侧未触及的需求遗漏面 |

**审计范围声明**：本次审计未涉及 v2.5 §0 / §3 / §5 / §7 / §8 / §9 / §10 / §11 / §12 的逐条核对，仅聚焦**§2 镜片模型 + §4 产品行为 + Ask/Craft/Plan** 等「角色调度与业务行为」主干。其它章节（搜索管道、记忆、Skill、参数、宪法）已由代码侧审计覆盖。

---

## 1. 五角色业务能力全景

### 1.1 角色 × 业务能力 × 代码落点 × 状态

| 角色 | v2.5 §2.1 业务能力 | 代码实现位置 | 状态 | 缺口 |
|---|---|---|---|---|
| **贴身女秘书 (secretary)** | 日常对话、生活助手、信息查询；温暖体贴、懂我、有眼力见儿、从海量信息中解放 | `routing-table.ts` R004/R005/R007/R007A/R007B/R012/R_CHAT/R020/R021 + `companion-reply.ts` + `emergency-reply.ts` + `cultural-reply.ts` + `proactive.ts` + `jargon-map` Skill | 🟡 大部分实现 + 严重缺口见 §1.2 | 表达层人格（§2.4）+ 4 指标（§2.5）尚未系统化 |
| **老板 (owner)** | 决策、方向把控；项目可行性、资源分配、风险决策 | `routing-table.ts` R006（clarify）/R010（cost_analysis）/R13（risk_review）/R15（compare_vendor_quotes） | 🟡 4 类意图已路由 | 缺成本 / 风险量化引擎（仅路由层）|
| **产品经理 (product_manager)** | 需求分析、写 PRD | `routing-table.ts` R002（write_doc document）/R009（write_doc atomic）+ `submode: 'product_planning'` | 🟡 路由 + UI 子模式已落 | 缺需求分析方法论落地；无 PRD 模板/规范 |
| **项目经理 (project_manager)** | 项目计划、风险规划、子 Agent 协同 | `routing-table.ts` R001（plan project_level）/R002d（deep_report）/R023（operate mcp）/R_APPLY_TO_PROJECT + `submode: 'review_critique'` | 🟡 路由 + UI 子模式已落 | 缺子 Agent 协同引擎（MCP 仅占位）；项目计划仅 `plan` 意图 |
| **系统架构师 (architect)** | 技术选型、模块划分、接口契约、数据流设计 | `routing-table.ts` R003（execute atomic code）/R_IMAGE_COLOR /R_DOCUMENT_STRUCTURE /R022（modify code） | 🟡 路由 + 颜色/文档结构识别已落 | 缺技术选型 / 接口契约 / 数据流的具体能力引擎 |

### 1.2 贴身女秘书缺口细列（最严重）

贴身女秘书是 v2.5 §1.1「核心定位」（"像一个懂你、有眼力见儿的'贴身女秘书'，而非聊天机器人"）+ §2.4「恒定人格层」+ §2.5「有眼力见儿 4 指标」的**核心承载角色**，但代码实现呈现"碎片化 7-8 个 reply 函数 + 1 个 proactive suggest"，**缺统一的人格表达框架**：

| 子能力 | v2.5 要求 | 代码实现 | 缺口等级 |
|---|---|---|---|
| 温暖体贴语气 | §2.4 表达层恒定 | 7 处 reply 函数各自调用（如 `companion-reply.ts:8`「老板，我在呢」/`emergency-reply.ts:6`「老板，别慌」）| 🟡 仅 intent-specific 7 处，无全局包裹层 |
| 信息密度适配 | §2.5 指标④ | ❌ 未实现密度调节 | 🔴 缺失 |
| 场景关怀 | §2.5 指标③ | 部分（emergency-reply 自带关怀）| 🟡 仅 3-4 处场景化关怀 |
| 黑话消解 | §2.5 指标② | ✅ `jargon-map` Skill（Skill 路由层独立）| ✅ 已闭环 |
| 主动预判 | §2.5 指标① | ✅ `proactive.ts`（E313，仅市场 Skill 触发）| 🟡 仅市场 Skill 触发，未覆盖主流程 |
| 情感陪伴 / 闲聊 | §2.1 业务能力 | ✅ `companion-reply.ts`（EC31）| ✅ 已闭环 |
| 紧急安全 | §2.1 业务能力 | ✅ `emergency-reply.ts`（§4.2.1，蛇咬/动物咬/火灾 3 类）| ✅ 已闭环 |

### 1.3 五角色覆盖判定

**结论**：五角色已在 `types.ts` 封闭 + 路由表全部 5 角色出现；**角色调度本身成立**，但**每个角色承载的业务能力实现深度不均**：
- 🟢 秘书：身份/闲聊/紧急/文化梗/黑话已落地；人格表达 + 主动预判 + 信息密度部分缺失
- 🟡 老板：路由层 4 类意图已分配，但**决策引擎**（cost / risk 量化）未独立实现
- 🟡 产品经理：路由 + UI 子模式 + `content_writer` Skill 已落；**PRD 模板 / 需求拆解方法论**未实现
- 🟡 项目经理：路由 + UI 子模式 + `engineer` / `mcp_agent` 已落；**子 Agent 协同 / 风险规划**未实现
- 🟡 架构师：路由 + 颜色/文档结构 + `engineer` 已落；**技术选型 / 接口契约 / 数据流设计**未实现

---

## 2. §2.2 镜片模型（Lens Dispatch）审查

### 2.1 通过/风险判定

🟡 **路由层实现，但治理层机制不全**。

### 2.2 §2.2 核心规则表逐条核对

| v2.5 §2.2 规则 | 要求 | 代码实现 | 状态 |
|---|---|---|---|
| **一回复一主镜片** | 主镜片产出正文，副镜片最多一句顺带提醒 | `routing-table.ts` 每个 RoutingRule 仅设一个 `primaryLens`；`pipeline.ts` 按 `routeFromFeatures()` 决策返回单个 `selected` | ✅ 已闭环 |
| **冲突优先级** | 安全/正确 > 交付期 > 成本 > 技术优雅 | ❌ **未实现**（无 `priorityChain` 函数 / `hardGate` 模块 / `policyTable` 配置）| 🔴 缺失 |
| **冲突不私了** | 两镜片真冲突时，秘书摆选项给老板（用户）拍板 | ✅ `router-v2.ts` `option_clarify` decision 类型 + `clarify-templates.ts` 摆选项 | ✅ 已闭环 |
| **决策维度倾向** | 纯技术选型→架构师优先；纯商务/预算→老板优先；任务拆解/排期→PM 优先（**仅为意图分类的软提示**）| 🟡 部分实现——路由表 R003/R022（architect 优先于技术）/ R010（owner 财务）/ R001/R002d/R023/R_APPLY_TO_PROJECT（PM 项目类）| 🟡 已分散在路由规则，无集中「决策维度倾向」表 |

### 2.3 严重等级

🔴 **冲突优先级链缺失（§2.3 同源问题）**——v2.5 明确要求"硬门一票否决"是安全保证的最后一环，代码侧 `src/escalation/` 仅实现「人类裁决 / 困难升级记录」（E309），未实现 §2.3「硬门 / 策略表 / 人类裁决」三要素中的前两项。

### 2.4 修复建议

1. **新增 `src/agent/conflict-resolver.ts`**（命名建议）：
   - 暴露 `PriorityChain = ['safety', 'correctness', 'delivery', 'cost', 'elegance']` 静态策略表
   - 暴露 `hardGate(claims: LensClaim[]): LensClaim` 函数——按优先级链逐级判定，高优先级 claim 一票否决低优先级
   - 编码位置：路由层 `routeFromFeatures()` 决策后、`decision.selected` 写入 pipeline 之前
2. **新增 `docs/audit/decisions-priority-chain.md`**：登记静态优先级表 + 触发场景 + 反例库
3. **新增附录 A E-NN**：按 §0.3 流程登记
4. **配套测试**：单元测试覆盖 5 类典型冲突场景（架构师 vs 老板安全/成本/交付期/技术优雅/同级冲突）
5. **工时**：3-4h
7. **置信度**：HIGH（v2.5 §2.3 已给完整规则示例，落地路径明确）。

### 2.5 残余风险

- 🟢 无运行时风险（缺的是治理机制，非已部署的漏洞）；v2.6+ 候选

### 2.6 引用

- `src/agent/routing-table.ts`（已实现部分）
- `src/escalation/decision-log.ts`（已实现人类裁决，缺硬门/策略表）

---

## 3. §2.3 工程语义（硬门 / 策略表 / 人类裁决）审查

### 3.1 通过/风险判定

🟡 **人类裁决已实现，硬门 + 策略表缺失**。

### 3.2 §2.3 三要素逐条核对

| 要素 | v2.5 §2.3 定义 | 代码实现 | 状态 |
|---|---|---|---|
| **硬门 Hard Gate** | 高优先级维度一票否决低优先级：安全/正确 > 交付期 > 成本 > 技术优雅 | ❌ 缺独立模块 | 🔴 缺失 |
| **策略表 Policy Table** | 四维优先级链是静态策略表，不依赖领域分类 | ❌ 缺静态配置 | 🔴 缺失 |
| **人类裁决 Human Arbitration** | 真冲突时秘书摆选项 + 优先级链建议 → 用户拍板 | ✅ `src/escalation/decision-log.ts`（E309）+ `router-v2.ts` `option_clarify` + `clarify-templates.ts` + `pipeline.ts:619` 人类裁决记录 | ✅ 已闭环 |

### 3.3 严重等级

🟠 **HIGH**——§2.3 明确「硬门示例：架构师说方案 A 有安全隐患 vs 老板说方案 B 便宜 → 架构师胜，安全一票否决成本」，这是 v2.5 治理机制的核心承诺。**缺这一环意味着审计方承诺的「安全一票否决」机制未在代码上落地**。

### 3.4 修复建议

详见 §2.4（同根问题，统一修复）。补充：在 `conflict-resolver.ts` 中显化硬门触发：
- 输入：`LensClaim[]`（每镜片输出含 `{lens, dimension, claim, weight}`）
- 处理：按 priorityChain 顺序比对 dimension → 高优先级非空则一票否决低优先级
- 输出：胜出 LensClaim + 否决原因（写入 decision-log）
- 兜底：同级冲突触发人类裁决（已闭环）

### 3.5 残余风险

- 🟡 当前未在生产遭遇真实「安全 vs 成本」冲突 case，但 6 个月内若引入新 Lens（如产品经理 vs 架构师）则易冲突失序；建议 v2.6+ 落地

### 3.6 引用

- `src/escalation/decision-log.ts`（E309，人类裁决记录）
- `src/agent/router-v2.ts`（option_clarify 摆选项）

---

## 4. §2.4 秘书恒定人格层审查

### 4.1 通过/风险判定

🟡 **碎片化实现，缺统一人格包裹层**。

### 4.2 §2.4 两层结构核对

| 层次 | v2.5 §2.4 主导 | 代码实现 | 状态 |
|---|---|---|---|
| **内容层（分析什么）** | 当前主镜片（架构师/老板/PM/产品经理）| ✅ `routing-table.ts` 路由到对应 Lens；内容产出在 pipeline Stage 4 / Stage 5 | ✅ 已闭环 |
| **表达层（怎么说）** | 秘书（恒定）——语气、称呼、汇报结构、关怀用语、信息密度适配 | 🟡 碎片化：仅 `companion-reply.ts`（EC31）/ `emergency-reply.ts`（§4.2.1）/ `cultural-reply.ts`（Week 2 memory-driven）3 处统一称呼+关怀用语；其余 Stage 5 synthesize 输出未包裹 | 🟡 部分实现 |

### 4.3 严重等级

🟡 **MEDIUM**——v2.5 §1.1「像贴身女秘书而非聊天机器人」是产品定位核心承诺；当前实现仅在 3 个 reply builder 中体现秘书人格，**主流程 Stage 5 合成输出未包裹统一称呼/关怀/语气**。

### 4.4 修复建议

1. **新增 `src/postprocess/secretary-persona.ts`**（命名建议）：
   - 暴露 `wrapPersona(content: string, ctx: PersonaContext): string` 函数
   - PersonaContext = `{ primaryLens, intent, urgency, hour }`
   - 实现要点：
     - 称呼：「老板」/「张哥」（按用户身份字段，未知用「老板」兜底）
     - 关怀用语：「这颗片子供电有个坑——VDDA 得单独走磁珠隔离，不然 ADC 噪声会让你头疼」（v2.5 §2.4 示例的工程化模板）
     - 信息密度适配：根据 `urgency` 字段调节详略（critical → 短句；normal → 完整；deep → 段落）
     - 收尾软提示：「这类问题放知识栏查起来更顺手」（§4.1.3 串栏必应，仅首次跨栏问题触发）
2. **挂载点**：`src/search/stages/s5_synthesize.ts` Stage 5 输出后、最终回复前
3. **路由挂载**：`src/agent/router-v2.ts` decision 选片后透传 PersonaContext
4. **配套测试**：单元测试 5 类场景（normal/critical/紧急/工程师口吻/科普口吻）
5. **工时**：3-4h
6. **置信度**：HIGH（v2.5 §2.4 给完整示例，落地路径明确）

### 4.5 残余风险

- 🟡 当前「碎片化人格」未造成明显体验问题（7-8 个 intent-specific reply 覆盖主要场景）；但随新 intent 增多会显人格不一致；建议 v2.6+ 落地

### 4.6 引用

- `src/search/companion-reply.ts`（EC31 陪伴）
- `src/search/emergency-reply.ts`（§4.2.1 紧急）
- `src/postprocess/cultural-reply.ts`（Week 2 文化梗）

---

## 5. §2.5 "有眼力见儿" 行为指标审查（4 项量化）

### 5.1 通过/风险判定

🟡 **2/4 已闭环，2/4 部分 / 缺失**。

### 5.2 §2.5 四指标逐条核对

| 指标 | v2.5 §2.5 行为表现 | 代码实现 | 状态 |
|---|---|---|---|
| **① 主动预判** | 用户未明说的需求被 Agent 主动提出 | 🟡 `src/skills/market/proactive.ts`（E313）——**仅市场 Skill 触发**，未覆盖主流程（搜索/陪伴/项目）| 🟡 部分实现 |
| **② 黑话消解** | 「Protel」「大殖子」等黑话无需用户解释 | ✅ `src/skills/jargon-map/index.ts`（Skill 注册 `triggers: ['jargon', '黑话', 'Protel', '大殖子']`）| ✅ 已闭环 |
| **③ 场景关怀** | 技术回答同时关怀用户使用场景 | 🟡 `emergency-reply.ts` 自带关怀；其他 reply 未统一注入关怀语境 | 🟡 部分实现 |
| **④ 信息密度适配** | 按用户状态（赶时间 vs 深度学习）调整回复详略 | ❌ **未实现**——Stage 5 synthesize 始终固定详略 | 🔴 缺失 |

### 5.3 严重等级

- 🟢 ① 主动预判：MEDIUM（部分实现，主流程缺失）
- 🟢 ② 黑话消解：HIGH（已闭环）
- 🟡 ③ 场景关怀：MEDIUM（部分实现）
- 🔴 ④ 信息密度适配：MEDIUM（缺失，但 Stage 5 仍能输出）

### 5.4 修复建议

#### 5.4.1 ① 主动预判（v2.6 pre-ship 候选）

1. **新增 `src/agent/proactive-engine.ts`**（命名建议）：
   - 暴露 `attachProactiveSuggestions(content: string, ctx: ProactiveContext): string`
   - ProactiveContext = `{ primaryLens, intent, recentHistory, timeOfDay }`
   - 实现：扫描 `recentHistory` → 识别未说完话题 → 追加「💡 主动建议：…」
2. **挂载点**：`pipeline.ts` Stage 5 后、最终回复前（与 §4 secretary-persona 同挂载点，可合并实现）
3. **触发条件**：用户同一话题连续 ≥2 次 / 当前 query 含延续关键词 / 距上次同类话题 ≤24h
4. **工时**：2-3h
5. **置信度**：MEDIUM（涉及 history 扫描，可能误触发需护栏）

#### 5.4.2 ③ 场景关怀（统一注入）

- 随 §4 secretary-persona 统一落地（关怀用语是 PersonaContext 的一部分）

#### 5.4.3 ④ 信息密度适配（缺失项）

1. **新增 `src/postprocess/density-adapter.ts`**：
   - 暴露 `adaptDensity(content: string, urgency: Urgency): string`
   - Urgency = `'critical' | 'urgent' | 'normal' | 'deep'`
   - 实现：
     - `critical` → 仅保留核心结论 + 一行「详细见…」
     - `urgent` → 短句 + 关键数字
     - `normal` → 完整段落
     - `deep` → 完整段落 + 关联引用 + 历史佐证
2. **挂载点**：Stage 5 输出后、`secretary-persona.wrapPersona` 之前
3. **触发**：路由决策透传 `urgency` 字段（`intent-feature.ts` 已建模 `urgency: 'normal' | 'urgent' | 'critical'`）
4. **工时**：2-3h
5. **置信度**：MEDIUM（详略调节可能误剪重要信息，需护栏 + 用户确认）

### 5.5 残余风险

- 🟢 ② 黑话消解：已闭环，无残余
- 🟡 ① 主动预判：主流程未实现但市场 Skill 已落地；v2.6+ 候选
- 🟡 ③ 场景关怀：随 §4 合并修复
- 🟡 ④ 信息密度适配：缺失，v2.6+ 候选

### 5.6 引用

- `src/skills/market/proactive.ts`（E313 市场 Skill 主动预判）
- `src/skills/jargon-map/index.ts`（黑话消解）
- `src/search/emergency-reply.ts`（场景关怀参考实现）

---

## 6. §4 一刀测试（知识问答 vs 项目执行）审查

### 6.1 通过/风险判定

🟡 **核心规则已嵌入路由表，但缺统一判定函数**。

### 6.2 §4 一刀测试核对

> "产物是否进入用户的项目文件系统/工具链？"→ 进 = 执行（拆解调度、用户审查验收）/ 不进 = 知识（直接回答，产物留在对话里）

| 实现位置 | 实现内容 | 状态 |
|---|---|---|
| `intent-feature.ts:54` | `Scope = 'atomic' \| 'multi_step' \| 'project_level' \| 'unknown'` | ✅ 已建模 |
| `routing-table.ts` R001 | `create + code + project_level → project_manager plan`（执行类）| ✅ |
| `routing-table.ts` R003 | `create + code + atomic → architect execute`（代码片段——按边界案例为知识）| ✅ |
| `routing-table.ts` R009 | `create + document + atomic → product_manager write_doc`（单文档——按边界案例为知识）| ✅ |
| `routing-table.ts` R022 | `modify + code → architect execute`（执行类）| ✅ |
| `router-v2.ts:215-235` | `create + atomic` 走 `intent === 'execute'` 直接执行 | ✅ |
| 灰区处理 | "判定不确定时，Agent 先问用户" | 🟡 由 `clarify-templates.ts` 间接覆盖（`must_clarify` decision） |

### 6.3 严重等级

🟢 **LOW**——核心一刀测试已通过路由表分散实现，scope 三档（atomic / multi_step / project_level）覆盖足够；缺统一判定函数但不阻塞。

### 6.4 修复建议（可选）

1. **新增 `src/agent/knife-cut.ts`**：暴露 `classifyExecution(query, features): 'knowledge' | 'execution' | 'gray'`
   - 输入：query + IntentFeature
   - 输出：分类结果
   - 灰区返回 → 触发 must_clarify（已闭环）
3. **挂载点**：路由表打分前预筛；如灰区则直接 must_clarify，跳过路由表
4. **工时**：1-2h
5. **置信度**：HIGH（规则已嵌入，只需抽出独立函数）

### 6.5 残余风险

- 🟢 当前分散实现工作良好；不抽函数风险低
- 🟡 灰区处理依赖 `clarify-templates.ts` 摆问题，模板是否覆盖所有灰区场景需实测验证

### 6.6 引用

- `src/agent/intent-feature.ts:54`（Scope 建模）
- `src/agent/routing-table.ts`（R001/R003/R009/R022 路由）

---

## 7. §4.1 三栏交互 + Ask/Craft/Plan 审查

### 7.1 通过/风险判定

🟡 **三栏映射已闭环，Ask/Craft/Plan 未独立建模**。

### 7.2 §4.1 三栏核对

| v2.5 §4.1.1 三栏 | 主角色 | 代码实现 | 状态 |
|---|---|---|---|
| **工程开发栏** | 架构师 + PM + 老板 | `mode-mapper.ts:27-34` 全部 `architect / product_manager / project_manager / owner` → `mode: 'engineering'` | ✅ |
| **知识咨询栏** | 30 年经验老专家 | `mode-mapper.ts:36-39` secretary + 非 LIFE_INTENTS → `mode: 'knowledge'` | ✅ |
| **生活助手栏** | 贴身女秘书 | `mode-mapper.ts:36-39` secretary + LIFE_INTENTS → `mode: 'life'` | ✅ |

### 7.3 Ask / Craft / Plan 三模式核对

| v2.5 §4.1.1 三模式 | v2.5 定义 | 代码实现 | 状态 |
|---|---|---|---|
| **Ask** | 只看不改 | 🟡 `submode: 'review_critique'`（mode-mapper.ts:33-34）部分覆盖 | 🟡 未独立建模为顶层模式 |
| **Craft** | 直接干 | 🟡 路由表 `tags: ['craft']` 标注（R001/R009） | 🟡 仅标签，无独立执行模式切换 |
| **Plan** | 先出方案再干 | ✅ `routing-table.ts` R001 → `intent: 'plan'` | ✅ 已闭环 |

### 7.4 严重等级

🟡 **MEDIUM**——三栏映射清晰但 Ask/Craft/Plan 仅「标签」未独立执行模式切换。需求侧 §4.1.1 明确「三模式正交」，当前实现可能存在 UI 切换与意图路由耦合不清晰。

### 7.5 修复建议

1. **新增 `src/agent/ui-mode.ts`**（命名建议）：
   - 暴露 `UiMode = 'engineering' | 'knowledge' | 'life'`（已存在于 mode-mapper.ts，复用）
   - 暴露 `ExecutionMode = 'ask' | 'craft' | 'plan'`（新建）
   - 暴露 `resolveUiExecutionMode(uiMode, intent): { ... }` 显化映射
2. **UI 联动**：UI 切换 Ask/Craft/Plan 时透传 ExecutionMode → 路由层作为软提示（不影响硬路由）
3. **计划文档**：`docs/plans/2026-MM-DD-ask-craft-plan-mvp.md`
4. **工时**：2-3h
5. **置信度**：MEDIUM（涉及 UI 状态，需与 desktop 前端协调）

### 7.6 残余风险

- 🟡 当前 UI 仅支持「知识咨询栏 Ask/Craft/Plan」三模式，工程栏 / 生活栏单一模式——需求 §4.1.1 明确「三栏内部三模式正交」要求 v2.6+ 落地

### 7.7 引用

- `src/agent/mode-mapper.ts`（E109，UI 重构需求 §3.3）
- `src/agent/routing-table.ts` R001/R009（Plan/Craft 标签）

---

## 8. §4.1.3 串栏必应 + §4.1.5 浏览器操作审查（轻量核对）

### 8.1 §4.1.3 串栏必应

> "在工程栏问知识题照样答对，结尾首次软提示'这类问题放知识栏查起来更顺手'"

| 实现 | 状态 |
|---|---|
| ❌ 缺「跨栏软提示」统一机制 | 🟡 缺失 |

**修复建议**：随 §4 secretary-persona 合并落地（收尾软提示是 PersonaContext 的一部分）。

### 8.2 §4.1.5 浏览器操作（读 + 交互双模）

| v2.5 §4.1.5 要求 | 代码实现 | 状态 |
|---|---|---|
| 内置浏览器 | ✅ `src/browser/` 模块（E292 SSRF 最小防护已闭环）| ✅ |
| 实时可读 DOM + 截图 | 🟡 `src/browser/operations.ts` 部分实现 | 🟡 部分 |
| 操作全程动作日志、可中止 | 🟡 浏览器操作日志已落（terminal audit）| 🟡 部分 |

### 8.3 残余风险

- 🟡 §4.1.5 浏览器操作深度对接需 desktop 前端协调；属 v2.6+ 候选

### 8.4 引用

- `src/browser/operations.ts`
- `docs/plans/2026-08-30-browser-url-ssrf-minimal.md`（E292）

---

## 9. 缺口汇总 + 修复路径 + 成本 + 置信度

| ID | v2.5 来源 | 缺口 | 严重性 | 修复落点 | 工时 | 预估成本(¥) | 置信度 | 落地证据 |
|---|---|---|---|---|---|---|---|---|
| **RC-1** | §2.3 + §2.2 | **硬门 Hard Gate + 策略表 Policy Table 缺失** | 🟠 HIGH | 新增 `src/agent/conflict-resolver.ts` + `decisions-priority-chain.md` + E-NN changelog + 5 类冲突单测 | 3-4h | ¥0 | HIGH | 当前：仅人类裁决 E309 |
| **RC-2** | §2.4 | **秘书恒定人格层碎片化**（仅 3 处 reply builder）| 🟡 MEDIUM | 新增 `src/postprocess/secretary-persona.ts` + Stage 5 挂载 + 5 类场景测试 | 3-4h | ¥0 | HIGH | 当前：7-8 处 intent-specific reply |
| **RC-3** | §2.5 ① | 主动预判仅市场 Skill，主流程缺失 | 🟡 MEDIUM | 新增 `src/agent/proactive-engine.ts` + 主流程挂载 + history 扫描护栏 | 2-3h | ¥0 | MEDIUM | 当前：`market/proactive.ts` E313 |
| **RC-4** | §2.5 ④ | 信息密度适配缺失 | 🟡 MEDIUM | 新增 `src/postprocess/density-adapter.ts` + urgency 字段透传 | 2-3h | ¥0 | MEDIUM | 当前：未建模 |
| **RC-5** | §4.1.1 | Ask/Craft/Plan 未独立执行模式建模 | 🟡 MEDIUM | 新增 `src/agent/ui-mode.ts` ExecutionMode + UI 联动 + 计划文档 | 2-3h | ¥0 | MEDIUM | 当前：仅标签 `tags: ['craft']` |
| **RC-6** | §4 一刀测试 | 缺统一判定函数（分散在路由表）| 🟢 LOW | 新增 `src/agent/knife-cut.ts` 抽出函数 | 1-2h | ¥0 | HIGH | 当前：路由表分散实现 |
| **RC-7** | §2.5 ③ | 场景关怀碎片化（仅 emergency）| 🟡 MEDIUM | 随 RC-2 secretary-persona 合并落地 | — | ¥0 | HIGH | — |
| **RC-8** | §4.1.3 | 跨栏软提示缺失 | 🟡 MEDIUM | 随 RC-2 secretary-persona 合并落地 | — | ¥0 | HIGH | — |
| **RC-9** | §2.1 + §11 老板 | 老板角色决策引擎（成本 / 风险量化）未独立实现 | 🟡 MEDIUM | v2.6+ 候选（已路由）| — | — | LOW | 当前：仅路由层 |
| **RC-10** | §2.1 + §11 产品经理 | PRD 模板 / 需求拆解方法论未实现 | 🟡 MEDIUM | v2.6+ 候选 | — | — | LOW | 当前：路由 + `content_writer` |
| **RC-11** | §2.1 + §11 项目经理 | 子 Agent 协同 / 风险规划未实现 | 🟡 MEDIUM | v2.6+ 候选 | — | — | LOW | 当前：路由 + `mcp_agent` / `engineer` |
| **RC-12** | §2.1 + §11 架构师 | 技术选型 / 接口契约 / 数据流设计未实现 | 🟡 MEDIUM | v2.6+ 候选 | — | — | LOW | 当前：路由 + 颜色识别 |

**总预估工时（v2.6 pre-ship RC-1~RC-8）**：13-19h（2-3 个工作日）
**预估成本(¥)**：¥0（纯代码治理 + 静态分析）
**回归影响**：12 项变更中 11 项 bench:na + 1 项行为变更（硬门一票否决）走定向回归

---

## 10. 残余项与下一阶段入口

### 10.1 残余项（按 owner / 审计侧分工）

**owner 侧（无审计介入）**：
- O-1 SMTP 真实冒烟邮箱（已有）
- O-2 PID 18072 残留进程结束（已有）
- O-3 T+6 bench:devil-v25 122 条全量回归（已有）
- O-4 v2.6 pre-ship 委托启动（**含 RC-1~RC-8 缺口**）

**审计侧已闭环 / 等待触发**：
- A-1 [P-04] 9/2 复测路径已设定
- A-2 `undefined` 文件根因修复（`e792e8e`）
- A-3 E290/E291/E292 work-in-progress 闭环
- A-4 未追踪 21 项清理（`fde0a32`）
- A-5 R-3 双重忽略 + benchmarks 黄标

### 10.2 v2.6 pre-ship scope 更新

详见 `docs/plans/2026-08-30-v26-pre-ship.md`——**追加 RC-1~RC-8 八项需求侧缺口**：
- RC-1 硬门 + 策略表（🟠 HIGH，3-4h）— **优先级最高**
- RC-2 秘书恒定人格层（🟡 MEDIUM，3-4h）
- RC-3 主流程主动预判（🟡 MEDIUM，2-3h）
- RC-4 信息密度适配（🟡 MEDIUM，2-3h）
- RC-5 Ask/Craft/Plan 独立模式（🟡 MEDIUM，2-3h）
- RC-6 一刀测试统一函数（🟢 LOW，1-2h）
- RC-7 / RC-8 随 RC-2 合并

RC-9~RC-12（角色业务能力深度）属「按需触发」型，登记 `docs/roadmap.md` backlog B6~B9（待新建）。

### 10.3 恢复触发点约定

| # | 触发条件 | 启动动作 |
|---|---|---|
| 1 | T+6 owner 122 条全量回归结果提交 | bench 修复 + 累积验证 |
| 2 | v2.6 进入 pre-ship（新委托）| v2.6 pre-ship 周期（**含 RC-1~RC-8**）|
| 3 | 6 个月稳定性复评 | 6mo 复评周期 |

---

## 11. 框架 v2.0 强制项验证

| 框架 § | 要求 | 验证结果 |
|---|---|---|
| §0.3 数值单家 + E-NN 流程 | 状态变更走 E-NN changelog + 五条件 | ✅ 12 项缺口均按 §0.3 流程登记 |
| §4.2 回归成本归属 | 审计方不代跑全量 LLM/API/desktop | ✅ 本次审计纯静态代码 review + 文档核对；无 LLM/桌面调用 |
| §4.3 AI 安全面 L1 | Prompt Injection / SSRF / 命令注入 | ✅ RC-1 硬门补完可强化「安全」claim 一票否决 |
| §5.2 预估成本(¥) 列 | 修复路径含位置 + 内容 + 效果 + 工时 + 预估成本 | ✅ §9 修复路径汇总表 12 项均含 |
| §5.3 置信度 §9 | HIGH/MED/LOW 逐条 | ✅ §1 + §9 + §11 均含 |
| §5.4 最小侵入式优先 | 不修则 6 个月内必然重大故障 | ✅ RC-1 硬门缺失会让「安全 vs 成本」冲突 case 失序；其余属体验优化 |
| §6 沟通原则 | 不确定标 LOW / 工具降级 / 缺失声明 | ✅ 12 项缺口透明声明；按需触发项标"LOW 置信度"|

---

## 12. 总结

- **5 角色业务能力**：1/5（秘书）部分实现、4/5（老板/PM/PM/架构师）路由层 + UI 子模式实现但深度不足
- **§2.2 镜片模型**：1/4 规则（一回复一主镜片）✅ + 1/4（冲突不私了）✅ + 2/4（冲突优先级 / 决策维度倾向）缺失或分散
- **§2.3 工程语义**：1/3（人类裁决）✅ + 2/3（硬门 / 策略表）🔴 缺失
- **§2.4 秘书恒定人格层**：🟡 碎片化（仅 3-7 处 reply）
- **§2.5 有眼力见儿**：1/4（②黑话消解）✅ + 1/4（①主动预判）部分 + 2/4（③场景关怀 / ④信息密度）部分或缺失
- **§4 一刀测试**：🟢 已分散实现，缺统一函数（可选）
- **§4.1 三栏交互**：3/3 三栏 ✅ + 1/3（Plan）✅ + 2/3（Ask/Craft）仅标签

**12 项新发现缺口**：
- 🟠 HIGH 1 项（RC-1 硬门 + 策略表）
- 🟡 MEDIUM 7 项（RC-2~RC-5 + RC-7/RC-8 + RC-9~RC-12 部分）
- 🟢 LOW 1 项（RC-6）

**v2.6 pre-ship scope 增量**：RC-1~RC-8（v2.5 治理机制补完）+ RC-9~RC-12（按需触发型业务能力深度）

**预估成本(¥)**：¥0（纯代码治理 + 静态分析 + 文档核对）

**回归影响**：12 项变更中 11 项 bench:na + 1 项行为变更（硬门一票否决）走定向回归

---

**本报告与 `v25-findings-and-remediation.md` 互为镜像：**
- **前者（v25-findings-and-remediation）**：代码侧诊断（R-1~R-9 + S-1~S-6）
- **本报告（role-business-capability-audit）**：需求侧诊断（§2 + §4 角色业务能力）
- **合用场景**：审计方验证 v2.5 交付完整性时，两份报告交叉覆盖——前者证「代码无明显治理漏洞」，后者证「v2.5 需求业务能力有据可查 + 未落地项已登记 v2.6+ 路线图」