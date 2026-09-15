# 2026-09-13 交接

## E382：answer_postprocess Skill 运行时契约（未提交）

- 承接：[`docs/2026-09-12-progress-handoff.md`](./2026-09-12-progress-handoff.md) E381 的下一轮推荐。
- 计划：[`docs/plans/2026-09-13-answer-postprocess-runtime.md`](./plans/2026-09-13-answer-postprocess-runtime.md)。
- 改动：新增 `AnswerPostprocessRuntime` 与最小规则契约，规则按注册顺序执行，异常、空输出与未改动均隔离；共享 pipeline 在 Stage 6、L0 记忆与轨迹落盘前执行显式注入的规则，最终结果返回实际生效的 `postprocessSkillNames`。
- 验证：`npm run build` 绿；answer-postprocess + pipeline 定向测试 80/80；最终返回、会话记录与轨迹摘要使用同一后处理结果；`git diff --check` 无空白错误。
- 边界：本轮只接 Stage 6 搜索/合成主路径；不扫描候选、不安装、不自动启用规则。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，增加 answer_postprocess 规则存储与用户二次启用门禁；先只允许确定性可执行的 `conclusion_first`，其余候选继续保持不可安装。

## E383：conclusion_first 规则二次启用闭环（未提交）

- 计划：[`docs/plans/2026-09-13-answer-postprocess-rule-enable.md`](./plans/2026-09-13-answer-postprocess-rule-enable.md)。
- 改动：新增用户级 append-only `AnswerPostprocessRuleStore` 与持久化运行时；仅 accepted + `conclusion_first` 候选可由用户第二次确认启用，其他模式继续阻断。gateway 规则接口支持启用/停用，候选列表返回当前状态；Skill 设置页在草案预览后提供确认启用及停用入口。
- 验证：主项目与 UI build 绿；后处理/候选定向单测 9/9，gateway 本轮闭环 1/1；启用后真实回答带 `reply-conclusion-first` 标记与结论前缀，停用后立即恢复；`git diff --check` 无空白错误。
- 测试备注：首轮组合运行的全部 gateway 用例为 50/51，唯一失败是既有 E354 HTML 预览的瞬时 `fetch failed`；未跨文件诊断，测试名过滤复验本轮用例通过。
- 边界：不写市场 Skill 目录、不注册命令或浏览器能力；其余五类候选仍不可启用。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）。
- 下一轮推荐：继续 §9.3，把 `postprocessSkillNames` 接回反馈审计与生命周期统计；用户对被规则处理后的回复给 👎 时，可精确标记该回答规则需复审，但仍不自动停用。

## E384：answer_postprocess 反馈复审联动（未提交）

- 计划：[`docs/plans/2026-09-13-answer-postprocess-feedback-review.md`](./plans/2026-09-13-answer-postprocess-feedback-review.md)。
- 改动：UI 保存并回传每条回复实际生效的 `postprocessSkillNames`，`AnswerFeedbackEntry` 将其纳入 append-only 审计；规则账本记录使用次数，并按 userId + 规则名从每条回复最新反馈重算累计/连续 👎，连续达到 [P-79] 后标记 `needsReview`，状态仍保持 enabled；Skill 候选卡展示规则生命周期统计。
- 验证：主项目与 UI build 绿；反馈库 + 后处理规则定向测试 4/4，gateway 规则闭环 1/1；覆盖反馈审计、使用计数、[P-79] 复审标记和不自动停用。
- 边界：复审只提示用户，不自动停用或降权；旧规则账本缺失统计字段时兼容补零。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- 下一轮推荐：继续 §9.3，为 answer_postprocess 规则补“复审完成”确认入口；只清除 `needsReview` 与连续 👎，保留累计 👎、使用次数、启停历史和反馈审计。

## E385：answer_postprocess 复审完成入口（未提交）

