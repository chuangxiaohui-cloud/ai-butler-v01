
# 推进计划：知识咨询四步链路（检索→抓正文→LLM 作答）+ 工具告警静默兜底（E270）

> 日期：2026-08-28 · 分支：v0.2b · 状态：进行中

## 目标

按用户诊断修复「答非所问」根因：RAG 链路缺「抓正文 → LLM 抽取 → 作答」，只在复述搜索 snippet 甩链接。补全 P0-P3：
- P0：知识/资讯类查询强制「检索 → 抓正文 → 喂 LLM 直接作答 + 参考来源」，禁止只罗列链接。
- P1：Tavily/引擎额度耗尽静默切换，仅全部引擎失败才提示「联网暂时不可用」。
- P2：数值/时效类问题（市值/排名/价格）要求标注数据日期、区分上市市值 vs 一级市场估值。
- P3：工具配额/API 告警与对话气泡分离（进状态栏/日志）。

## 现状（根因确认）

- `src/search/pipeline.ts`：search loop 拿 snippet → `fuseResults` → `synthesizeAnswer`；合成证据每条只给 300 字符 snippet（`s5_synthesize.ts`），LLM 无正文可读。
- 二次取证（`second-pass.ts`）仅器件型号（`extractPartNumber` 非空）或低置信触发，普通知识问答不抓正文。
- Tavily 月配额提示已由 E269 过滤；Bocha 余额告警仍会进对话气泡（P3 未做）。

## 计划

1. `second-pass.ts`：新增 `pickKnowledgeContentTargets`（融合 Top HTML 正文页 + 相关度补足，上限 3，跳过 PDF）。
2. `pipeline.ts`：知识/资讯意图（factual/news/comparison/how_to/experience/troubleshooting）且检索有结果时，用现有 `fetchSecondPassTargets` 抓正文，正文直接进 `pageContents` 传合成器，并追加到证据列表；`splitSearchNotices` 拆分用户可见提示与工具告警；全部引擎失败时追加「联网暂时不可用…」。
3. `s5_synthesize.ts`：新增 `pageContents` 块 + 硬约束指令「基于正文直接作答，给出结论与关键数据，文末附参考来源，禁止只列链接」；browser 来源证据内容切片放大；数值/时效类（市值/排名/价格/行情/榜单等）指令标注数据日期与口径区分。
4. UI（`App.tsx`）：`toolNotice` 显示到底部状态栏，不污染气泡。
5. 测试 + 全量验证 + 文档回填（需求文档 §5/§6 若涉及登记 E270 与 bench）。

## 文档/代码审阅结论（依用户要求，不以用户意见为准）

- **四步链路在 v2.5 需求里确有闭环条文**：Stage 3 检索 [P-85]/[P-86]（§6.0/§6.2/E25）、浏览器抓正文 E76/E80/E182（§6.5/§6.7）、Stage 5 合成 E104（§6.0）、接口契约 + [hard]/[soft] 证据链（§6.3/§9.1）——附录 A 逐条实现与 bench 验证。**结论：需求层无缺失。**
- **「UI 没接管道」假设不成立（代码审阅）**：`ui/prototype/src/App.tsx` `send()` 直接 `POST /api/ask`（E106 gateway 优先），仅 fetch 抛异常才回落 `ReplyDraft` 本地草稿；截图中的「甩链接」回答带搜索证据，必来自 gateway 管道。真实病灶 = 管道内：通用知识问答未触发「抓正文」步骤（E76/E80 只覆盖器件/低置信），Stage 5 只喂 300 字符 snippet；Tavily 告警经 `data.notice` 进了气泡（E269 已滤，本轮拆分为 toolNotice）。
- **管道真实弱项（按代码核实）**：① E81 词表缺 市值/排名/价格/估值/榜单 → 市值题不判 news、不切 90 天时效窗口（`recency.ts`/`s2_classify` 证实）；② §6.5.3 权威域表无金融源 → 东财/网易/OFweek 平权（`authority.ts` 证实）；③ 魔鬼训练基线 E99/E126 已知「搜索质量」0 分集中（附录 C）。

## 验收标准

- 「中国AI大模型公司中市值较高的是哪几家」经 gateway + medium：LLM 基于正文直接作答（有结论 + 关键数据 + 参考来源），不再只列链接；notice 不含工具告警。
- 全部引擎失败场景返回「联网暂时不可用…」提示。
- 单测/集成/doc-lint 全绿。

## 执行过程

### 改动

- `src/search/second-pass.ts`：新增 `pickKnowledgeContentTargets`（融合 Top HTML 正文页 + 相关度补足，上限 3，跳过 PDF）。
- `src/search/pipeline.ts`：知识/资讯意图强制抓正文 → `pageContents` 直喂合成 + 追加证据；`splitSearchNotices` 拆分用户提示/工具告警；全引擎失败追加「联网暂时不可用…」；`AnswerResult.toolNotice`。
- `src/search/stages/s5_synthesize.ts`：【网页正文】块 + P0 硬约束 + 数值口径（P2）；browser 证据切片 300→4000；fallback 含已抓正文。
- P2 补 E81 词表（`recency.ts`/`s2_classify`）+ §6.5.3 金融权威域（`authority.ts`）+ 金融子查询（`query-rewrite.ts`）。
- `ui/prototype/src/App.tsx`/`styles.css`：工具告警进底部状态栏（P3），移除死代码 banner。
- `src/config/params.ts`：新增 P-127 `knowledgePageFetchChars`、P-128 `synthesizePageTextChars`；文档 §5 同步登记，附录 A 登记 E270。

### 遇到的问题

- s5 测试断言字符串用「【网页正文】」与实际「【网页正文 · …】」不匹配 → 改前缀断言。
- news 分支金融 site: 子查询挤掉既有「最新」断言 → 子查询带「最新」。
- 知识抓取与低置信二次取证交叠：已抓 browser 证据并入 pageContents，避免重复抓。
- 本机沙箱环境 Edge headless 起不来 → 浏览器抓取路径由单测覆盖，E2E 走 snippet 降级（诚实作答 + 时效红线生效）。

## 结果

- 验证：单测 1029/1030（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 51 key）；UI 构建通过。
- 端到端（gateway + deepseek:medium）「中国AI大模型公司中市值较高的是哪几家？」：`toolNotice=Tavily 超限`（进状态栏，不污染气泡）、`notice=` 空、LLM 诚实作答（截至 2026-08-28 无完整市值榜单、给出相关报道与来源）、evidence 含 eastmoney 权威源。
- 提交：E270（待提交）
- 遗留：搜索耗时仍 50s+（provider 并行/超时调优另排期）；[P-127]/[P-128] provisional 待 bench:devil-v25 回归评估转定稿。