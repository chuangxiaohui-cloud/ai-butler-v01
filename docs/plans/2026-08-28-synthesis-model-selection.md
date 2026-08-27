# 推进计划：合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器（E269）

> 日期：2026-08-28 · 分支：v0.2b · 状态：已完成

## 目标

修复桌面便携版实测三个问题：① 市值类问题回复变成「搜索到了 N 条相关结果」兜底摘要（答非所问）；② Tavily 月配额超限提示每次都显示；③ 模型切换器缺视觉档 `deepseek-v4-flash-vision-exp`。

## 计划

1. 定位「答非所问」根因：gateway/CLI 把 heavy 客户端直接注入合成（`deps.llm`），UI 选档从未生效；heavy v4-pro 大证据 prompt 超过 [P-116] 12s fallback 预算即落兜底摘要。
2. `pipeline.ts`：`modelSelection` 存在时用 `createClientForRole(role, {preferredId})` 按所选档位建合成客户端（默认 medium=flash，快且便宜）；未选档才回落 `deps.llm`。
3. 新增 `filterChatSearchNotices` 过滤 Tavily 月配额噪音（配额监控仍走 `tavily:smoke`）。
4. 视觉档：`model-catalog.ts` 导出 vision、`parseModelId` 接受 vision、`ModelRouteInfo.tier` 扩为 ModelRole、UI FALLBACK_MODELS 与静态目录补 vision 条目。
5. 测试 + 全量验证 + playwright 端到端 + 重新打包便携版/安装版 + 同步 `data\` 副本。

**验收标准**

- 市值类问题经 gateway + modelId=deepseek:medium 得到真实 LLM 回答（非兜底摘要）、notice=null。
- 切换器 DeepSeek 显示 4 档（含 deepseek-v4-flash-vision-exp · 视觉），默认仍为 medium。
- 单测/集成/doc-lint 全绿；便携版实测通过。

## 执行过程

### 改动

- `src/search/pipeline.ts`：合成客户端跟随 modelSelection + `filterChatSearchNotices`。
- `src/config/model-catalog.ts` / `src/search/model-id.ts` / `src/search/model-router.ts` / `src/search/stages/s5_synthesize.ts`：视觉档贯通。
- `ui/prototype/src/App.tsx` + `ui/prototype/public/model-providers.json`：切换器 vision 条目。
- 测试：`pipeline.test.ts` / `model-catalog.test.ts` 新增、`model-router.test.ts` / `app.test.ts` 更新。

### 遇到的问题

- gateway 单测「四字段契约」传 `modelId` 期望 fake LLM——新契约下选档走真实客户端，测试改为不带 modelId（选档路径由端到端验证）。
- `data\` 便携版被运行中的旧版占用，需用户关闭后覆盖同步。

## 结果

- 验证：gateway + medium 实测市值问题 notice=null、LLM 真实作答（诚实说明无统一市值排名并给出寒武纪/科大讯飞/金山办公与主要玩家）；playwright 实测切换器含视觉档、meta=知识咨询、无 Tavily 提示；视觉客户端 direct 调用 767ms 正常。
- 测试：单测 1017/1018（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）。
- 提交：待提交（E269）
- 遗留事项：搜索耗时仍 ~33-46s（provider 并行/超时调优另排期）；`data\` 副本待旧版关闭后覆盖。