- 计划：[`docs/plans/2026-09-13-answer-postprocess-review-restore.md`](./plans/2026-09-13-answer-postprocess-review-restore.md)。
- 改动：`AnswerPostprocessRuleStore.clearReview()` 以 append-only 新事件清除 `needsReview` 与连续 👎；gateway 规则接口新增用户级 `restore_review` 动作；Skill 候选卡仅在规则需复审时显示“复审完成”，经原生确认后执行。
- 验证：主项目与 UI build 绿；后处理规则测试 3/3，gateway 本轮闭环 1/1；恢复后累计 👎、使用次数、enabled 状态与历史事件均保留。
- 边界：复审恢复不删除反馈、不清累计统计、不切换启停状态，不提供批量操作。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- 下一轮推荐：继续 §9.3，为需复审的 answer_postprocess 规则提供最近负反馈证据（原因、补充说明、原问答），让用户看完证据再确认复审完成；读取仍按 userId 隔离。

## E386：answer_postprocess 复审负反馈证据（未提交）

- 计划：[`docs/plans/2026-09-13-answer-postprocess-review-evidence.md`](./plans/2026-09-13-answer-postprocess-review-evidence.md)。
- 改动：Skill 候选读取仅在规则需复审时返回当前用户最近一条仍为 👎 的原因、补充说明、原问题、原回答与反馈时间；UI 在“复审完成”前直接展示证据。
- 验证：主项目与 UI build 绿；gateway 本轮闭环 1/1；覆盖改票排除、最近证据选择、跨用户隔离及恢复后证据隐藏。
- 边界：查看证据不改变规则状态；复审完成仍只清 `needsReview` 与连续 👎，不自动停用、降权或删除反馈。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）；`git diff --check` 无空白错误。

## E387：每日回复反馈汇总（未提交）

- 计划：[`docs/plans/2026-09-13-daily-feedback-summary.md`](./plans/2026-09-13-daily-feedback-summary.md)。
- 改动：`FeedbackStore` 按本地自然日、userId 和每条回复最新票生成 👍/👎/修改建议计数与主要 👎 原因；通知 API 返回当前用户摘要，右栏通知页展示“今日反馈”。
- 验证：主项目与 UI build 绿；feedback-store 2/2，gateway 本轮闭环 1/1；覆盖跨日、跨用户、改票去重、主要原因与空态。
- 边界：摘要只读，不写通知事件、不自动调权或调参。零外部 LLM（¥0），未跑 E2E/bench，未提交。
- `npm run doc-lint` 的 C1–C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 示例超期阻断（2 FAIL / 0 WARN）；`git diff --check` 无空白错误。

## 暂停交接（E387 时点，已被 E388 更新）

- 当前推进至 E387，E382-E387 均已完成并保留在工作区，尚未提交。
- 最近验证：主项目与 UI build 通过；E387 feedback-store 2/2、gateway 闭环测试 1/1；未运行 E2E、全量 bench 或外部 LLM。
- 已知阻断：`doc-lint` C1-C6/C8 通过，仅需求文档第 19 行既有 provisional 示例超期导致 C7 2 FAIL / 0 WARN；本轮未处理该无关项。
- 下一轮首选 E388：当 Skill 候选生成或 answer_postprocess 规则进入需复审时，幂等写入用户可见通知，让反馈改进信号有持久回响；不自动执行决定。
- 后续推荐 E389：为“今日反馈”补按原因分组的只读明细入口，继续按 userId 与最新票隔离。
- 后续推荐 E390：把重复“答非所问”反馈转成路由校准提案，只生成待确认建议，不自动回写 PARAM 或路由表。
- 工作纪律：继续不自动停用、不自动降权、不删除反馈审计；用户未要求前不要提交。

## E388：MCP 当前健康度收口与 S3 状态校正（未提交）

- 计划：[`docs/plans/2026-09-13-mcp-health-closure.md`](./plans/2026-09-13-mcp-health-closure.md)。
- 改动：新增 MCP 健康检查模块与 `npm run mcp:health`，检查 initialize/tools/list、白名单默认工具存在性及只读调用；真实集成测试改为读取实际配置；Windows MCP 专属启动窗口由 10 秒调为 20 秒，全局 [P-57] 不变。
- 状态校正：新增 [`docs/reports/v1-acceptance-delta-2026-09-13.md`](./reports/v1-acceptance-delta-2026-09-13.md)，明确当前 3/3 只证明 Windows MCP 工具适配层健康，不代表 KiCad/Keil 等专业子 Agent 完成；[P-10] 仍未通过。
- 验证：`npm run build` 绿；MCP client/config/health 定向单测 12/12；`npm run mcp:health` 1/1 健康（19 个工具，tools/list 约 5.2 秒、只读调用约 1.8 秒）；真实 MCP 集成 3/3。
- 安全边界：仍只允许 `Process`，健康检查只调用 `mode=list`；不开放写操作、PowerShell 或 kill。零外部 LLM，未跑全量测试/E2E/bench，未提交。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E388 后）

