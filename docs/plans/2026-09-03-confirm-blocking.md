# 推进计划：confirm 真阻断语义（第一刀：待批准动作 + 聊天批准恢复，E324）

> 日期：2026-09-03 · 分支：v0.2b · 状态：已完成
> 承接：E323 记录侧裁决面板收口后，owner 拍板「就按你的推荐」推进 confirm 真阻断。前置事实：当前路由 `confirm` 与 `direct` 行为一致（中等置信直接执行）；要拦的是「会真动手的写类执行器」，不是知识问答。
> 设计约束：保持 `answer()` 四字段契约；CLI/gateway/UI 共用同一 `pipeline`，恢复执行必须复用 pipeline（禁止另起一套链路）；成本纪律：只跑 build + 定向单测 + doc-lint，不跑全量/bench。

## 目标

第一刀最小闭环：pipeline 遇到「`confirm` 路由 + 写类副作用执行器」时**不再直接执行**，而是把动作挂起（写 decision-log pending + 带 resume 载荷 + 通知），回答明确提示「回复『执行』继续 / 『取消』放弃，或右侧裁决页批准/否决」；同一会话里用户回复批准/取消时，预检识别并**在同一轮内恢复执行原请求**（批准）或记录否决并放弃（取消）。恢复走同一条 pipeline 递归，不另起链路。

本轮先拦**内置 Skill 的写类执行器**（试点清单见下），不拦知识问答/搜索；知识类 confirm 语义不变。真阻断先不区分成本大小，成本提示/风险分级/面板自动恢复留后续轮。

## 决策

- 试点拦截清单（executor 名，`_` 形式，全部为 bundled skill 目录存在且有副作用的写类）：`project_writer`（写项目文档）、`content_writer`（写文档）、`office_daily`（发信）、`calendar_skill`（建日程/导 ICS）、`im_dispatch`（外发消息）、`project_packager`（打包产物）。后续风险分级再扩。
- resume 载荷：decision-log pending 行增可选 `resume?: { query: string; executor: string }`（query 存原始提问，批准后递归 pipeline 重放原请求）。
- 去重：同一会话已有 open pending 时不再重复写 pending，直接提示先处理既有待批项。
- 批准/取消识别：仅当该会话存在带 resume 的 open pending 时，对整句（允许首尾空白/标点/语气词）做锚定匹配——批准词（执行/批准/同意/确认/继续/可以/好/好的/就这么办/来吧）与取消词（取消/否决/不执行/别执行/放弃/算了/不要）。避免与「批准函怎么写」等正文误伤：只整句匹配，不做子串。
- 面板（E323）批准仍只回填记录；「面板批准后自动恢复执行」留第二刀（需 gateway 侧 resume + UI 执行回执）。

## 计划（第一刀）

1. `src/escalation/decision-log.ts`：`DecisionLogEntry` 增可选 `resume`（含 query/executor，注释注明仅 confirm 阻断路径写入）；新增 `pendingForConversation(conversationId)`（返回该会话最近一条 open pending，无则 null）；既有测试不动。
2. `src/escalation/confirm-gate.ts`（新）：`CONFIRM_WRITE_EXECUTORS` 试点清单、`isConfirmWriteExecutor()`、`parseApprovalReply()`（整句锚定，返回 `'approve'|'reject'|null`）、`buildConfirmHoldAnswer()`（等待确认文案，含执行器名/操作类型/裁决页提示）。
3. `src/search/pipeline.ts`：
   - 入口预检（会话上下文就绪后、主路由前）：该会话有带 resume 的 open pending 且本句命中批准/取消 → 批准则 adjudicate('approve', note=chat_reply) 后带 `confirmResume` 标记递归 `pipeline(resume.query,…)` 恢复执行；取消则 adjudicate('reject', note=chat_reply) 并返回「已取消」；未命中则照常路由。
   - 拦截点（routeSelected 确定、特殊意图短路后、市场 Skill/内置 Skill 分发前）：`!opts.confirmResume && route.decision.type==='confirm' && isConfirmWriteExecutor(executor)` → 有 open pending 则提示先处理既有待批项；否则写 pending（含 resume）+ 通知「待你裁决」+ 返回等待确认文案（不执行）。
   - `PipelineOptions` 增内部可选 `confirmResume?: boolean`（恢复执行时抑制二次拦截，测试亦可注入）。
