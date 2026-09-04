# 进度交接 2026-09-04（confirm 真阻断第二/三刀 + E325/E329 标题清洗 + E326/E327 人称规约 + E328 目录监听 + E330 恢复钉死/reminder 收窄 + E331 通知分页/角标 + E332 兜底离线标识/重试 + E333 重试原句预览）

> 当前分支：v0.2b｜本轮收口：E324 第二刀（裁决面板批准自动恢复执行 + 执行回执）+ 第三刀（对话内确认卡）+ E325（日程标题残词修复）+ E326（confirm 复述人称切换）+ E327（执行回执/日程条目人称规约：回执第二人称＋「老板」称谓、AI 生成标题中性化）+ E328（projects/ 目录变更监听）+ E329（标题清洗剥离提醒从句）+ E330（confirm 恢复执行钉死原裁决 + reminder 触发词/verify 收窄）+ E331（§4.1 通知分页 + 未读角标）+ E332（网关未连接兜底醒目标识 + 重试）+ E333（重试按钮带原句预览）+ E334（confirm 挂起带风险分级与本次操作预估成本）。
> 上一份交接见 `docs/2026-09-03-progress-handoff.md`（E324 第一刀收口于 2026-09-03，跨零点续做第二刀）。

## 今日完成

### confirm 真阻断第二刀：面板批准自动恢复执行 + 执行回执（E324·追加轮）

- **背景**：第一刀把 confirm + 写类执行器改为「挂起等批准」，聊天回复「执行/取消」可恢复；遗留「裁决面板批准后自动恢复执行」本轮收口（风险分级与操作预估成本、对话内确认卡仍留后续轮）。
- **代码**：
  - `src/gateway/app.ts`——`POST /api/decisions/:id` 改 async：先 `adjudicate` 记录裁决并关闭记录库；`approve` 且原 pending 带 `resume` 时，用该 pending 的会话 + `confirmResume: true` 重放 `resume.query`（复用 pipeline，与 /api/ask 同 watchdog/进度事件，不二次挂起），响应 `{ ok, entry, resume?, executed? }`；执行抛错回 `executed.error` 兜底（批准已记录不返 5xx）；否决/非 resume 项与 E323 一致（只回填、无回执）。
  - `src/escalation/decision-log.ts`——`adjudicate` 结果带原 pending 的 `resume` 载荷（第二刀前置，供 gateway 取用）。
  - `ui/prototype/src/App.tsx` + `styles.css`——裁决页面板回执列表（✅ 已执行 / ❌ 已否决 / ⚠️ 执行失败）、带 `resume` 卡片标「⏸ 批准后自动执行」、批准按钮执行中态；执行回执经 `onExecuted` 续到 `CHAT_CONVERSATION_ID` 主聊天（跨会话 pending 只在面板留回执）。
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；gateway 27/27（新增 1 条：批准带 resume → 自动恢复执行返回 `executed`（含测试答案、不二次挂起、mode=knowledge）+ 否决不执行无回执 + 队列清空；会话上下文注入临时目录隔离）；decision-log 4/4（E324 用例补断言 adjudicate 带回 resume 载荷）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A 增 09-04 第二刀登记行（紧邻 E324 第一刀行上方）；计划 `docs/plans/2026-09-03-confirm-blocking.md` 追加第二刀轮次；`docs/code-directory.md` / `docs/directory-structure.md` 同步 E324 第二刀；09-03 交接的“第二刀”候选行已加指向本文件；本交接。
- **已知边界**：批准后恢复执行失败只在面板留 error 回执、不自动重试（聊天可再触发）；通知区旧「待你裁决」通知不随裁决消失（通知库 append-only，E323 起行为）；面板批准与聊天「执行」两条恢复路径都以同一 `confirmResume` 递归重放，不会互相二次拦截。

### confirm 真阻断第三刀：对话内确认卡（E324·追加轮）

- **代码**（纯 UI，无后端/src 变更，复用第二刀裁决端点 + resume 回执）：
  - `ui/prototype/src/App.tsx`——`Message` 增可选 `confirm{pendingId}`；主聊天 `/api/ask` 返回含「⏸」挂起文案后，拉取 `GET /api/decisions` 把同会话且 question 与文案一致的 open resume pending 挂到该气泡；`MessageItem` 在气泡内渲染「执行/取消」确认卡（提交中禁用防连点）。点按钮直接 `POST /api/decisions/:id`（note=`chat_card`）：批准自动恢复执行并续 agent 回执「✅ 已在对话中批准并执行」+ 原结果；取消回「❌ 已取消该操作，不会执行。」；面板批准会清掉对应气泡残留确认卡；409/失败给明确提示。
  - `styles.css`——增 `.confirm-actions/.confirm-btn/.confirm-caption` 最小样式。
