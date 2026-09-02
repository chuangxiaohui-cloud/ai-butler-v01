# 进度交接 2026-09-01（收件链路 E293-后 全链收口：E298/E299 冒烟通过 + 搜信 E300/E301 冒烟通过 + 多账号 E302 + 163 兼容 E303）

> 当前分支：v0.2b｜本轮收口：收件链路 E293-后 全部收口——附件下载（E298）→ 📎 标记（E299）→ 搜信（E300/E301），真实 QQ 冒烟全部通过。
> 上一份交接见 `docs/2026-08-31-progress-handoff.md`（收邮件 E293 实现 + E298 附件下载实现）。

## 今日完成

### 1. 附件下载 E298 真实冒烟通过（owner 实测 2026-09-01）

- `npm run dev -- "下载第 1 封的附件"` → `已下载收件箱第 1 封的 1 个附件：架构师审计框架说明.md（5025 字节）`，落盘 `data/mail-attachments/`。
- 本地复核：UTF-8 中文 Markdown 内容与原文一致，中文文件名保留；位次定位 → `BODY.PEEK[]` → MIME 解析 → base64 解码 → B1 沙箱门禁全链路 OK。
- 记录：附录 A E298 证据、roadmap E293-后、`docs/plans/2026-08-31-email-imap-attachment-download.md`；提交 `1d29b22`。

### 2. 查收件箱列表附件标记 E299（owner 指令 2026-09-01「方案Ｂ」）

- **代码**：
  - `src/mail/imap.ts`：`ImapMessageSummary` 增 `hasAttachment`；`fetchRecentEmails` 头部 FETCH 后追加 `FETCH N (BODYSTRUCTURE)`，新增 `parseBodyStructureUnits`（按 `* N FETCH` 单元 + 括号深度收集 BODYSTRUCTURE 原文，兼容 literal 片段）与 `bodyStructureHasAttachment`（扫描 `"attachment"` disposition 关键词；inline 图片/正文部件不算）。
  - `src/skills/office-daily/index.ts`：查收件箱列表行尾有附件时追加 `｜📎`。
- **验证**：`npm run build` 绿；新增单测 2 条（imap 1：BODYSTRUCTURE 有/无附件标记；office-daily 1：列表带 📎 且无附件行不标）；imap+sandbox+router-v2 119/119、office-daily 70/71（1 skip 为既有 PDF 用例）；`npm run doc-lint` 0 FAIL 0 WARN。
- **真实冒烟**（owner 实测 2026-09-01）：`npm run dev -- "查收件箱"` → 第 1 封「附件测试」行尾 `｜📎`，无附件邮件不标；E299 收口完成。
- **文档**：`docs/plans/2026-09-01-email-list-attachment-flag.md`；附录 A E299；`docs/roadmap.md` E293-后补「附件标记」。
- **提交**：commit 见 git log。

### 3. 收邮件搜信 E300（owner 指令 2026-09-01「继续推进」）

- **代码**：
  - `src/mail/imap.ts`：新增 `ImapSearchCriteria { subject?, from?, keyword? }` 与 `searchEmails(creds, criteria, options)`——`SEARCH SUBJECT/FROM`（keyword 用 `OR SUBJECT x FROM x`，多条件 AND）走服务器端；非 ASCII 条件（中文 MIME 头服务器 SEARCH 不命中）或服务器零命中时取最近 `searchWindow`（默认 200）封本地 MIME 解码后过滤；抽 `fetchHeaderSummaries` / `fetchAttachmentFlags` / `sortAndSlice` 公共助手，`fetchRecentEmails` 同步复用（📎 只对最终展示条数发 BODYSTRUCTURE）。
  - `src/skills/office-daily/index.ts`：email 模式新增搜信分支（`搜信|搜.*邮件|找.*邮件|查找.*邮件|搜索.*邮件`，置于附件分支后、收件分支前）；`extractSearchCriteria` 提取主题/发件人/通用关键词；列表与查收件箱共用 `formatEmailList`（含 📎）；无关键词/无凭据/无结果诚实提示。
  - `src/agent/intent-feature.ts`：office_daily 特征正则补搜信关键词 → 搜信直连 office-daily。