4. 测试：decision-log（pendingForConversation + resume 字段透传）；confirm-gate 纯函数（清单命中/文案/批准-取消整句匹配与防误伤，如「帮我写批准函怎么开头」不命中、带语气词/标点命中）；pipeline 定向（预检批准→恢复执行返回原请求结果且记录 approve、预检取消→返回取消并记 reject、无 pending 时「执行」二字不吞走正常路由）。confirm 路由强制到拦截分支若成本可控则补一条，否则以纯函数 + 预检链路测试覆盖并在结果中如实登记。
5. 文档：登记附录 A E324；code-directory escalation 行与 gateway/§4.1 相关行同步；当天交接文档补链接。

**验收标准**

- `npm run build` 绿；decision-log + confirm-gate + pipeline 定向单测全绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 行为可验证点：confirm+写类执行器不再直接执行，落一条含 `resume` 的 pending；聊天回复「执行」后同会话恢复执行原请求（结果来自 pipeline 同一链路）；回复「取消」记录 reject 且不执行；无待批项时「执行」两字照常路由不误吞。
- 全程零外部 LLM/API（¥0）；不跑全量/bench（成本纪律）。

## 执行过程

### 改动

- `src/escalation/decision-log.ts`：`DecisionLogEntry` 增可选 `resume{query,executor}`；新增 `pendingForConversation()`（某会话最近一条带 resume 的 open pending，裁决后回退上一条）。
- `src/escalation/confirm-gate.ts`（新）：`CONFIRM_WRITE_EXECUTORS` 试点清单（project_writer/content_writer/office_daily/calendar_skill/im_dispatch/project_packager）、`isConfirmWriteExecutor`、`parseApprovalReply`（整句剥尾部语气词/标点后匹配批准/取消词表）、`buildConfirmHoldAnswer`/`executorActionLabel`。
- `src/search/pipeline.ts`：入口预检（同会话带 resume 的 open pending + 整句批准/取消 → approve 带 `confirmResume` 递归重放原请求 / reject 返回已取消）；拦截点（confirm+写类执行器+有会话 → 写 pending 含 resume + 通知 + 等待确认文案，不执行；已有 open pending 则提示先处理）；`PipelineOptions.confirmResume` 内部标记。
- 测试：decision-log +1（pendingForConversation）、confirm-gate +2（清单/文案、批准取消识别防误伤）、pipeline +4（批准恢复、取消记录、无待批不误吞、confirm+calendar_skill 挂起）。

### 遇到的问题

- confirm 路由在 pipeline 里难强制：用 `llm: undefined` 走规则特征提取，`帮我安排明天上午十点的会议` 稳定产出 confirm + calendar_skill，拦截点测试可离线覆盖。
- 语气词归一：直接剥全部尾部语气词会把「来吧→来」漏判；改为「剥尾部语气词 + 基准词表（含 来/别 等）」候选匹配。

## 结果

- 验证：`npm run build` 绿；定向单测 decision-log 4/4 + confirm-gate 2/2 + pipeline 67/67（新增 E324 用例全部通过）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。全量 `test:all`/bench 未跑（成本纪律）。
- 能力：confirm+写类执行器由「直接执行」改为「挂起等批准」；聊天回复执行/取消在同一轮恢复/放弃；裁决记录仍 append-only（resume 载荷只挂在阻断路径的 pending 上）。
- 遗留：面板批准自动恢复执行已在第二刀收口（见下追加轮）；风险分级与本次操作预估成本、对话内确认卡、真实 CLI/桌面 e2e 验收仍待后续轮。
- 提交：未提交（延续工作区待统一确认批次）。

## 追加轮：E324 第二刀（裁决面板批准自动恢复执行 + 执行回执，2026-09-04）