- **验证**（全程零外部 LLM/API，¥0）：`npm --prefix ui/prototype run build` 绿（tsc+vite）；`npm run doc-lint` 0 FAIL 0 WARN；src 单测不受影响。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A 增 09-04 E324 第三刀登记行；计划 `docs/plans/2026-09-03-confirm-blocking.md` 追加第三刀轮次；本交接。

### owner 手动验收通过 + 日程标题残词修复（E324 验收 → E325）

- **验收结果**：owner 已用主聊天提问「帮我安排一下我家里明天的亲子游行程安排」实测对话内确认卡——挂起文案正常、点「执行」后聊天出现「✅ 已在对话中批准并执行」回执（已创建日程 + 已同步设置提醒），主链路通过。
- **发现缺陷**：回执显示日程标题为「一下我家里明天亲子游行程」——calendar 创建日程的标题清洗只删「安排」把「安排一下」剩成「一下」（`src/skills/calendar-skill/index.ts` 正则）。
- **修复（E325）**：清洗正则 `/帮我|安排|预约|订|会议|日程|的/g` → `/帮我|安排一下|安排|预约|订|会议|日程|的/g`（「安排一下」整体先于「安排」摘除）；新增单测断言同款提问创建结果含「已创建日程：我家里明天亲子游行程」且不含「一下」。验证：`npm run build` 绿 + calendar-skill 15/15 + `doc-lint` 0 FAIL 0 WARN。
- **文档**：需求文档附录 A E325 登记；计划 `docs/plans/2026-09-04-calendar-title-clean.md`。

### confirm 复述人称切换（E326）

- **背景**：owner 复看 E325 回执指出人称缺陷——用户「我让 AI 帮我…我家里…」，AI 确认文案却回「你让我“帮我…我家里…”」，
  形成“你让我帮我家里”的人称错乱。
- **修复**：`src/escalation/confirm-gate.ts` 新增纯函数 `restateForUser()`（第一人称「我」→「你」，含 我们→你们），
  `buildConfirmHoldAnswer()` 复述改用切换后文案（示例：确认文案变「你让我“帮你安排一下你家里明天的亲子游行程安排”」）；
  resume 仍用原始 query。新增单测断言。
- **验证**：`npm run build` 绿；confirm-gate 3/3 + pipeline 67/67 + gateway 27/27 回归绿；`doc-lint` 0 FAIL 0 WARN。
- **文档**：需求文档附录 A E326 登记；计划 `docs/plans/2026-09-04-confirm-deixis.md`；code-directory escalation 行同步。

### 执行回执/日程条目人称规约（E327）

- **背景**：owner 复看 E326 后指出执行回执仍出现「我家里」——回执里的日程标题由 `calendar-skill` 从口语请求生成，E325 清洗只去动词残词，把第一人称「我家里」与相对时间「明天」留进了标题，导致“确认卡说‘你家里’、回执说‘我家里’”的错位。owner 拍板：称呼用户用「老板」（不用「老张」），回执/条目统一第二人称规约（选 A 方案）。
- **代码**：`src/skills/calendar-skill/index.ts`——标题清洗正则扩为 `/帮我|安排一下|我们|我的|安排|预约|订|会议|日程|今天|明天|后天|家里|的|我/g`（「我们/我的」先于「我」摘除防残留，剥离第一人称与相对时间词），示例「帮我安排一下我家里明天的亲子游行程安排」→ 标题「亲子游行程」；创建结果模板 `已创建日程：` → `已为你创建日程：`（第二人称回执）。`ui/prototype/src/App.tsx`——对话确认卡回执前缀 `✅ 已在对话中批准并执行。` → `✅ 老板，已按你的批准执行。`；裁决面板批准回执 `✅ 已在裁决页批准并执行。` → `✅ 老板，已在裁决页批准并执行。`
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；定向回归 112/112（calendar-skill 15/15——E325 用例期望更新为「已为你创建日程：亲子游行程」且不含「我家里」，另 4 处创建断言同步；confirm-gate 3/3、pipeline 67/67、gateway 27/27 不受文案影响）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A E327 登记；计划 `docs/plans/2026-09-04-receipt-persona.md`；`docs/code-directory.md` UI 行同步；本交接。