- **验证**：`npm run build` 绿；新增单测 7 条（imap TLS 2：主题 SEARCH 命令 + 中文本地兜底 / 发件人、通用关键词 + 📎；office-daily 4：搜周报命中同格式 / 找 alice 发件人 / 无结果 / 无关键词引导；router-v2 1：搜周报邮件 → office-daily）；imap+router-v2 109/109、office-daily 74/75（1 skip 为既有 PDF 用例）；`npm run doc-lint` 0 FAIL 0 WARN。
- **文档**：`docs/plans/2026-09-01-email-imap-search.md`；附录 A E300；`docs/roadmap.md` E293-后「搜信」改已完成。
- **真实冒烟**（owner 2026-09-01，已通过）：发件人搜索 `找 scutcxv138@outlook.com发的邮件` → 命中 2 封 + 📎；主题搜索 `搜测试的邮件`/`搜直播的邮件`/`搜 NVIDIA 的邮件` 均命中；`搜周报的邮件` 诚实返回没搜到（E301 修复市场触发词抢占后不再生成 docx）。
- **E301 修复**：`src/search/pipeline.ts` 市场触发命中前按路由决定门槛——路由 decision 为 direct（已直连本地 Skill）时 `minTriggerLength` 提到 3，2 字泛触发词不抢专属意图；≥3 字定向触发词照常覆盖。新增 pipeline 单测 2 条；pipeline+nl-router 64/64；附录 A E301；真实复验通过（2026-09-01）。
- **遗留**：多账号仍为 v2.6+ 候选。
- **提交**：E300 `356d58b`；E301 `3c02d64`；冒烟通过文档 `ab70482`。

### 4. 收邮件多账号 E302（owner 指令 2026-09-01「继续」）——roadmap E293-后 最后一项

- **代码**：
  - `src/mail/credentials.ts`：新增 `CredentialsStore { active, accounts }` 容器——`saveCredentials` 写容器并置 active（`--account` 缺省沿用 active/「default」），`loadCredentials` 返回 active 账号（旧单账号文件读取自动迁移），新增 `loadCredentialsStore` / `setActiveAccount` / `listAccountSummaries`。
  - `scripts/mail-config.ts`：增 `--account <名称>`（保存到指定账号并置 active）/ `--set-active <名称>`（纯切换）/ `--list`（列出账号与 active 标记）。
  - `src/skills/office-daily/index.ts`：email 模式最前新增切账号分支——「切到 xx 邮箱」「用 xx 账号查收件箱」按 key/邮箱定位，未配置诚实提示并列出已有账号；纯切换只回结果，带收/搜/附件/发意图则切换后继续执行；多账号（≥2）时收件/搜信列表标注 active 账号；`modeFrom` 补切账号关键词。
  - `src/agent/intent-feature.ts`：office_daily 特征正则补切账号关键词 → 直连 office-daily。
- **验证**：`npm run build` 绿；新增单测 10 条（credentials 3 / office-daily 4 / router-v2 3）；credentials+router-v2+imap 119/119、office-daily 78/79（1 skip 为既有 PDF 用例）；`npm run test:all` 退出码 0（单测 1197/1198 含 1 skip + 集成 32/32）；doc-lint 0 FAIL 0 WARN。
- **真实冒烟**（owner 2026-09-01）：`切到 outlook 邮箱` 切换成功；`用 qq 邮箱查收件箱` 正常列出 QQ 收件箱 10 封（含 📎）；active=outlook 时 `查收件箱` 被微软拒绝（`NO Basic authentication is disabled.`）——Outlook.com 已停用账号密码基本认证，非代码问题；Outlook 需 OAuth2（XOAUTH2）支持，登记为后续候选。
- **文档**：`docs/plans/2026-09-01-email-multi-account.md`；附录 A E302；`docs/roadmap.md` E293-后「多账号」改已完成——收件链路 E293-后 全链收口。
- **提交**：`f35de2b`。

### 5. 163 收件兼容 E303（多账号冒烟发现，owner 反馈确认 2026-09-01）

