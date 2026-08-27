# 进度交接 2026-08-28（E268 身份问答一致性 + E269 合成跟随 UI 选档 / Tavily 预警静默 / 视觉档进切换器）

> 当前分支：v0.2b｜本轮收口：E268（身份问答一致性）+ E269（合成跟随 UI 选档、Tavily 预警静默、视觉档 deepseek-v4-flash-vision-exp 进切换器）。
> 上一份交接见 `docs/2026-08-27-progress-handoff.md`。

## 今日已收口

1. **E268 身份问答一致性**（桌面便携版实测反馈修复）：
   - **根因**：`ui/prototype/src/App.tsx` 回复 meta 用发送时旧 `mode` + 硬编码「· 后端」，身份问题显示「工程开发 · 后端」；FALLBACK_MODELS 三档 DeepSeek 全标 deepseek-chat 且默认档为 heavy（回答解析出 v4-pro 与 UI 显示冲突，且普通问答默认走 heavy 成本高）。
   - **修复**：meta 改为按后端返回 `data.mode`/`data.submode` 计算（身份问题→「知识咨询」）；默认档位改 P-105 缺省中档 medium（`defaultModelId` + 目录加载后未手动选档跟随 `catalog.defaultTier`，`modelTouchedRef` 记录手动选择）；FALLBACK_MODELS 换实体模型名；`self-identity.ts` 措辞改「当前生效模型」并明确身份类问题由内置规则秒回、不消耗模型调用额度。
   - **MiniMax 三档**：按官方文档（2026-08-27）落地 light=MiniMax-M2.7-highspeed / medium=MiniMax-M2.7 / heavy=MiniMax-M3（`llm-registry.ts` defaultModels、`.env` 显式 `MINIMAX_*_MODEL`、`npm run model:export` 刷新静态目录；切换器不再出现两个 M2.7）。
   - **证据**：新增单测 3 条（self-identity heavy/medium 实体模型名 + llm-registry MiniMax light/medium）；全量单测 1015/1016（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；playwright-core + Edge 实测：默认当前模型 DeepSeek deepseek-v4-flash（medium）、下拉 MiniMax M2.7-highspeed/M2.7/M3、问「你现在是什么模型？」回复 meta=知识咨询、正文与 UI 一致且说明不消耗模型额度；重新打包便携版/安装版 + 打包版冒烟 DESKTOP_READY；`data\一人公司AI-Agent 0.1.0.exe` 已同步。
   - **登记**：附录 A E268；计划文档 `docs/plans/2026-08-27-identity-model-consistency.md`。

2. **E269 合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器**（桌面便携版实测反馈修复）：
   - **根因（答非所问）**：gateway/CLI 把 heavy 客户端直接注入合成（`deps.llm`），UI 选档从未作用于真实合成；heavy v4-pro 大证据 prompt 超过 [P-116] 12s fallback 预算即落「搜索到了 N 条相关结果」兜底摘要（答非所问 + 每次 30s+ 耗时）。
   - **修复**：`pipeline.ts` 在 `modelSelection` 存在时用 `createClientForRole(role, {preferredId})` 按所选档位建合成客户端（默认 medium=flash 快且便宜，不再静默烧 v4-pro，12s 预算内正常作答）；新增 `filterChatSearchNotices` 过滤 Tavily 月配额噪音（配额监控仍走 `tavily:smoke`）；视觉档贯通（`model-catalog.ts` 导出 vision、`parseModelId` 接受 vision、`ModelRouteInfo.tier` 扩为 ModelRole、UI FALLBACK_MODELS 与静态目录补 3 家 vision 条目）。
   - **证据**：新增单测 2 条（filterChatSearchNotices / model-catalog 含 vision）+ 更新 model-router vision 解析与 gateway 目录正则；全量单测 1017/1018（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；真实端到端（gateway + modelId=deepseek:medium）「中国AI大模型公司中市值较高的是哪几家？」notice=null、LLM 真实作答（诚实说明无统一市值排名并给出寒武纪/科大讯飞/金山办公与主要玩家）、elapsed 33s（此前 83s 兜底）；playwright 实测切换器 DeepSeek 4 档含 deepseek-v4-flash-vision-exp（视觉）、回复 meta=知识咨询、无 Tavily 提示；视觉客户端 direct 调用 767ms 正常；重新打包便携版/安装版。
   - **登记**：附录 A E269；计划文档 `docs/plans/2026-08-28-synthesis-model-selection.md`。

## 提交

- `dbc9f09`（E268 身份问答一致性 + MiniMax 三档，10 文件 +150/-25）
- `b0e6ed0`（E269 合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器，15 文件 +142/-28）

## 全量验证

- 单测 1017/1018（1 skip）｜集成 32/32｜doc-lint 0 FAIL 0 WARN（C8 49 key）
- UI `tsc -b && vite build` 通过（index-CvCQcldw.js）

## 下一步（按优先级）

1. **用户实测新便携版**：先关闭运行中的旧便携版，我覆盖同步 `data\一人公司AI-Agent 0.1.0.exe` 后实测——市值类问题应得到真实 LLM 回答且无 Tavily 提示、切换器含 deepseek-v4-flash-vision-exp。
2. **普通知识问答耗时调优**：搜索仍 ~33-46s（Bocha/AnySearch 并行慢），涉及 §5 [P-NN] 需登记 bench 另排期。
3. **P-10 转定稿（条件③ 唯一阻塞）**：成熟度 L2+（当前 L1，用户累积 Skill 32/50+）仍为唯一阻塞；累积路径继续每周 3-5 个 Skill。
