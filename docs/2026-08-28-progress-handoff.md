# 进度交接 2026-08-28（E268 身份一致性 + E269 合成跟随选档 + E270 知识问答四步链路 / 工具告警分离）

> 当前分支：v0.2b｜本轮收口：E268（身份问答一致性）+ E269（合成跟随 UI 选档、Tavily 预警静默、视觉档进切换器）+ E270（知识问答四步链路：通用问答强制抓正文作答 + 工具告警静默兜底 + E81 词表与金融权威域）。
> 上一份交接见 `docs/2026-08-27-progress-handoff.md`。

## 今日已收口

### 0. E270 知识问答四步链路（依用户诊断 + 文档/代码审阅落地）

- **审阅结论**：四步链路在 v2.5 需求确有闭环条文（Stage 3 [P-85]/[P-86]、抓正文 E76/E80/E182、合成 E104、契约 §6.3）——需求层无缺失；「UI 没接管道」假设不成立（`App.tsx` send() 直连 /api/ask，截图回答带搜索证据必来自管道）；真实弱项是「抓正文」只覆盖器件/低置信 + E81 词表缺金融时效词 + §6.5.3 无金融权威域。
- **P0**：`pipeline.ts` 知识/资讯意图强制 `pickKnowledgeContentTargets` → `fetchSecondPassTargets` 抓正文 → `pageContents` 直喂 `s5_synthesize`（【网页正文】块 + P0 硬约束「直接作答 + 文末参考来源，禁止只列链接」）；browser 证据切片 300→4000（[P-127]）；单篇正文 ≤[P-128]（3 篇 × 3k ≈ 9k tokens，12s 预算内）。
- **P1**：`splitSearchNotices` 拆分用户提示/工具告警；全引擎失败才提示「联网暂时不可用，以下为模型内置知识回答（可能非最新）」。
- **P2**：E81 词表补 市值/排名/排行/榜单/价格/股价/汇率（`recency.ts` + `s2_classify` 规则优先 news≤24h）；§6.5.3 补金融权威域（sse/szse 官方 1.0、hkex 0.9、eastmoney/cninfo 0.85、forbes/hurun 0.8）+ `query-rewrite` 金融 site: 子查询（E85 模式）。
- **P3**：工具告警（Tavily 超限/Bocha 余额）→ `AnswerResult.toolNotice` → UI 底部状态栏（移除死代码 banner），不污染气泡。
- **证据**：新增单测 12 条；全量单测 1029/1030（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 51 key）；UI 构建通过；gateway E2E：市值题 toolNotice=Tavily 超限、notice 空、LLM 诚实作答（截至 2026-08-28 无完整榜单 + 来源）、evidence 含 eastmoney；计划文档 `docs/plans/2026-08-28-knowledge-qa-four-step.md`。
- **登记**：附录 A E270；[P-127]/[P-128] provisional@2026-08-28。

### 1. E268 身份问答一致性（桌面便携版实测反馈修复）

   - **根因**：`ui/prototype/src/App.tsx` 回复 meta 用发送时旧 `mode` + 硬编码「· 后端」，身份问题显示「工程开发 · 后端」；FALLBACK_MODELS 三档 DeepSeek 全标 deepseek-chat 且默认档为 heavy（回答解析出 v4-pro 与 UI 显示冲突，且普通问答默认走 heavy 成本高）。
   - **修复**：meta 改为按后端返回 `data.mode`/`data.submode` 计算（身份问题→「知识咨询」）；默认档位改 P-105 缺省中档 medium（`defaultModelId` + 目录加载后未手动选档跟随 `catalog.defaultTier`，`modelTouchedRef` 记录手动选择）；FALLBACK_MODELS 换实体模型名；`self-identity.ts` 措辞改「当前生效模型」并明确身份类问题由内置规则秒回、不消耗模型调用额度。
   - **MiniMax 三档**：按官方文档（2026-08-27）落地 light=MiniMax-M2.7-highspeed / medium=MiniMax-M2.7 / heavy=MiniMax-M3（`llm-registry.ts` defaultModels、`.env` 显式 `MINIMAX_*_MODEL`、`npm run model:export` 刷新静态目录；切换器不再出现两个 M2.7）。
   - **证据**：新增单测 3 条（self-identity heavy/medium 实体模型名 + llm-registry MiniMax light/medium）；全量单测 1015/1016（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；playwright-core + Edge 实测：默认当前模型 DeepSeek deepseek-v4-flash（medium）、下拉 MiniMax M2.7-highspeed/M2.7/M3、问「你现在是什么模型？」回复 meta=知识咨询、正文与 UI 一致且说明不消耗模型额度；重新打包便携版/安装版 + 打包版冒烟 DESKTOP_READY；`data\一人公司AI-Agent 0.1.0.exe` 已同步。
   - **登记**：附录 A E268；计划文档 `docs/plans/2026-08-27-identity-model-consistency.md`。