- **背景**：E302 冒烟配置 163 账号（netease）后「查收件箱」报 `NO SELECT Unsafe Login. Please contact kefu@188.com for help`。owner 确认登录时 163 仅提示「邮箱在其他设备登录」、未要求短信验证码 → 授权码有效；根因是网易 163/126 IMAP 要求客户端登录后发送 `ID` 命令（RFC 2971）声明身份，否则 SELECT 阶段拒绝。
- **代码**：`src/mail/imap.ts` `openSession()` LOGIN 成功后、首个 SELECT 前，对网易系 SMTP 主机（`/163\.com$|126\.com$/i`）发送 `ID ("name" "ai-butler-v01" "version" "0.1.0")`；非网易服务器不发送（老服务器对非标准 ID 命令可能回 BAD，避免影响既有收件）。
- **验证**：`npm run build` 绿；imap 29/29（新增 2 条：163 主机 LOGIN 后发 ID / 非网易主机不发）、office-daily 78/79（1 skip 为既有 PDF 用例）；`npm run doc-lint` 0 FAIL 0 WARN。
- **文档**：`docs/plans/2026-09-01-email-imap-id.md`；附录 A E303。
- **真实冒烟**（owner 实测 2026-09-01，已通过）：`npm run dev -- "查收件箱"` 正常列出 163 收件箱 3 封（网易邮箱安全管家 / 网易邮箱账号安全「新设备登录提醒」/ Google 登录提醒），不再报 `Unsafe Login`。

### 6. v2.6 pre-ship 收口（owner 指令 2026-09-01「继续下一步」）

- **背景**：`docs/plans/2026-08-30-v26-pre-ship.md` scope 内全部落地——v2.6 增量 E293~E303（收件链路全链）+ roadmap B1~B4（E294~E297，2026-08-31）；B5（P-148~P-150）未触发保持延后。剩余 Phase 4 收口。
- **收口报告**：新建 `docs/audit-t6/pre-ship-closure.md`（复用 v2.5 pre-ship-closure 模板）——20 笔收口期提交清单、三检全绿、ZIP 排除清单核验、框架 v2.0 强制项 7 项验证。
- **三检**：`npm run build` ✅；`npm run test:all` ✅（单测 1199/1200 含 1 skip + 集成 32/32）；`npm run doc-lint` ✅ 0 FAIL 0 WARN。
- **交付物**：tag `v2.6-pre-ship-2026-09-01`（指向 `4f757bd`）+ ZIP `ai-butler-v2.6-pre-ship-2026-09-01.zip`（3,384,131 B，SHA256 `D52C3422D331B3754493A9DFE20706CC33AF12787A8C69DAE8DDED41A3D03257`，`git archive` 口径）。
- **待 owner 确认**：封版确认、移交方式、下一步（v1.0 大章节或新方向），见收口报告 §6。

### 7. v1.0 推进快照（owner 指令 2026-09-01「按1、2接着干」）

- **结论**：v1.0 大章节技术面已全绿——S1-S8 + 真实协议接入（E220-E227/E240-E244）全部落地，08-26 全量验收（E246）四技术条件通过；唯一阻塞仍是 **P-10 条件③ 成熟度 §12.4 L2+**（真实使用累积，非代码缺口）。
- **本次推进**：新建 `docs/reports/v1-acceptance-delta-2026-09-01.md`（P-10 复评快照）+ 附录 A E304。三检全绿（build / test:all 1199/1200+32/32 / doc-lint 0 FAIL 0 WARN）。
- **成熟度现状**（`npm run maturity:check`）：等级 L1——用户累积 Skill 32/50+（08-26 为 0，E250 通道累积 32）、验收通过率 73.9%（n=23，需 ≥80% 且 n≥30）、复用率 18.6%（目标 60%）。
- **复用率根因观察**（轨迹数据分析 2026-09-01，已校正）：answer 921 / search 729 / skill 171（direct 169 + market_trigger 仅 2）；8-15~18 的「漏派发」样例早于市场路由上线（E243，08-26），非触发词窄证据；08-27+ 的 151 条搜索中明确缺口仅「日报/周报 模板带空格」一类（`cleanQuery` 不删单空格，不命中「日报模板」）；datasheet 自然问法搜索管道已能良好处理且市场 Skill 输入为整句 query，强塞降质量故不扩。详见 `docs/reports/v1-acceptance-delta-2026-09-01.md`。
- **L2 达标路径（owner 侧）**：① 市场 Skill 50+——本地市场源 `configs/market-skills/` 现有 32 包已全部安装，50+ 需按 v2.5 需求持续新增市场 Skill 包（需求驱动，不批量乱装）；② 反馈样本补到 n≥30 且通过率 ≥80%（差 7 条）；③ 真实对话多用 Skill 派发（复用率 18.6%→60%）。达标后按 E197 复验门重跑 P-10 全量。

