# 进度交接 2026-08-28（E268 身份问答一致性：路由标签 / 默认模型档位 / 成本提示 + MiniMax 三档实体模型名）

> 当前分支：v0.2b｜本轮收口：E268（桌面便携版实测「你现在是什么模型？」三问题修复——meta 错标「工程开发 · 后端」、回答与 UI 模型显示冲突、身份问题成本疑虑；同步按 MiniMax 官方文档落地 light=M2.7-highspeed / medium=M2.7 / heavy=M3 三档实体模型名）。
> 上一份交接见 `docs/2026-08-27-progress-handoff.md`。

## 今日已收口

1. **E268 身份问答一致性**（桌面便携版实测反馈修复）：
   - **根因**：`ui/prototype/src/App.tsx` 回复 meta 用发送时旧 `mode` + 硬编码「· 后端」，身份问题显示「工程开发 · 后端」；FALLBACK_MODELS 三档 DeepSeek 全标 deepseek-chat 且默认档为 heavy（回答解析出 v4-pro 与 UI 显示冲突，且普通问答默认走 heavy 成本高）。
   - **修复**：meta 改为按后端返回 `data.mode`/`data.submode` 计算（身份问题→「知识咨询」）；默认档位改 P-105 缺省中档 medium（`defaultModelId` + 目录加载后未手动选档跟随 `catalog.defaultTier`，`modelTouchedRef` 记录手动选择）；FALLBACK_MODELS 换实体模型名；`self-identity.ts` 措辞改「当前生效模型」并明确身份类问题由内置规则秒回、不消耗模型调用额度。
   - **MiniMax 三档**：按官方文档（2026-08-27）落地 light=MiniMax-M2.7-highspeed / medium=MiniMax-M2.7 / heavy=MiniMax-M3（`llm-registry.ts` defaultModels、`.env` 显式 `MINIMAX_*_MODEL`、`npm run model:export` 刷新静态目录；切换器不再出现两个 M2.7）。
   - **证据**：新增单测 3 条（self-identity heavy/medium 实体模型名 + llm-registry MiniMax light/medium）；全量单测 1015/1016（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；playwright-core + Edge 实测：默认当前模型 DeepSeek deepseek-v4-flash（medium）、下拉 MiniMax M2.7-highspeed/M2.7/M3、问「你现在是什么模型？」回复 meta=知识咨询、正文与 UI 一致且说明不消耗模型额度；重新打包便携版/安装版 + 打包版冒烟 DESKTOP_READY；`data\一人公司AI-Agent 0.1.0.exe` 已同步。
   - **登记**：附录 A E268；计划文档 `docs/plans/2026-08-27-identity-model-consistency.md`。

## 提交

- 待提交（代码批 + 文档批合并单一主题：E268 身份问答一致性 + MiniMax 三档）

## 全量验证

- 单测 1015/1016（1 skip）｜集成 32/32｜doc-lint 0 FAIL 0 WARN（C8 49 key）
- UI `tsc -b && vite build` 通过（index-Bt-sen56.js）；打包版冒烟 DESKTOP_READY

## 下一步（按优先级）

1. **用户实测新便携版**：`data\一人公司AI-Agent 0.1.0.exe`——验证「你现在是什么模型？」标签=知识咨询、默认模型=deepseek-v4-flash（medium）、切换 MiniMax 可见 M2.7-highspeed/M2.7/M3。
2. **P-10 转定稿（条件③ 唯一阻塞）**：成熟度 L2+（当前 L1，用户累积 Skill 32/50+）仍为唯一阻塞；累积路径继续每周 3-5 个 Skill。
3. **普通知识问答 30s 耗时调优**（并行 provider / 超时档位，涉及 §5 [P-NN] 需登记 bench）或继续市场 Skill 沉淀。