### projects/ 目录变更监听（E328）

- **背景**：owner「继续推进」并排除提交批次后，按推荐推进 §4.1 候选「projects/ 目录文件变更监听」。现状缺口：`files_changed` SSE 只在 `/api/ask` 问答写盘后由网关主动广播一次，外部工具/手动改动 `projects/` 时 UI 文件面板不会自动刷新。
- **代码**：新增 `src/gateway/project-watcher.ts`——复用 `listProjectFiles` 遍历口径做低频轮询快照差量（`snapshotProjects` 只取 `projects/` 且剔除编辑器/Office 临时文件；`diffSnapshots` 区分 added/modified/removed 按路径排序；`startProjectWatcher` 默认 2s 轮询、首轮为基线、stop 可停）；`src/gateway/server.ts` 启动后挂起监听、变更即广播 `files_changed`（source=project_watch），shutdown 时 stop。UI 零改动（复用既有 SSE 监听刷新文件面板）；变更不写通知库、不触发 LLM，避免秘书日报摘要噪音与成本。
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；project-watcher 定向 3/3（快照范围+临时文件剔除 / diff 四态含排序与无变更 / 端到端新增→修改→临时文件不触发→删除→stop 停止）；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。真实冒烟（`npm run gateway` + 外部改 projects/ → UI 自动刷新）待 owner 手动验收。
- **文档**：需求文档附录 A E328 登记；计划 `docs/plans/2026-09-04-project-watch.md`；`docs/code-directory.md` / `docs/directory-structure.md` gateway 行同步；本交接。

### 日程标题清洗剥离提醒从句（E329）

- **背景**：E325/E327 标题清洗系列边角料——带提前量提醒的建日程会把「，提前10分钟提醒」残留进事件名（如「帮我安排明天下午3点的周会，提前10分钟提醒」→ 标题含整段提醒从句）。
- **代码**：`src/skills/calendar-skill/index.ts` 标题清洗抽成可测纯函数 `cleanCalendarTitle()`（导出）；追加剥离 `「，提前…提醒」` 从句并清尾部标点/空白；create 路径改调用；提前量解析仍从原 query 走 `parseLeadMs`。
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；calendar-skill 定向 16/16（新增 1 条纯函数用例）；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A E329 登记；计划 `docs/plans/2026-09-04-calendar-title-reminder.md`；本交接。

### confirm 恢复执行钉死原裁决 + reminder 市场 Skill 收窄（E330）

- **背景**：E329 手动验收句「帮我安排明天下午3点的周会，提前10分钟提醒」暴露真实缺陷——批准恢复执行会把原句重跑完整路由，市场 reminder 裸触发词「提醒」把句子从日历口语句抢走执行成一次性提醒（message 残留「安排的周会，提前10分钟」）；reminder manifest 调试遗留 `verify: ["git status --short"]`（runner 每次执行都跑）把 dirty git 状态拼进执行回执。owner 拍板「按 A+B 开工」。
- **代码**：A 根因——`src/escalation/decision-log.ts` resume 载荷增 `intent?`；`src/search/pipeline.ts` E324 挂起写 `resume.intent`、`PipelineOptions` 增 `confirmResumeExecutor/confirmResumeIntent`，聊天批准递归与 gateway 裁决恢复都转发两字段，E324 拦截返回后新增 E330 钉死块（恢复执行强制回原 executor/intent 且 `searchNeed=false`），E243 市场 Skill 直连块加 `!opts.confirmResume` 守卫；`src/gateway/app.ts` 批准恢复透传两字段。B——`configs/` + `data/` 两份 reminder manifest 删除 verify、触发词收窄为定向词（移除裸「提醒/每天/每周」）；`src/skills/market/nl-router.ts` 横幅剥离改逐行（兼容 Windows `\r\n` 与前导空行）；`src/skills/market/reminder.ts` message 清洗去「帮我/安排/今天/明天/后天」及「，提前N分钟提醒」从句。
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；定向单测 pipeline 68/68（新增 E330 回归：恢复执行不再调用市场 Skill runner、按被批准 executor 分发）、reminder 7/7、nl-router 36/36、decision-log 4/4、calendar-skill 16/16、market runner/manifest/installer + gateway 69/69；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A E330 登记；计划 `docs/plans/2026-09-04-market-reminder-resume.md`；本交接。

### §4.1 右栏通知打磨：通知分页 + 未读角标（E331）