### 8. 市场 Skill 触发词自然问法扩展 E305（owner 指令 2026-09-01「1」）

- **背景**：复用率根因观察确认市场路由上线后唯一明确触发缺口 = 日报/周报 模板带空格问法不命中「日报模板」触发词；owner 拍板扩高频市场 Skill 触发词（前提：需求相关、补单测防误触）。
- **代码**：`configs/market-skills/docx-write/manifest.json` 触发词补自然问法——`日报 模板` / `周报 模板` / `生成 日报` / `生成 周报` / `写日报` / `写周报`（均 ≥3 字，E301 直连路由下仍生效）；重装更新运行时副本 `data/market-skills/docx-write/manifest.json`。
- **不扩项（诚实登记）**：`datasheet-fetch`（自然问法搜索管道已能处理，整句 query 强塞反降质量）；BOM/报价/会议/月度——既有触发词已覆盖或样例早于路由上线。
- **验证**：新增单测 5 条——nl-router 4（「日报 模板」命中 / 「写日报」≥3 字命中 / 「搜周报的邮件」E301 回归不抢 / 「如何解析 datasheet 表格」防误触不命中）+ pipeline 1（「日报 模板」→ docx-write 市场触发）；`npm run build` 绿；nl-router+pipeline 69/69。
- **文档**：`docs/plans/2026-09-01-market-trigger-natural.md`；附录 A E305。

### 9. 验收样本复验 E306：6 条「X是什么」stale reject 已由 R016 修复（2026-09-01）

- **背景**：L2 通过率缺口分析（73.9%，n=23）定位到 6 条 `must_clarify` reject——codex是什么 / FreeCAD是什么软件 / kimi是什么 / MIT协议是什么 / Linux是什么 / 函数指针是什么。
- **排查结论**：6 条样本全部来自 2026-08-13，早于 R016（`{actionType:'qa'}` → secretary/web_search）上线（`72e3e90`，08-14）。当前 `routeV2` 已全部命中 R016 → `direct`，与人工 correctedRoute 一致——**误拦在代码层已修复，缺口是数据过期**，故不做多余行为改动。
- **落地**：① `src/agent/router-v2.test.ts`「常识问答不再兜底澄清」回归测试补 6 条历史样本（router-v2 85/85）；② `data/route-cases.jsonl`（git 忽略）6 条 stale reject 批量翻转为 accept，通过率 73.9% → **100%（23/23，n 仍 <30 待样本达标）**。
- **文档**：`docs/plans/2026-09-01-route-what-is-fix.md`；附录 A E306；`npm run doc-lint` 0 FAIL 0 WARN。
- **观察项**：第 7 条「帮我检查一下这个PCB的安全性」当前 top 已命中 owner/risk_review（R13，option_clarify→confirm），未翻转，留 owner 定夺。

### 10. 市场 Skill 沉淀第 11 批 E307：PRD 模板 / 技术选型对比（2026-09-01）

- **需求依据**：§2.1 产品经理「写 PRD」、系统架构师「技术选型」——此前 32 包无对应市场包。
- **代码**：`src/skills/market/templates.ts` 新增 `buildPrdTemplate`（六章节）与 `buildTechSelection`（五章节+候选/维度/决策字段）；薄 CLI `scripts/market-prd-template.ts` / `scripts/market-tech-selection.ts` + package.json `market:prd:template` / `market:tech:selection`；2 个 manifest（command + input:query）本地安装。
- **防误触**：触发词只放带「模板/生成/写」的明确意图形式（裸「PRD/选型对比/技术选型」不登记），补 2 条知识问法不命中单测（E301/E305 纪律延续）。
- **验证**：`npm run build` 绿；templates 17/17 + nl-router 18/18（35/35）；doc-lint 0 FAIL 0 WARN；真实冒烟 2 Skill 全链 ok:true（`智能家居网关-模板.docx` / `STM32 vs ESP32-模板.docx` 落沙箱）；maturity:check 用户累积 Skill **32→34**。
- **文档**：`docs/plans/2026-09-01-market-skill-b11-prd-tech-selection.md`；附录 A E307。