- 下一轮首选：定义真正的专业子 Agent 运行契约，覆盖 task、plan、progress、artifact、evidence、failure、cancel、handoff；修复当前 dispatcher 丢弃 `task` 的结构性缺口，但暂不接真实 EDA 写操作。
- 后续推荐第 2 轮：实现 Keil 只读/低风险垂直链——工程发现、编译、诊断解析，不自动烧录。
- 后续推荐第 3 轮：补多文件事务、项目级备份、部分失败回滚与冲突仲裁，再允许专业 Agent 修改工程。
- 后续推荐第 4 轮：KiCad 先做只读检查，再逐步开放受控写入；随后接 LTspice。
- 原 E388“反馈通知”建议降为后续体验项，待专业子 Agent 主线形成首个闭环后再恢复。

## E389：专业子 Agent 运行契约（未提交）

- 计划：[`docs/plans/2026-09-13-subagent-runtime-contract.md`](./plans/2026-09-13-subagent-runtime-contract.md)。
- 改动：新增统一 task/plan/progress/artifact/evidence/failure/cancel/handoff 契约；dispatcher 不再丢弃 `task`，维护选择 Agent、白名单校验、工具执行三个计划阶段，并提供隔离异常的进度观察入口。
- 结果语义：成功返回 untrusted 文本产物与每次 MCP 工具调用证据；失败、白名单拒绝、超时、无 Agent 和取消返回结构化 failure 与人工接管建议；降级和重试进入进度事件。
- 验证：`npm run build` 绿；dispatcher + mcp-agent 定向测试 14/14；Windows MCP 真实集成 3/3，并校验任务、计划、产物、证据与 handoff。
- 边界：plan 是确定性的执行阶段，不是 LLM 自主规划；不把自然语言任务隐式注入未知 MCP 参数；已发出的 stdio 请求仍不能中途强杀。零外部 LLM，未跑全量测试/E2E/bench，未提交。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E389 后）

- 下一轮首选：实现 Keil 第一条低风险垂直链——发现 `.uvprojx` 工程、以显式只读/编译工具执行 build、解析 warning/error 并映射到 E389 artifact/evidence；不自动烧录。
- 后续推荐第 2 轮：为 Keil 增加用户取消与编译超时后的进程收口，仍不开放 flash。
- 后续推荐第 3 轮：补多文件事务、项目级备份、部分失败回滚与冲突仲裁。
- 后续推荐第 4 轮：KiCad 只读检查垂直链；事务门完成后再评估受控写入。
- 后续推荐第 5 轮：LTspice 仿真链与跨 Agent 产物交接，然后重跑 S3/[P-10] 验收。

## E390：Keil MCP 低风险垂直链（未提交）