### 目标

第一刀遗留「裁决面板批准后自动恢复执行」最小闭环：裁决页点「批准」时，gateway 对带 `resume` 载荷的
pending 先记录裁决事件，再以**同一 pipeline + `confirmResume` 标记**重放原请求恢复执行（不二次挂起），
响应带回执行回执 `executed`；UI 面板显示回执并把结果续到主聊天（会话匹配时）。否决仍只回填、不执行。

### 改动

- `src/gateway/app.ts`：`POST /api/decisions/:id` 改 async——先 `adjudicate` 记录并关闭记录库，`approve`
  且结果带 `resume` 时用该 pending 的会话 + `confirmResume: true` 重放 `resume.query`（走同一 pipeline，
  与 /api/ask 同 watchdog/进度事件），响应改 `{ ok, entry, resume?, executed? }`；执行抛错时 `executed.error`
  兜底（批准已记录不返 5xx）；否决或非 resume 项行为与 E323 一致（只回填、无回执）。
- `src/escalation/decision-log.ts`（第二刀前置）：`adjudicate` 结果已带原 pending 的 `resume` 载荷供 gateway 取用。
- `ui/prototype`：`DecisionPanel` 增 `onExecuted` 回执回调 + 面板内回执列表（✅ 已执行 / ❌ 已否决 / ⚠️ 执行失败），
  带 `resume` 的卡片标「⏸ 批准后自动执行」、批准按钮执行中态；App 把执行回执作为 agent 消息续到
  `CHAT_CONVERSATION_ID` 会话聊天（跨会话 pending 只在面板留回执）。

### 验证（全程零外部 LLM/API，¥0）

- `npm run build` 绿；gateway 27/27（新增 1 条：批准带 resume → 自动恢复执行返回 `executed`（含测试答案、
  不二次挂起、mode=knowledge）+ 否决不执行无回执 + 队列清空；会话上下文注入临时目录隔离）；decision-log 4/4
  （E324 用例补断言 adjudicate 带回 resume 载荷）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint`
  0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- 遗留：风险分级与「本次操作预估成本」展示、对话内确认卡、真实 CLI/桌面 e2e 验收（owner 手动验收待做）。

## 追加轮：E324 第三刀（对话内确认卡，2026-09-04）

### 目标

挂起写操作的等待文案不只在右栏裁决页可操作——在主聊天气泡内直接渲染「执行/取消」按钮，点按钮即走裁决
端点（批准自动恢复执行复用第二刀回执，取消只回填），属 §2.3 交互层「选项卡片」在聊天内的落地。

### 改动

- `ui/prototype/src/App.tsx`：`Message` 增可选 `confirm{pendingId}`；主聊天 `/api/ask` 返回含「⏸」挂起文案后，
  拉取 `GET /api/decisions`，把同会话（CHAT_CONVERSATION_ID）且 question 与文案一致的 open resume pending
  挂到该气泡 → `MessageItem` 在气泡内渲染确认卡（说明 + 执行/取消，提交中禁用防连点）。
- 点「执行/取消」直接 `POST /api/decisions/:id`（note=`chat_card`）：执行成功后 agent 回执「✅ 已在对话中批准并执行」
  + 原结果；取消回「❌ 已取消该操作，不会执行。」；面板批准会清掉对应气泡残留确认卡；409/失败给明确提示。
- `styles.css` 增 `.confirm-actions/.confirm-btn/.confirm-caption` 最小样式。
- 无后端/无 src 变更（复用第二刀裁决端点 + resume 回执链路）。

### 验证（全程零外部 LLM/API，¥0）

- `npm --prefix ui/prototype run build` 绿（tsc+vite）；`npm run doc-lint` 0 FAIL 0 WARN；src 单测不受影响
  （未改 src）。全量 `test:all`/bench 未跑（成本纪律）。
- 遗留：风险分级与「本次操作预估成本」展示、真实 CLI/桌面 e2e 验收（owner 手动验收含对话内确认卡场景）。