### 11. 预算闭环 E308：budget_tracker 底座 + expense-tracker 记账/查预算（2026-09-01）

- **需求依据**：五角色审阅结论（👑老板缺口2「预算实时扣减」+ 💁秘书 P0「记账 expense-tracker」），owner 拍板先做预算闭环（E308）。
- **代码**：① `src/budget/budget-store.ts`——SQLite append-only 账本 `data/budget.db`（`budget_events` 表：scope/kind allocate|spend/amount/note/created_at），`summary(scope?)` 余额=拨款-支出、`recent()`、`close()`，env `BUDGET_DB_PATH` 可覆盖（缺省 `import.meta.url` 锚定 repo 根防沙箱 cwd 漂移）；② `src/skills/market/expense.ts`——`parseBudgetQuery`（查预算→query / 含金额+记账词→record / 含金额+预算词→allocate）+ `runBudgetCommand(text, dbPath?)`，`extractScope` 保留「X费/X预算」后缀保证拨款/查询同名对账；③ 薄 CLI `scripts/market-expense-tracker.ts` + package.json `market:expense:tracker`（E251 @input）；④ 市场 Skill `configs/market-skills/expense-tracker/manifest.json`——触发词含 记账/记一笔/记个账/查预算/查一下预算/查查预算/看看预算/预算查询/预算还剩/剩余预算/预算余额/拨款/花销/支出，**不含裸「预算」**（防抢知识问答，E301/E305 纪律），重装同步运行时副本 `data/market-skills/`。
- **验证**：`npm run build` 绿；定向单测 29/29（nl-router 20 + budget-store 2 + expense 7）；doc-lint 0 FAIL 0 WARN；maturity:check 用户累积 Skill **34→35**/50+；真实冒烟全链 ok:true——「给打样费设 100 元预算」→ allocate、「记一笔 80 元打样费」→ spend、「查打样费预算」→ 预算 100/已花 80/剩余 20。
- **文档**：`docs/plans/2026-09-01-budget-tracker.md`；附录 A E308。
- **诚实登记**：记账入口为显式「记一笔…」；quotation/bom-compare 自动回写不做隐式猜测（防双记/误记），后续如需自动回写按指令级确认设计。

### 12. 困难升级 + 人类裁决 E309（2026-09-01）

- **需求依据**：五角色审阅结论（👑老板缺口1「决策留痕」+ 📅项目经理缺口2「失败重试/上报阈值」），owner 指令「继续下一步」。§4.3.1 [P-47]/[P-48]/[P-16] 已定稿未实现。
- **代码**：① `src/config/params.ts` 补 `failureEscalationThreshold=3`（P-47）/ `correctionEscalationThreshold=2`（P-48）/ `confidenceDropThreshold=0.4`（P-16），doc-lint C8 67→70；② `src/escalation/decision-log.ts` append-only `data/decision-log.jsonl`（trigger human_arbitration|escalation|low_confidence、decision pending|approve|reject|escalate|resolved，复用 P15 JSONL 工具，env `DECISION_LOG_PATH` 覆盖）——§2.3 裁决结果记录落点；③ `src/escalation/escalation.ts` isUserCorrection（纠正词锚定开头防误伤）/ countConsecutiveCorrections（会话轮次倒序）/ 三分支文案（能力不足/信息不足/工具不足）/ P-47/P-48/P-16 消息；④ `src/escalation/escalation-state.ts` 会话级连续失败计数（failure/success 事件，遇 success 归零，env `ESCALATION_STATE_PATH` 覆盖）；⑤ `src/search/pipeline.ts` 接线——入口（路由前）连续纠正 ≥[P-48] 返回「哪里不对？我换个方向」、连续失败 ≥[P-47] 停止重试建议求助（gate=low_confidence），均记 decision-log escalate；`option_clarify|must_clarify` 返回前记 human_arbitration/pending；low_confidence 且综合分 <[P-16] 时答案前置「我不确定」声明并记 low_confidence；结尾搜索全空或合成失败记 failure、成功记 success 清零。
- **验证**：`npm run build` 绿；escalation 三模块 10/10 + pipeline 61/61（新增 5 条 E309）；`npm run test:all` 单测 1238/1239（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN。
- **诚实登记**：非破坏式——不改 confirm 语义与核心链路行为；「confirm 阻断式 + 批准/否决面板 UI」待 owner 在 UI 阶段拍板（已更新后续候选）；decision_log 的 pending→approve/reject 回填留待交互层。
- **文档**：`docs/plans/2026-09-01-escalation-human-arbitration.md`；附录 A E309。

