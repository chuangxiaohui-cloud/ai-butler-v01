# 推进计划：内容型思维导图（E342）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

owner 实测「FreeRTOS 的软件架构思维导图？」回答很差（被路由成知识问答且合成超时，只回网页摘要）。方向 A 收口：让「某主题的思维导图/把 X 架构做成思维导图（无自带大纲）」这类**内容型**请求，走「检索 → LLM 只出大纲（短输出规避超时）→ 交付文字大纲讲解 + 挂生成 .xmind 裁决卡」，批准后自动落盘 `outputs/pm-xmind/`。

## 计划

1. 意图层：`intent-feature.ts` 新增 `xmind_content` actionType 与名词/动词形态识别（主题 + 架构/结构 + 思维导图；或 把 X 做成…），自带大纲结构行、读回 .xmind、咨询泛问句让位（xmind 直接生成 / qa）→ verify：router 用例。
2. 提取层：`extract.ts` 对 `xmind_content` 确定性优先（不经 LLM 分类，省调用且不被判成普通知识问答）。
3. 路由：`routing-table.ts` 增 `R_XMIND_CONTENT`（PM 角色、searchNeed=true、strict actionType-only）。
4. 合成：`s5_synthesize.ts` 增 `outlineOnly` 模式（只输出层级大纲，≤3 层 ≤30 行，禁止段落/来源列表）→ verify：s5 用例。
5. pipeline：合成传 `outlineOnly`；大纲解析出结构且 source=llm 时，文字交付 + 记录 pending（resume=pm_xmind + 完整大纲文本）并挂「⏸ 是否生成 .xmind」卡；超时/失败不挂卡给重试引导 → verify：pipeline 用例（含超时分支）。
6. 文档：计划（本文件）、需求附录 A E342、当日 handoff 登记。

**验收标准**

- 「X 的软件架构思维导图？」先给可读大纲文字，再出低风险 ¥0 confirm 卡；批准后 `outputs/pm-xmind/pm-xmind-*.xmind` 落盘并回执路径。
- 「把 X 做成思维导图」且**自带大纲**仍走 E340 直接生成（不被内容型抢走）；咨询问句仍走知识问答。

## 执行过程

### 改动

- `src/agent/intent-feature.ts`：ACTION_TYPES 增 `xmind_content`；内容型名词/动词正则（`XMIND_CONTENT_NOUN_RE`/`VERB_RE`）；`OUTLINE_LINE_RE`/`XMIND_CONSULT_RE`/读回 .xmind 守卫；`xmind_content` 置 `requiresExternalSearch` + `searchSourceHint=web_search`。
- `src/agent/extract.ts`：规则命中 `xmind_content` 时直接返回 rule（跳过 LLM 分类）。
- `src/agent/routing-table.ts`：`R_XMIND_CONTENT`（project_manager / intent `xmind_content` / searchNeed true）。
- `src/search/stages/s5_synthesize.ts`：`SynthesizeOptions.outlineOnly` + 大纲硬约束 system prompt（含注入防御），P0 长文约束跳过。
- `src/search/pipeline.ts`：import `parseOutlineToTree`；合成传 `outlineOnly`；post-synthesis 加 E342 块——LLM 大纲有结构 → 文字交付 + `confirmDecisionLog.record` pending（resume.query=完整大纲、executor=pm_xmind、intent=xmind）+ 通知 + 追加 ⏸ 卡；失败 → 只给重试引导。
- 测试：`router-v2-xmind.test.ts` +4（内容问句/动词形态→R_XMIND_CONTENT；自带大纲仍 R_XMIND；咨询问句不落内容型）；`s5_synthesize.test.ts` +1（outlineOnly 输出约束、不要求参考来源/P0）；`pipeline.test.ts` +2（内容流程挂卡 resume 断言、合成超时不挂卡给引导）。

### 遇到的问题

- 单测 FakeProvider 对 FreeRTOS 这类未知实体产不出有效证据（真实环境有证据），pipeline 用例改用 STM32 主题（与既有合成超时用例同链路）驱动。
- `xmind_content` 名词规则曾误吞「读取 .xmind 大纲」读回意图，补读取类词 + 思维导图类词守卫让位 xmind。

## 结果

- 验证：`npm run build` 绿；pipeline 70/70 + router-xmind/s5/extract/executors/router-v2 126/126 + routing-enum 集成 1/1 全绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：单测见上；集成 routing-enum 1/1；全量 test:all/bench 未跑（成本纪律）。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——5173 输入「FreeRTOS 的软件架构思维导图？」预期先得大纲文字 + ⏸ 卡，批准后产物区出现 .xmind 且 Xmind 可打开；「把这段大纲做成思维导图：1.…」仍走直接生成；超时重试指引可用更快档位。