- **背景**：owner「A」选定 §4.1 UI 打磨（handoff 后续轮候选通知角标/分页按需项；目录监听已收口）。通知区现状写死「最近 50 条」一次性拉取，无翻页、无新到达提醒。
- **代码**：`src/notifications/notification-store.ts` 增 `all()`；`src/gateway/app.ts` `/api/notifications` 支持 `page/pageSize` 并回 `total`（缺省 page=1/pageSize=20），摘要窗口固定最近 200 条；`ui/prototype/src/App.tsx` 通知页分页工具栏（上一页/下一页 + 页码/总数 + 刷新）、通知 tab 未读角标（会话内水位：查看通知页置水位清零，非通知 tab 时 30s 后台拉第一页计数，99+ 封顶）；`ui/prototype/src/styles.css` 增 `.tab-badge` / `.notify-pager` 样式。
- **验证**（全程零外部 LLM/API，¥0）：`npm run build` 绿；gateway/notifications 定向 42/42（新增分页切片用例）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A E331 登记；计划 `docs/plans/2026-09-04-notify-pagination-badge.md`；本交接。

### 网关未连接本地兜底加醒目标识 + 「重试」按钮（E332）

- **背景**：E331 手动验收时网关没启动，聊天出现「工程开发 · 本地兜底」文案并带假的文件/终端证据，与真实回答难以区分、易误判为真实路由结果。owner「A」选中该打磨项。
- **代码**：`ui/prototype/src/App.tsx`——`Message` 增 `retryQuery?`；`ReplyDraft()` 重写为固定「⚠️ 网关未连接，刚才的请求没有真正执行（本地预览，非真实回答）」+ meta「{模式} · ⚠️ 本地预览」+ 携带原请求，删除按 mode 的演示文案与假证据；`send()` 抽 `askQuery(text, attachments, dropMsgId?)`（重试摘原兜底回复、不重复用户气泡），新增 `retryFallback`（`retryingId` 防连点）；`MessageItem` 增 `onRetry/retrying` 并渲染「↻ 重试」按钮；`styles.css` 增 `.message-retry`。
- **验证**（全程零外部 LLM/API，¥0）：`npm --prefix ui/prototype run build` 绿（tsc+vite）；纯前端改动，src 单测不受影响；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A E332 登记；计划 `docs/plans/2026-09-04-fallback-offline-marker.md`；本交接。

### 本地兜底「重试」按钮带原句预览（E333）

- **背景**：E332 验收时 owner 误点旧兜底的重试，重发的是无城市的“明天天气如何”，与随后新问的广州天气先后回复，造成“问了广州还被反问城市”的误读。
- **代码**：`ui/prototype/src/App.tsx`（`MessageItem`）——重试按钮文案 `↻ 重试` → `↻ 重试「{原句}」`（超 16 字截断加 …，`title` 放完整原句），重试中仍显示 `重试中…`。
- **验证**（全程零外部 LLM/API，¥0）：`npm --prefix ui/prototype run build` 绿（tsc+vite）；纯前端改动；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。
- **文档**：需求文档附录 A E333 登记；计划 `docs/plans/2026-09-04-retry-button-show-query.md`；本交接。

### E324–E333 整批手动 e2e 验收执行清单（docs-only）

- **内容**：owner「推进下一轮」；为 E318–E333 未提交批次铺“验收→提交”路径，整理 `docs/plans/2026-09-04-e2e-acceptance-run.md`：
  A 组日程/confirm 链路（A1 亲子游 E325-327、A2 周会提前提醒 E329/E330、A3 否决与重复挂起 E324）、
  B 组 UI 旁路（B1 目录监听 E328、B2 通知角标/分页 E331、B3 离线兜底与重试 E332/E333）、
  C 组 CLI/桌面冒烟（身份问答 / desktop+smoke / gateway 读 API）。
- **验证**：本项纯文档，无代码改动，不新增 E 编号；doc-lint 不受影响。执行仍由 owner 手动，结果回填清单后进入提交批次决策。
- **文档**：计划 `docs/plans/2026-09-04-e2e-acceptance-run.md`；本交接。

### E318-E333 统一提交收尾（owner 2026-09-04 拍板「先统一提交 E318–E333」）