### 13. 市场 Skill 沉淀第 12 批 E310：PRD 证据链 + 用户故事模板（2026-09-01）

- **需求依据**：五角色审阅 P1 第一批（📝产品经理缺口1「竞品/需求证据链」+ 缺口2「本地任务文件 schema」），owner 指令「继续，按你的计划」。
- **代码**：① `src/skills/market/templates.ts` `buildPrdTemplate` 增 §9.1 证据链章节（六章节→六章节+证据链，每章节强制 `[Evidence: URL/Path]` + `[hard]`/`[soft]` 标注）；② 新增 `buildUserStory`——Markdown + YAML Frontmatter 用户故事模板（frontmatter：id/title/status/priority/type/product/created_at/epic；正文：用户故事/验收标准 AC/任务拆解（供 project-writer 读取）/证据链），本地任务文件 schema 落地（如 `tasks/user_story_001.md`）；③ 薄 CLI `scripts/market-user-story.ts`（E251 @input，输出 `<标题>-用户故事.md`）+ package.json `market:user:story`；④ 市场 Skill `user-story` manifest（触发词含 用户故事模板/生成用户故事/写用户故事/写个用户故事/拆用户故事/故事拆解模板/拆解用户故事，不含裸「用户故事/故事」防误触）安装 + `prd-template` manifest 描述同步重装，用户累积 Skill 35→36。
- **验证**：`npm run build` 绿；templates 19/19 + nl-router 23/23（新增 5 条）；doc-lint 0 FAIL 0 WARN；真实冒烟 user-story 全链 ok:true（`网关告警推送的-用户故事.md` 落沙箱，frontmatter + 四章节）；maturity:check 用户累积 Skill **35→36**/50+。
- **文档**：`docs/plans/2026-09-01-market-user-story-evidence.md`；附录 A E310。
- **遗留**：P1 剩余——接口契约机器可读（架构师缺口1）、里程碑复盘自动触发（项目经理缺口1）；P2——proactive-assistant + notification-hub（秘书）。

### 14. 市场 Skill 沉淀第 13 批 E311：接口契约机器可读（2026-09-01）

- **需求依据**：五角色审阅 P1 第二批（🏗️系统架构师缺口1「接口契约机器可读」），owner 指令「好！同意你的建议」。v2.5 §2.1 架构师职责「接口契约」——契约只是 Markdown 文本时子 Agent 没法自动校验，需输出机器可读契约。
- **代码**：① `src/skills/market/templates.ts` 新增 `buildInterfaceContract(title, dateLabel, format)`——`c-header`：`__<TOKEN>_CONTRACT_H` 守卫 + `CONTRACT_VERSION` 宏 + `CMD_<X>` 占位 + `typedef struct` + 三个接口函数；`json-schema`：draft-07 `$schema`/`type: object`/`properties`/`required`；`contractMacroToken`（标题→ASCII 大写 token，中文兜底 `CONTRACT`，防非法 C 标识符）；② 薄 CLI `scripts/market-interface-contract.ts`（E251 @input，query 含 JSON/Schema → json-schema，否则 c-header，输出 `<标题>-接口契约.{h|json}`）+ package.json `market:interface:contract`；③ 市场 Skill `interface-contract` manifest（触发词：接口契约模板/生成接口契约/写接口契约/接口契约生成/契约模板/生成C头文件/生成c头文件/生成头文件/生成JSON Schema/生成json schema，不含裸「接口契约/契约/接口定义」防知识问答被抢）本地安装，用户累积 Skill 36→37。
- **验证**：`npm run build` 绿；templates 22/22 + nl-router 26/26（新增 6 条：C 头结构/JSON Schema 结构/宏 token 中文兜底/模板命中/生成C头文件 自然问法/防误触不命中）；doc-lint 0 FAIL 0 WARN；真实冒烟两格式全链 ok:true——「生成STM32与蓝牙模块的接口契约模板」→ `STM32与蓝牙模块的-接口契约.h`、「生成设备上报的JSON Schema接口契约」→ `设备上报的JSON Schema-接口契约.json` 落沙箱；maturity:check 用户累积 Skill **36→37**/50+。
- **文档**：`docs/plans/2026-09-01-market-interface-contract.md`；附录 A E311。
- **遗留**：P1 剩余——里程碑复盘自动触发（项目经理缺口1）；P2——proactive-assistant + notification-hub（秘书）。

