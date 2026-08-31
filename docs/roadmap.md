# v2.6+ 路线图 Backlog

> 用途：把「owner 拍板延后到 v2.6+」的项集中登记，避免丢失。
> 来源：`docs/audit-t3/skill-trust-audit.md` §3.2 缺口 + owner 拍板（2026-08-30）。

## 安全与信任（Skill 审计 §3.2 延后项）

| 编号 | 项 | 来源 | 状态/触发 | 备注 |
|---|---|---|---|---|
| B1 | 写盘类 4 项 Skill 加沙箱（calendar-skill ICS / schematic-bom CSV / office-daily 16 模式输出 / video-learner JSON） | 审计 §3.2 缺口 #2 | ✅ 已完成（E294，2026-08-31，见 [`docs/plans/2026-08-31-v26-b1-b4-security.md`](docs/plans/2026-08-31-v26-b1-b4-security.md)） | `isSkillOutputAllowed` 二级白名单（`data/{office,learned-videos,boms,calendar}`）+ `guardSkillOutputPath` 门禁 + 审计日志；显式注入 outDir 的测试/受信调用方跳过 |
| B2 | `video-learner` ASR/B站域白名单 | 审计 §3.2 缺口 #3 | ✅ 已完成（E295，2026-08-31，同上） | `VIDEO_LEARN_ALLOWED_HOSTS` 白名单（默认 bilibili/bilivideo/hdslb 域）；B站响应 untrusted 字幕/媒体 URL 下载前校验 |
| B3 | `market/installer` 安装日志（包名 + SHA-256 + 时间 + manifest 快照） | 审计 §3.2 缺口 #5 | ✅ 已完成（E296，2026-08-31，同上） | `MarketInstallRecord.manifestSnapshot` 快照落 JSONL 安装记录 |
| B4 | `browser-session` 完整域名白名单（E292 已完成最小防护） | 审计 §3.2 缺口 #4 升级项 | ✅ 已完成（E297，2026-08-31，同上） | fetchPage/downloadFile 可选 `allowedHosts`（`isDomainMatch` 含子域）；缺省保持 E292 SSRF-only；video-learner 已透传其域白名单 |

## 能力候选（R-5 评估延后）

| 编号 | 项 | 来源 | 触发条件 |
|---|---|---|---|
| B5 | P-148~P-150 分领域阈值（drug/tax/regulation/statistics） | r5-evaluation.md + handoff 待办 7 | 1+ 次医疗/政务误分类逃逸或行业合规硬约束，当前未触发 |

## v2.6 功能增量（E293~E299 区间）

| 编号 | 项 | 来源 | 状态/触发 | 备注 |
|---|---|---|---|---|
| E293 | 收邮件 IMAP 只读收件箱（查最近 N 封 + 读第 N 封全文，正文 untrusted_data 防护） | owner 指令 2026-08-31「收邮件也一起实现」 | 实现完成（v2.6 pre-ship 候选；提交归属待 owner 拍板） | `src/mail/imap.ts` + office-daily 收件分支；真实 QQ IMAP 冒烟已通过（2026-08-31，按日期排序）；Gmail 未测 |
| E293-后 | IMAP 增量：附件下载 / 搜信（SEARCH 条件）/ 多账号 | E293 遗留 | 附件下载已完成；搜信 / 多账号 v2.6+ 候选 | 主题/发件人 MIME 解码（`docs/plans/2026-08-31-email-mime-header-decode.md`）、正文可读性 base64/QP+HTML 清洗（`docs/plans/2026-08-31-email-body-readable.md`）、附件下载（E298，`docs/plans/2026-08-31-email-imap-attachment-download.md`）已完成（2026-08-31）；真实 QQ IMAP 附件下载冒烟已通过（2026-09-01，中文名 md 附件解码落盘）；搜信 / 多账号未做 |

## 收口约定

- v2.6 推进任一项：先写 `docs/plans/YYYY-MM-DD-<主题>.md` → 落地 + 测试 → 附录 A 登记 E-NN → 本表状态改「已完成」并链接。