- **动作**：`git add`（排除 `审计交付/`、乱码同名目录、`*.zip`、`docs/audit-t3` v25 审计新文档、`docs/plans/2026-08-30-v26-pre-ship.md`）→ `git commit`。
- **结果**：提交 `ffaa457`（v0.2b，69 文件 +5140/−95），含本批全部代码与文档；审计交付物按约定不入库，仍留在工作区。
- **验证**（提交前跑全）：`npm run build` 绿；`npm run test:all` 全绿（单测 + 集成 32/32）；`npm run doc-lint` 0 FAIL 0 WARN。
- **未做**：未 push（`push:hosts` 由 owner 决定）；需求文档附录 A 各 E 行「状态：完成（未提交…）」沿用历史惯例不翻写。

### E334 confirm 挂起带风险分级与「本次操作预估成本」（owner 2026-09-04 拍板口径后实现）

- **口径**：owner 拍板「预估成本 = 本次挂起操作批准后会发生的外部调用费用（复用 §COST 单价与调用量估算，展示上界金额）；本地确定性执行直接明示 ¥0」。
- **代码**：`src/escalation/confirm-gate.ts` 写类执行器清单升级为 profile（label+risk+costKind）——风险按副作用外发性与可逆性（calendar_skill=低；project_writer/content_writer/project_packager=中；office_daily/im_dispatch=高）；成本类别 content_writer/office_daily=content_generation（批准后经 LLM 生成内容）、其余=local；新增 executorRiskGrade()/estimateConfirmCostYuan()；buildConfirmHoldAnswer() 追加「风险等级：X ｜ 本次操作预估成本：…」行——聊天确认卡与裁决面板都渲染 question 文本，风险/成本零 UI 改动透出。`src/config/params.ts` PARAMS+PARAM_IDS 补 P-149（单次内容生成输入上界 4000）/P-150（输出上界 2000）。
- **验证**（零外部 LLM/API，¥0）：`npm run build` 绿；confirm-gate 定向 2/2（新增 E334 断言）+ pipeline 68/68（挂起文案契约无回归）；`npm run doc-lint` 0 FAIL 0 WARN（150 参数 / 77 key 引用）。全量 test:all/bench 未跑（成本纪律）。
- **文档**：需求 §5 注册表补 P-149/P-150 行、§14.5 衔接表行由「候选，未实现」转已实现并标 E334、附录 A E334 登记；计划 `docs/plans/2026-09-04-confirm-cost-display.md`（结果已回填）；`docs/code-directory.md` confirm-gate 行补 E334；本交接。改动未提交，并入下一批提交。

## 明日/后续待办

1. **（owner 复验，可选）**：主链路已通过；E325/E326/E327/E329/E330/E331/E332/E333 修复后复验六条——①「帮我安排一下我家里明天的亲子游行程安排」：日程标题「亲子游行程」（无「一下/我家里」）、确认文案「你让我“帮你安排一下你家里明天的亲子游行程安排”」、批准后回执「✅ 老板，已按你的批准执行。已为你创建日程：亲子游行程（…）」；②「帮我安排明天下午3点的周会，提前10分钟提醒」：标题「下午3点周会」（无「提前…提醒」残留），提醒仍按提前量登记；③ E330 修复后同句批准（聊天「执行」或裁决页）：应建日历事件（标题「下午3点周会」）、不再建一次性提醒、执行回执不再拼 git 状态噪音；④ E331：网关运行中从其它通道/操作写入多条通知后，右栏「通知」tab 出现未读数字角标，进通知页清零，通知超过 20 条可翻页；⑤ E332：关掉 gateway 提问 → 出现「⚠️ 本地预览」兜底（无假证据、不冒充真实回答），启动 gateway 后点「↻ 重试」→ 收到真实回复且不重复用户气泡；⑥ E333：兜底按钮直接显示 `↻ 重试「{原句}」`（如 `↻ 重试「明天天气如何」`），点击前即可确认重发内容。其余验收路径照旧。
2. **批次状态**：E318-E333 已统一提交 `ffaa457`（2026-09-04，见「今日完成」收尾节）；无需再提交。
3. **后续轮候选**：真实 CLI/桌面 e2e 验收（含 E334 挂起文案风险/成本冒烟、E328 目录监听、E331 通知角标/分页）；§4.1 三栏 UI 其余打磨（目录监听、通知角标/分页已收口，剩余按需）；文件面板临时文件过滤（`/api/files` 列表含 `~$`/`.tmp`，删除后残留至下次真实刷新——B1 复验已知项，owner 拍板本轮不修，按需后续做）；Azure 注册（Outlook OAuth2 真连验收）仍挂 owner 侧，本轮不做。
4. **已评估不引入（勿重复立项）**：外部项目 genoffice（办公自动化类）已评估，结论维持「先不引入、按现有办公自动化路线推进」，无需再展开。