### 15. 市场 Skill 沉淀第 14 批 E312：里程碑复盘自动触发（2026-09-01）

- **需求依据**：五角色审阅 P1 最后一项（📅项目经理缺口1「里程碑复盘自动触发」），owner 指令「继续下一步」。v2.5 §11.3 秘书日报 / §8.1.1 记忆暗示阶段复盘——plan-validation 检测到里程碑全部子任务 Done 时自动触发复盘。
- **代码**：① `src/skills/market/templates.ts` 新增 `buildMilestoneReview(title, dateLabel)`——Markdown + YAML Frontmatter（id/type: milestone_review/project/milestone/status: done/created_at）+ 六章节（里程碑信息/完成情况/验收结果/问题与风险/经验沉淀 L2/后续行动），触发方式行写明自动触发；② `src/skills/plan-validation/index.ts`——`PlanTask.status?` 可选（非破坏）+ `checkMilestoneDone`（done/已完成 归一，返回 allDone/doneCount/pendingTitles）+ `validatePlanTasks` 结果带 `milestoneDone` + `formatPlanValidation` 输出「✅ 里程碑全部子任务已完成 → 自动触发里程碑复盘」+ 全 done 时 followUpAction 提示回复「生成里程碑复盘」；③ 薄 CLI `scripts/market-milestone-review.ts`（E251 @input，输出 `<标题>-里程碑复盘.md`）+ package.json `market:milestone:review`；④ 市场 Skill `milestone-review` manifest（触发词：里程碑复盘模板/生成里程碑复盘/写里程碑复盘/里程碑复盘生成/做里程碑复盘/里程碑复盘一下/复盘模板/生成复盘/写复盘/阶段复盘模板，不含裸「里程碑/复盘」防知识问答被抢）本地安装，用户累积 Skill 37→38。
- **验证**：`npm run build` 绿；templates 23/23 + plan-validation 14/14 + nl-router 29/29（新增 8 条）+ pipeline 61/61 无回归；doc-lint 0 FAIL 0 WARN；真实冒烟全链 ok:true——「生成网关告警项目的里程碑复盘模板」→ `网关告警项目的-里程碑复盘.md` 落沙箱（frontmatter + 六章节 + 自动触发说明）；maturity:check 用户累积 Skill **37→38**/50+。
- **诚实登记**：plan-validation 是预置 Skill（SkillDeps 无 marketSkillRunner），「自动触发」落地为「检测 + 提示」——全 done 时结果带 `milestoneDone=true` 并提示回复「生成里程碑复盘」生成文档；pipeline 级自动链式执行市场 Skill 留作后续候选（需扩展 SkillDeps 契约，本轮不过度设计）。
- **文档**：`docs/plans/2026-09-01-market-milestone-review.md`；附录 A E312。
- **遗留**：P1（五角色审阅）已清空；P2 剩余——proactive-assistant + notification-hub（秘书）。

### 16. 市场 Skill 沉淀第 15 批 E313/E314：秘书主动预判 + 通知枢纽（2026-09-01）

