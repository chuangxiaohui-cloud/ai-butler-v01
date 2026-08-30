# v2.6+ 路线图 Backlog

> 用途：把「owner 拍板延后到 v2.6+」的项集中登记，避免丢失。
> 来源：`docs/audit-t3/skill-trust-audit.md` §3.2 缺口 + owner 拍板（2026-08-30）。

## 安全与信任（Skill 审计 §3.2 延后项）

| 编号 | 项 | 来源 | 状态/触发 | 备注 |
|---|---|---|---|---|
| B1 | 写盘类 4 项 Skill 加沙箱（calendar-skill ICS / schematic-bom CSV / office-daily 16 模式输出 / video-learner JSON） | 审计 §3.2 缺口 #2 | 延后 v2.6（owner 2026-08-30：纯本地单用户场景，README 已标注已知风险） | 方案：扩展 `isPathAllowed` 接受 `data/{office,learned-videos,boms,calendar}/**`；或 `sandbox.ts` 应用数据目录二级白名单 |
| B2 | `video-learner` ASR/B站域白名单 | 审计 §3.2 缺口 #3 | 延后 v2.6 | 1-2h |
| B3 | `market/installer` 安装日志（包名 + SHA-256 + 时间 + manifest 快照） | 审计 §3.2 缺口 #5 | 延后 v2.6 | 写 `data/market-skills/.install-log.json`，1h |
| B4 | `browser-session` 完整域名白名单（E292 已完成最小防护） | 审计 §3.2 缺口 #4 升级项 | 延后 v2.6 | 最小防护已入 v2.5：协议白名单 + 内网段黑名单 + 禁 30x 重定向 |

## 能力候选（R-5 评估延后）

| 编号 | 项 | 来源 | 触发条件 |
|---|---|---|---|
| B5 | P-148~P-150 分领域阈值（drug/tax/regulation/statistics） | r5-evaluation.md + handoff 待办 7 | 1+ 次医疗/政务误分类逃逸或行业合规硬约束，当前未触发 |

## v2.6 功能增量（E293~E299 区间）

| 编号 | 项 | 来源 | 状态/触发 | 备注 |
|---|---|---|---|---|
| E293 | 收邮件 IMAP 只读收件箱（查最近 N 封 + 读第 N 封全文，正文 untrusted_data 防护） | owner 指令 2026-08-31「收邮件也一起实现」 | 实现完成（v2.6 pre-ship 候选；提交归属待 owner 拍板） | `src/mail/imap.ts` + office-daily 收件分支；真实 QQ/Gmail IMAP 冒烟待用户（QQ 需开 IMAP 服务 + 授权码） |
| E293-后 | IMAP 增量：MIME 解码 / 附件下载 / 搜信（SEARCH 条件）/ 多账号 | E293 遗留 | v2.6+ 候选 | 当前 BODY.PEEK[TEXT] 只取 text/plain 首个部件；HTML 不清洗、附件不下载 |

## 收口约定

- v2.6 推进任一项：先写 `docs/plans/YYYY-MM-DD-<主题>.md` → 落地 + 测试 → 附录 A 登记 E-NN → 本表状态改「已完成」并链接。