- 计划：[`docs/plans/2026-09-13-keil-mcp-vertical.md`](./plans/2026-09-13-keil-mcp-vertical.md)。
- 改动：新增 Keil stdio MCP server 与 `DiscoverProjects` / `BuildProject`；发现只读扫描沙箱根，build 只接受现存 `.uvprojx`、固定 UV4 `-b`、按 [P-38] 超时并解析 warning/error，不暴露 flash。
- 契约联动：MCP `isError` 保留具体文本；编译失败也保留 artifact/evidence；mcp-agent 能从自然语言 `.uvprojx` 路径映射 build，无路径 Keil 请求先发现工程，build 不自动重试。
- 本机状态：确认 `D:\Keil_v5\UV4\UV4.exe` 存在并接入本地配置；`npm run mcp:health` 为 Windows + Keil 2/2，Keil 默认只读发现通过。
- 验证：`npm run build` 绿；Keil/client/dispatcher/mcp-agent 定向测试 25/25；Windows + Keil MCP 集成 6/6；`git diff --check` 通过。
- 诚实边界：白名单工作区内没有真实 `.uvprojx`，未编译 `D:\Keil_v5` 安装示例，故真实固件 build 尚未验收。零外部 LLM，未跑全量 E2E/bench，未提交。
- 文档检查：`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E390 后）

- 下一轮首选：Keil 取消与超时进程树收口；在用户把真实工程放入 `projects/` 或明确授权某个现有工程路径后，执行一次真实 build 验收，仍不烧录。
- 后续推荐第 2 轮：把 Keil 诊断转成可定位源码的 UI 产物，并增加目标配置选择，不自动改工程。
- 后续推荐第 3 轮：补多文件事务、项目级备份、部分失败回滚与冲突仲裁。
- 后续推荐第 4 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 5 轮：LTspice 仿真与跨 Agent 产物交接，再重跑 S3/[P-10]。

## E391：Keil 取消与超时进程树收口（未提交）

- 计划：[`docs/plans/2026-09-13-keil-cancel-process-tree.md`](./plans/2026-09-13-keil-cancel-process-tree.md)。
- 改动：dispatcher 将 `AbortSignal` 透传到 MCP `tools/call`；client 在用户取消或调用超时时发送 `notifications/cancelled`；Keil server 按 requestId 中止对应 build，并由 runner 终止 UV4 完整进程树。
- 平台行为：Windows 固定使用无 shell 的 `taskkill.exe /PID <pid> /T /F`，并直接 kill 父进程兜底；POSIX 终止独立进程组。[P-38] 超时与用户取消共用同一收口路径，分别返回 timedOut/cancelled。
- 验证：`npm run build` 绿；client/dispatcher/Keil/mcp-agent 定向单测 30/30；Windows + Keil MCP 集成 6/6；`npm run mcp:health` 2/2。
- 诚实边界：白名单工作区仍无 `.uvprojx`，未执行真实固件 build；未编译工作区外示例、未开放 flash。零外部 LLM，未跑全量 E2E/bench，未提交。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E391 后）

- 下一轮首选：把 Keil warning/error 转成可定位源码的 UI 产物，并从 `.uvprojx` 只读解析可选 target；仍不自动修改工程、不烧录。
- 条件分支：若用户把真实 `.uvprojx` 工程放入 `projects/`，优先追加一次真实 UV4 build 验收，记录退出码、日志和诊断，不烧录。
- 后续推荐第 2 轮：补多文件事务、项目级备份、部分失败回滚与冲突仲裁。
- 后续推荐第 3 轮：KiCad 只读 ERC/工程检查链；事务门完成后再评估受控写入。
- 后续推荐第 4 轮：LTspice 仿真与跨 Agent 产物交接。
- 后续推荐第 5 轮：重跑 S3/[P-10] 验收，并恢复反馈通知等体验项。

## E392：Keil target 与可定位诊断产物（未提交）

- 计划：[`docs/plans/2026-09-13-keil-target-diagnostics-artifact.md`](./plans/2026-09-13-keil-target-diagnostics-artifact.md)。
- 改动：新增只读 MCP `ListTargets`，从 `.uvprojx` 提取 target 清单；build warning/error 仅为工作区内现存源码补 `sourcePath`，并生成 `keil-targets` / `keil-diagnostics` 结构化 Skill 产物。
- 主链：显式 `.uvprojx` 工具请求现在稳定路由到 `mcp-agent`；Skill 产物经统一 pipeline/API 透传，UI 展示 target 与分级诊断卡，可点击安全源码路径进入现有只读预览。
- 验证：主项目与 UI build 绿；router-v2 + Keil + mcp-agent 101/101；pipeline 产物透传 1/1；Keil MCP stdio 集成 4/4；`mcp:health` Windows + Keil 2/2（Keil 3 个工具）。
- 诚实边界：白名单工作区仍无 `.uvprojx`，没有真实固件 build；不修改工程、不自动选 target、不烧录。零外部 LLM，未跑全量 E2E/bench，未提交。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E392 后）

- 下一轮首选：多文件事务第一刀——项目级快照、预检和原子提交边界；先覆盖纯文件工程，不接 EDA 写操作。
- 条件分支：若用户把真实 `.uvprojx` 放入 `projects/`，优先补真实 target 解析与一次 UV4 build 验收，仍不烧录。
- 后续推荐第 2 轮：多文件部分失败回滚与冲突仲裁，形成专业 Agent 写入门。
- 后续推荐第 3 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 4 轮：LTspice 仿真与跨 Agent 产物交接。
- 后续推荐第 5 轮：重跑 S3/[P-10] 验收，再恢复反馈通知等体验项。

## E393：项目多文件事务边界（未提交）

- 计划：[`docs/plans/2026-09-13-project-multifile-transaction-boundary.md`](./plans/2026-09-13-project-multifile-transaction-boundary.md)。
- 改动：新增纯文件工程两阶段事务接口；整批预检通过后才生成项目快照，提交前做 SHA-256 一致性检查，全部同目录临时文件暂存并回读成功后才触碰目标文件。
- 结果语义：预检失败不创建事务；暂存失败为 `stage_failed`、目标零写入；外部修改为 `conflict`、整批拒绝；逐文件 rename 中断为 `partial_failed`，返回已提交/待提交清单并保留快照。
- 验证：主项目 build 绿；项目事务、既有 project-writer 与 operation-log 定向测试 16/16，其中事务新用例 5/5。
- 边界：多文件系统不具备通用跨文件原子 rename，本轮没有虚报强原子性；尚未实现 partial 自动回滚/仲裁，未接自然语言入口或 EDA 写操作。零外部 LLM，未跑 E2E/bench，未提交。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E393 后）

- 下一轮首选：多文件事务第二刀——利用 E393 快照自动恢复 `partial_failed`，并把事务 completed/rolled_back/failed 状态接入 append-only operation log。
- 后续推荐第 2 轮：增加冲突清单与用户仲裁入口（保留外部版本 / 使用事务版本 / 取消整批），不自动覆盖。
- 后续推荐第 3 轮：project-writer 接入结构化多文件变更清单和确认卡；仍限纯文件工程。
- 后续推荐第 4 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 5 轮：LTspice 仿真与跨 Agent 产物交接，随后重跑 S3/[P-10]。

## E394：项目事务自动回滚与审计（未提交）

- 计划：[`docs/plans/2026-09-13-project-transaction-auto-rollback.md`](./plans/2026-09-13-project-transaction-auto-rollback.md)。
- 改动：E393 逐文件提交中断后，逆序恢复所有可能被触碰的路径；覆盖文件从项目快照恢复并校验摘要，新建文件删除。成功返回 `rolled_back`，恢复失败返回 `rollback_failed` 与未恢复路径，快照始终保留。
- 审计：项目事务按 transactionId 在现有 append-only operation log 形成 prepared→completed、prepared→rolled_back 或 prepared→failed；既有单文件 write/rollback 查询语义不变。
- 验证：主项目 build 绿；项目事务、operation-log、既有 project-writer 定向测试 18/18，其中事务 7/7。
- 边界：提交前外部修改仍只拒绝、不仲裁；未接自然语言多文件入口或 EDA 写操作。零外部 LLM，未跑 E2E/bench，未提交。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E394 后）

- 下一轮首选：冲突清单与用户仲裁数据契约——逐文件返回快照摘要/当前摘要/目标摘要及三个明确选择，但不自动覆盖。
- 后续推荐第 2 轮：为冲突仲裁增加用户确认入口与 append-only 决策证据。
- 后续推荐第 3 轮：project-writer 接入结构化多文件变更清单和确认卡；仍限纯文件工程。
- 后续推荐第 4 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 5 轮：LTspice 仿真与跨 Agent 产物交接，随后重跑 S3/[P-10]。

## E395：项目事务冲突清单与仲裁契约（未提交）

- 计划：[`docs/plans/2026-09-13-project-transaction-conflict-contract.md`](./plans/2026-09-13-project-transaction-conflict-contract.md)。
- 改动：提交前扫描整批目标，完整返回外部修改、外部删除和外部创建冲突；每条只含路径、存在状态及 snapshot/current/proposed SHA-256，不携带正文。
- 仲裁契约：固定提供“保留外部版本 / 使用事务版本 / 取消整批”，默认取消整批并标记必须确认；本轮只返回数据，不执行选择、不自动覆盖。
- 验证：主项目 build 绿；项目事务、operation-log、既有 project-writer 定向测试 18/18，其中事务 7/7；多冲突用例确认目标零写入且日志不含目标正文。
- 边界：尚未接 gateway/UI 确认入口与 append-only 决策证据，也未实现确认后的重新校验/执行；未接自然语言多文件入口或 EDA 写操作。零外部 LLM，未跑 E2E/bench，未提交。

## 最新暂停交接（E395 后）

- 下一轮首选：为冲突仲裁增加用户确认入口与 append-only 决策证据；默认取消，任何覆盖选择都必须显式确认，本轮仍可先不执行覆盖。
- 后续推荐第 2 轮：实现确认后的重新校验与事务级仲裁执行，外部状态再次变化即重新阻断。
- 后续推荐第 3 轮：project-writer 接入结构化多文件变更清单和确认卡；仍限纯文件工程。
- 后续推荐第 4 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 5 轮：LTspice 仿真与跨 Agent 产物交接，随后重跑 S3/[P-10]。

## E396：项目冲突确认入口与决策证据（未提交）

- 计划：[`docs/plans/2026-09-13-project-conflict-confirmation.md`](./plans/2026-09-13-project-conflict-confirmation.md)。
- 改动：E395 冲突契约可进入现有裁决队列；decision log 新增结构化 choices/defaultChoice/selectedChoice/context，最终选择以 refId 追加，原 pending 不改写。
- 入口：gateway 裁决端点支持 choice，并拒绝以普通 approve/reject 绕过三选一；UI 裁决页展示三个具名按钮并标出默认“取消整批”。
- 安全边界：保留外部版本、使用事务版本、取消整批在本轮都只记录证据，不触发事务提交或覆盖；回执明确提示未写文件。
- 验证：主项目/UI build 绿；核心定向测试 24/24；gateway 裁决测试 3/3，覆盖既有 resume、普通裁决和 E396 choice。零外部 LLM，未跑 E2E/bench，未提交。

## 最新暂停交接（E396 后）

- 下一轮首选：实现选择后的状态重新校验与事务级仲裁执行；任何摘要或存在状态变化都重新生成冲突并要求再次确认。
- 后续推荐第 2 轮：project-writer 接入结构化多文件变更清单和确认卡；仍限纯文件工程。
- 后续推荐第 3 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 4 轮：LTspice 仿真与跨 Agent 产物交接。
- 后续推荐第 5 轮：补真实 Keil 工程 build 证据（需用户提供白名单内 `.uvprojx`），随后重跑 S3/[P-10]。

## E397：项目冲突重新校验与事务级执行（未提交）

- 计划：[`docs/plans/2026-09-13-project-conflict-resolution.md`](./plans/2026-09-13-project-conflict-resolution.md)。
- 证据门：执行器只接受 decision log 已落盘的裁决事件，并核对 pending、selectedChoice/refId、事务身份、完整冲突契约与选择结果。
- 执行语义：`cancel_all` 整批保留；`keep_external` 保留冲突文件并提交其余文件；`use_transaction` 提交整批。确认后任何路径变化都返回新确认契约并零写入。
- 回滚语义：写入前基于当前确认状态重新 prepare 恢复快照，并校验新快照基线；提交中断恢复到确认时外部版本，不恢复过期旧版本。
- 验证：主项目 build 绿；项目冲突解析、确认、事务、decision/operation log 与既有 project-writer 定向测试 30/30。零外部 LLM，未跑 E2E/bench，未提交。
- 边界：gateway 不持久化事务正文，本轮没有从 decision log 恢复或执行文件内容；需下一轮由 project-writer 多文件入口在同一进程内编排。

## 最新暂停交接（E397 后）

- 下一轮首选：project-writer 接入结构化多文件变更清单、项目事务 prepare 与确认卡；先完成无冲突 happy path 和冲突 pending，不扩大到 EDA。
- 后续推荐第 2 轮：为 project-writer 增加进程内待处理事务仓库与裁决恢复执行，复用 E396/E397，不把文件正文写入 decision log。
- 后续推荐第 3 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 4 轮：LTspice 仿真与跨 Agent 产物交接。
- 后续推荐第 5 轮：补真实 Keil 工程 build 证据（需用户提供白名单内 `.uvprojx`），随后重跑 S3/[P-10]。

## E398：project-writer 多文件事务预览与确认卡（未提交）

- 计划：[`docs/plans/2026-09-13-project-writer-multifile-confirmation.md`](./plans/2026-09-13-project-writer-multifile-confirmation.md)。
- 输入：project-writer 新增 `params.fileChanges` 与 fenced JSON `{files:[...]}` 两种结构化多文件格式，至少两项；非法项、越界或重复路径由整批预检拒绝。
- prepare：确认前复用 E393 创建项目快照和 transactionId，目标文件零写入；确认卡只含创建/修改、路径、字节数和摘要，不含正文。
- 确认：pipeline 对结构化多文件输入强制进入专用门，pending 固定为 `confirm_changes` / `cancel_all`、默认取消、不带自动执行 resume；UI 展示多文件确认卡。
- 验证：主项目/UI build 绿；project-writer 与 E393-E397 核心测试 28/28；E398 + 既有 E324 pipeline 确认测试 5/5。零外部 LLM，未跑 E2E/bench，未提交。
- 边界：确认后仍只记录证据；尚无进程内事务仓库，prepared 快照的取消清理/终态审计和批准后 commit 留待下一轮。

## 最新暂停交接（E398 后）

- 下一轮首选：新增 project-writer 进程内待处理事务仓库；按 decision refId 绑定 transaction，`cancel_all` 清理并记终态，`confirm_changes` 重新校验后 commit，冲突转入 E395/E396。
- 后续推荐第 2 轮：把 E397 冲突裁决恢复接到同一事务仓库，并补进程重启后诚实失效提示，不把正文写入日志。
- 后续推荐第 3 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 4 轮：LTspice 仿真与跨 Agent 产物交接。
- 后续推荐第 5 轮：补真实 Keil 工程 build 证据（需用户提供白名单内 `.uvprojx`），随后重跑 S3/[P-10]。

## E399：project-writer 待处理事务仓库与首次确认执行（未提交）

- 计划：[`docs/plans/2026-09-13-project-writer-pending-transaction-store.md`](./plans/2026-09-13-project-writer-pending-transaction-store.md)。
- 绑定：新增进程内 `PendingProjectTransactionStore`，按 pending decision id 保存 E398 prepared transaction；文件正文不进入 decision log，pipeline 登记失败时清理快照。
- 首次裁决：`cancel_all` 清理精确快照并追加 `cancelled` 终态；`confirm_changes` 复用 E393/E394 安全提交与自动回滚。提交前冲突则目标零写入，转成 E395/E396 三选一 pending 并改绑同一事务。
- 失效语义：进程重启或仓库缺失时明确返回 `expired`，不根据日志重建正文；gateway 返回结构化事务结果，UI 区分提交、取消、冲突待裁决与失效。
- 验证：主项目/UI build 绿；核心事务、冲突、裁决与 project-writer 定向测试 32/32；pipeline E398/E324 5/5；gateway E399 2/2，含完整 `/api/ask → pending → choice → commit` 链。零外部 LLM，未跑 E2E/bench，未提交。
- 边界：E397 冲突选择执行尚未接入 gateway；当前冲突 pending 仍只记录 choice，不会自动覆盖文件。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E399 后）

- 原下一轮 E400 冲突执行因 owner 插入 MCP 章节补强而顺延为 E401；E400 改为 MCP 领域工作流规格与 VS Code 占位。
- 后续推荐第 2 轮：为遗留 prepared 快照增加有界清理与审计策略，避免异常退出后长期残留，同时保持默认不执行。
- 后续推荐第 3 轮：KiCad 只读 ERC/工程检查链，不开放 EDA 写操作。
- 后续推荐第 4 轮：LTspice 仿真与跨 Agent 产物交接。
- 后续推荐第 5 轮：补真实 Keil 工程 build 证据（需用户提供白名单内 `.uvprojx`），随后重跑 S3/[P-10]。

## E400：MCP 领域工作流规格补强与 VS Code 子 Agent 占位（未提交）

- 计划：[`docs/plans/2026-09-13-mcp-domain-workflow-vscode.md`](./plans/2026-09-13-mcp-domain-workflow-vscode.md)。
- 需求：§4.1.2 新增 Skill 方法层、子 Agent 执行层、MCP 工具桥接层，明确软件名称不等于 Agent 已完成；统一领域入口先只读盘点，再按项目动态组合节点。
- 契约：节点必须声明输入/输出、负责 Agent、工具、文件范围、风险、验收和回退；跨 Agent 以项目盘点、接口基线、变更集、构建诊断、调试测试和交付清单等结构化产物交接。
- 双门：质量门负责机器可判定结果，人工门负责下载、写入、冲突、烧录和硬件动作；MCP 返回继续属于 `untrusted_data`。
- VS Code：加入 §3.3 常用嵌入式软件、工程栏角色面板与 `src/mcp/registry.ts` 编码类目录；当前默认未接入、命令为空，不安装、不启动、不控制真实 VS Code。
- 借鉴边界：三张外部展示图仅借工作流表达，已登记 `docs/borrowed-designs.md`；不复制图片、固定 Skill 清单或实现宣称。
- 验证：主项目 build 绿；MCP registry 2/2、gateway 子 Agent 目录 1/1；`git diff --check` 通过。零外部 LLM，未跑 E2E/bench，未提交。
- 文档检查：`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。