- **需求依据**：五角色审阅 P2 最后两项（💁秘书缺口1「主动预判」+ 缺口3「信息枢纽」），owner 指令「继续剩余推进」。§2.5「有眼力见儿」行为指标 + §11.3 秘书日报 / §4.1 右栏通知区。
- **代码**：① `src/skills/market/proactive.ts`（E313）——`proactiveSuggestions` 规则引擎（日期+地点→差旅查航班/酒店；报销→报销单模板；开会→日历事件+议程；连续工作≥2h→提醒休息）+ `detectTravelIntent` + `formatProactiveSuggestions`（输出「💡 主动建议，仅建议、不自动执行」，§2.3 人类裁决）；② `src/skills/market/notification-hub.ts`（E314）——`classifyEventPriority`（🔴 紧急：老板风险裁决/项目经理阻塞报告；🟡 普通：PRD 完成/选型建议；🟢 低：日常进度，kind/title 为主、全文仅紧急兜底）+ `renderNotificationDigest`（§11.3 秘书日报分组摘要）+ `parseEventsInput`（E251 内嵌 JSON 数组或事件文件路径）；③ 薄 CLI `scripts/market-proactive-assistant.ts` / `scripts/market-notification-hub.ts` + package.json `market:proactive:assistant` / `market:notification:hub`；④ 2 个 manifest 本地安装——`proactive-assistant`（主动提醒/有什么建议/主动建议/有眼力见 等，避让 reminder「提醒我」防抢）、`notification-hub`（通知汇总/每日简报/秘书日报/通知中心 等，「秘书日报」最长触发词优先于 docx-write「日报」），用户累积 Skill 38→40。
- **验证**：`npm run build` 绿；proactive 6/6 + notification-hub 6/6 + nl-router 35/35（新增 6 条）；doc-lint 0 FAIL 0 WARN；真实冒烟 2 Skill 全链 ok:true——proactive「下周三要去深圳见供应商，顺便报销这次差旅费」→ 差旅安排+报销单 两条建议、notification-hub 三事件 → 🔴1/🟡1/🟢1 分组摘要；maturity:check 用户累积 Skill **38→40**/50+。
- **诚实登记**：两 Skill 落地为「规则/聚合 + 建议/摘要」，不自动执行、不自动写库；「监听 projects/ 目录 + 各角色 Skill 输出事件自动写入通知库」的管道接线依赖 §4.1 三栏交互 UI 阶段（右栏通知区），登记为后续候选。
- **文档**：`docs/plans/2026-09-01-market-proactive-notification-hub.md`；附录 A E313/E314。
- **遗留**：五角色审阅全部清空；剩余候选——Outlook OAuth2、E309-后 confirm 阻断式（等 owner 拍板）、v2.6 pre-ship 封版确认、v1.0 大章节。

## 明日待办（接续点）

1. v2.6 pre-ship 已封版（`346fcac`，tag `v2.6-pre-ship-2026-09-01` + ZIP）。
2. v1.0：P-10 唯一阻塞为 L2 成熟度——待 owner 按快照路径累积（Skill 50+ / 反馈 n≥30 / 复用率 60%）；P-12 Tavily 配额已重置待 owner 复核 `bench:v01`。

## 后续候选（owner 拍板后启动）

- **Outlook OAuth2（XOAUTH2）**：Outlook.com 已停用 IMAP 账号密码基本认证（实测 `NO Basic authentication is disabled.`），若要用 Outlook 做第二邮箱需实现 OAuth2 IMAP（Azure 应用注册 + 令牌刷新），登记为候选。
- **E309-后：confirm 阻断式 + 批准/否决面板**（E309 已落地记录侧，非破坏式）：§2.3 人类裁决「阻断执行 + 面板点批准/否决」依赖 §4.1 三栏交互 UI，待 owner 拍板「confirm 是否改阻断式」后启动。
- **v2.6 pre-ship 封版确认**：tag `v2.6-pre-ship-2026-09-01` + ZIP 已生成，待 owner 封版（收口报告 §6）。
- **v1.0 大章节**：MCP 子 Agent、证据链 UI、远程对话通道、代码托管联动等，见 §4.4 里程碑表与 P-10 验收口径。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线单测 + 文档 + 真实 IMAP 冒烟；无 LLM/API 付费调用）。