### 2. E269 合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器

   - **根因（答非所问）**：gateway/CLI 把 heavy 客户端直接注入合成（`deps.llm`），UI 选档从未作用于真实合成；heavy v4-pro 大证据 prompt 超过 [P-116] 12s fallback 预算即落「搜索到了 N 条相关结果」兜底摘要（答非所问 + 每次 30s+ 耗时）。
   - **修复**：`pipeline.ts` 在 `modelSelection` 存在时用 `createClientForRole(role, {preferredId})` 按所选档位建合成客户端（默认 medium=flash 快且便宜，不再静默烧 v4-pro，12s 预算内正常作答）；新增 `filterChatSearchNotices` 过滤 Tavily 月配额噪音（配额监控仍走 `tavily:smoke`）；视觉档贯通（`model-catalog.ts` 导出 vision、`parseModelId` 接受 vision、`ModelRouteInfo.tier` 扩为 ModelRole、UI FALLBACK_MODELS 与静态目录补 3 家 vision 条目）。
   - **证据**：新增单测 2 条（filterChatSearchNotices / model-catalog 含 vision）+ 更新 model-router vision 解析与 gateway 目录正则；全量单测 1017/1018（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；真实端到端（gateway + modelId=deepseek:medium）「中国AI大模型公司中市值较高的是哪几家？」notice=null、LLM 真实作答（诚实说明无统一市值排名并给出寒武纪/科大讯飞/金山办公与主要玩家）、elapsed 33s（此前 83s 兜底）；playwright 实测切换器 DeepSeek 4 档含 deepseek-v4-flash-vision-exp（视觉）、回复 meta=知识咨询、无 Tavily 提示；视觉客户端 direct 调用 767ms 正常；重新打包便携版/安装版。
   - **登记**：附录 A E269；计划文档 `docs/plans/2026-08-28-synthesis-model-selection.md`。



## 提交

- `dbc9f09`（E268 身份问答一致性 + MiniMax 三档，10 文件 +150/-25）
- `b0e6ed0`（E269 合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器，15 文件 +142/-28）
- `E270`（知识问答四步链路 + 工具告警分离 + E81 词表与金融权威域，待提交）

## 全量验证

- 单测 1029/1030（1 skip）｜集成 32/32｜doc-lint 0 FAIL 0 WARN（C8 51 key）
- UI `tsc -b && vite build` 通过（index-BllgQORM.js）

## 下一步（按优先级）

1. **用户实测新便携版（含 E270）**：关闭运行中的旧便携版后覆盖同步 `data\一人公司AI-Agent 0.1.0.exe`——市值类问题应基于抓取正文/来源直接作答、Tavily 告警只出现在底部状态栏、切换器含 deepseek-v4-flash-vision-exp。
2. **普通知识问答耗时调优**：搜索仍 ~33-50s（Bocha/AnySearch 并行慢），涉及 §5 [P-NN] 需登记 bench 另排期。
3. **[P-127]/[P-128] 转定稿**：provisional@2026-08-28，随 `bench:devil-v25` 回归评估（金融词表/权威域行为变更暂未新增基准）。
4. **P-10 转定稿（条件③ 唯一阻塞）**：成熟度 L2+（当前 L1，用户累积 Skill 32/50+）仍为唯一阻塞；累积路径继续每周 3-5 个 Skill。