## 最新暂停交接（E400 后）

- 下一轮首选：E401——把 E397 冲突三选一恢复执行接入同一事务仓库/gateway；选择后再次校验，状态变化则重新生成 pending，继续禁止从日志恢复正文。
- 后续推荐第 2 轮：定义领域工作流节点/结构化 artifact 的最小 TypeScript 契约，不立即实现自主规划器。
- 后续推荐第 3 轮：VS Code 只读垂直链设计，优先工作区盘点、配置解析和诊断，不开放编辑器远控或写入。
- 后续推荐第 4 轮：KiCad 只读 ERC/工程检查链。
- 后续推荐第 5 轮：LTspice 仿真与跨 Agent 产物交接；有真实 `.uvprojx` 后补 Keil build 并重跑 S3/[P-10]。

## E401：MCP 项目画像证据缓存与跨节点循环熔断（未提交）

- 计划：[`docs/plans/2026-09-13-mcp-project-profile-loop-fuse.md`](./plans/2026-09-13-mcp-project-profile-loop-fuse.md)。
- 项目画像：新增 JSON Schema 与 TypeScript 校验契约；运行时约定写入 `data/project-profiles/<projectId>.json`，未知项显式 `null`，build/flash 只允许结构化 MCP 工具引用，裸命令字段直接拒绝。
- 证据门：字段来源按用户确认、工程文件、工具探测、历史缓存、模型候选降序；模型候选不能授权 build/flash，缓存不会自动提高原始证据等级。
- 循环熔断：新增 provisional [P-154]（默认两轮）与纯守卫，独立于 [P-44]/[P-45] 单点重试；达到上限返回要求携带串口日志与最近 diff 的人工接管，每次烧录仍须单独确认。
- §13：补录现有 `src/mcp/` 生产文件、项目画像 schema 与 MCP 健康检查入口；同步代码目录、目录结构和 AGENTS 地图。
- 验证：`npm run build` 绿；项目画像/循环守卫/MCP registry 目标测试 8/8；JSON Schema 可解析；未跑全量测试、E2E 或 bench。
- 文档检查：`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）；本轮新增的 §5 行数超限已压回预算内。
- 边界：本轮落地契约、schema 与守卫，不含画像持久化/自动探测，也尚未把守卫接入未实现的动态工作流执行器，不把它描述为多平台 MCP 已完成。

## 最新暂停交接（E401 后）

- 下一轮首选 E402：恢复原定事务主线，把 E397 冲突三选一执行接入同一进程内事务仓库/gateway；选择后再次校验，变化则生成新 pending，继续禁止从日志恢复正文。
- 后续推荐第 2 轮：实现项目画像 store 与只读盘点写入，先覆盖 Keil 工程文件/target 探测，不开放 flash。
- 后续推荐第 3 轮：定义领域工作流节点/结构化 artifact 的最小执行契约，并把 [P-154] 守卫接入循环入口。
- 后续推荐第 4 轮：VS Code 只读垂直链，优先工作区、配置与诊断盘点，不开放编辑器远控或写入。
- 后续推荐第 5 轮：接入第二平台（优先 STM32-GCC 或 ESP32）验证画像可消除工具链猜测，再推进 KiCad/LTspice 只读链。
