# v2.6 pre-ship 收口报告（pre-ship closure）

> 周期：2026-08-30（scope 锁定）→ 2026-09-01（增量 + B1~B4 全落地 + 收口）
> 关联：`docs/plans/2026-08-30-v26-pre-ship.md`（scope 锁定）/ `docs/roadmap.md`（B1~B5 + v2.6 增量）/ `docs/audit-t3/skill-trust-audit.md` §3.2 / `docs/2026-09-01-progress-handoff.md`
> 状态：✅ v2.6 pre-ship 收口闭环（代码 + 三检 + tag + ZIP 就绪），待 owner 封版确认

---

## 1. 收口范围与依据

| 维度 | 来源 | 当前状态 |
|---|---|---|
| v2.6 增量 E293~E303（收件链路） | `docs/roadmap.md` v2.6 功能增量 | ✅ 全链收口：收件/读信/附件下载/📎 标记/搜信/多账号/163 兼容，真实冒烟全部通过（QQ 2026-08-31~09-01；163 2026-09-01） |
| roadmap B1~B4 安全治理 | `docs/roadmap.md` 安全与信任 | ✅ 已完成（E294~E297，2026-08-31，`docs/plans/2026-08-31-v26-b1-b4-security.md`） |
| roadmap B5（P-148~P-150 分领域阈值） | r5-evaluation + `docs/roadmap.md` B5 | ⏸ 未触发（0 次医疗/政务误分类逃逸），按「按需触发」原则延后，不预先落地 |
| 6 项 Skill 信任域缺口 | `docs/audit-t3/skill-trust-audit.md` §3.2 | ✅ 全部闭环：#6 E290 / #1 E291 / #4 最小防护 E292（v2.5）；#2=B1 E294 / #3=B2 E295 / #5=B3 E296 / #4 升级项=B4 E297（v2.6） |
| 框架 v2.0 强制项 | 架构师审计框架说明 v2.0 §0.3/§4.2/§4.3/§5.2/§5.3/§5.4/§6 | ✅ 见 §7 |

## 2. 三检全绿（2026-09-01 收口复跑）

| 命令 | 结果 | 关键指标 |
|---|---|---|
| `npm run build` | ✅ exit 0 | tsc 无错误 |
| `npm run test:all` | ✅ exit 0 | 单测 1199/1200（1 skip 为既有 PDF 用例）+ 集成 32/32 |
| `npm run doc-lint` | ✅ 0 FAIL 0 WARN | 8 项检查 PASS；C3 正文 1290/1800、附录 617/950；C8 PARAM 引用 67 个 key 全覆盖 |

## 3. v2.6 收口期提交（v0.2b-audit-2026-08-30 → HEAD 4f757bd，20 笔）

| # | 提交号 | 内容 | 类别 |
|---|---|---|---|
| 1 | `b18174c` | E293 收邮件 IMAP 只读收件箱（untrusted_data 防护） | 功能 |
| 2 | `63c2d00` | docs(handoff)：2026-08-31 进度交接（E293 并入 v0.2b） | 文档 |
| 3 | `3c4bb58` | E293 完善：读第 N 封按位次定位、按日期排序、主题/发件人 MIME 解码 | 功能 |
| 4 | `9e2a973` | E293-后：正文可读性（HTML 清洗 + base64/QP 解码 + URL 冒号补空格） | 功能 |
| 5 | `9aeb8fc` | B1~B4 安全治理（E294~E297：写盘沙箱 / 域白名单 / 安装日志 / 会话域名白名单） | 安全 |
| 6 | `826c97f` | docs：B1~B4 收口（README 已知风险 + 审计文档同步） | 文档 |
| 7 | `0ce2fee` | E298 附件下载（IMAP 整封解析 + 落盘 `data/mail-attachments`，过沙箱门禁） | 功能 |
| 8 | `1d29b22` | docs：E298 真实 QQ 冒烟通过（中文名 md 附件） | 文档 |
| 9 | `e83a199` | E299 查收件箱 📎 附件标记（BODYSTRUCTURE 判定） | 功能 |
| 10 | `80f7ced` | docs：E299 真实 QQ 冒烟通过 | 文档 |
| 11 | `356d58b` | E300 搜信（IMAP SEARCH + 中文解码本地兜底） | 功能 |
| 12 | `3c02d64` | E301 搜信冒烟修复（市场 Skill 2 字触发词不抢直连本地 Skill） | 修复 |
| 13 | `ab70482` | docs：E300/E301 真实 QQ 冒烟通过 | 文档 |
| 14 | `397e37e` | docs：交接收口——收件链路 E293-后 全链完成，登记 v2.6/v1.0 候选 | 文档 |
| 15 | `f35de2b` | E302 收邮件多账号（凭据容器化 + active 切换 + 按账号收件/搜信） | 功能 |
| 16 | `165ed7b` | docs：补 E302 提交哈希到交接与计划文档 | 文档 |
| 17 | `eb66415` | mail:config 增 `--imap-host/--imap-port/--imap-secure`（E302 配套） | 功能 |
| 18 | `423cfca` | docs：E302 真实冒烟（多账号切换/按账号收件通过；Outlook 需 OAuth2 候选） | 文档 |
| 19 | `7a0dc2d` | E303 163 收件兼容（IMAP ID 命令声明客户端身份） | 修复 |
| 20 | `4f757bd` | docs：E303 真实 163 冒烟通过 | 文档 |

**行为变更归属**（框架 §4.2 回归成本）：全部 11 笔代码提交均为增量功能/安全收紧，无 §5/§6 数值变更（未新增 PARAM），附录 A 各 E-NN 均登记 `bench:na(new-param)`；验证走离线单测 + owner 真实冒烟（QQ/163 IMAP），无 LLM/API 付费调用。

## 4. 交付 tag 与 ZIP

### 4.1 tag 终态（建议）

| 字段 | 值 |
|---|---|
| tag 名 | `v2.6-pre-ship-2026-09-01` |
| 指向提交 | `4f757bd`（HEAD） |
| ZIP 文件 | `ai-butler-v2.6-pre-ship-2026-09-01.zip` |
| ZIP 大小 | 3,384,131 B（≈ 3.2 MB） |
| ZIP SHA256 | `D52C3422D331B3754493A9DFE20706CC33AF12787A8C69DAE8DDED41A3D03257` |
| ZIP 口径 | `git archive`（tag 提交，不含未提交工作区；排除清单见 §4.2） |

### 4.2 ZIP 排除清单核验（audit-package-checklist §11）

| 项 | 是否在 ZIP 内 | 验证方式 |
|---|---|---|
| `.env` / `data/`（含 mail 凭据、SQLite、附件、浏览器登录态）| ❌ 已排除 | `.gitignore` + `git archive` 不含 |
| `dist/` / `desktop/release/` / `desktop/resources/` / `desktop/src-tauri/target/` | ❌ 已排除 | `.gitignore` + archive 不含 |
| 参考项目（AI-Butler/ OpenHands/ Tavily+AnySearch+Bocha/ openocta/ opensquilla/ openworker/ v3/ crm/ benchmarks/ deepseek-harness/ agent-skills/）| ❌ 已排除 | `.gitignore` |
| 审计交付物（`审计交付/`、`ai-butler-audit-package-v0.2b-audit-2026-08-30.zip`、R-3 证据）| ❌ 已排除 | 未入库，archive 不含 |

## 5. 工作区当前状态（2026-09-01）

### 5.1 已纳入版本管理

- ✅ v2.6 收口期 20 笔全部 commit（HEAD = `4f757bd`）。

### 5.2 未追踪/未提交但**非交付**（按用户 2026-09-01 指示暂不提交）

- `bench/classify-metrics.jsonl` / `bench/search-metrics.jsonl`（机器运行指标，用户指示暂缓）
- `docs/2026-08-30-progress-handoff.md`（8-30 交接补充，用户指示暂缓）
- `ai-butler-audit-package-v0.2b-audit-2026-08-30.zip`、`docs/audit-t3/v25-audit-closure.md`、`docs/plans/2026-08-30-v26-pre-ship.md`、`审计交付/`（v2.5 审计交付物，不入库）

全部不影响 v2.6 pre-ship 交付包语义（archive 基于 tag，不含工作区）。

## 6. 待 owner 确认事项

| # | 项 | 建议 | 阻塞 |
|---|---|---|---|
| 1 | tag `v2.6-pre-ship-2026-09-01` + ZIP 封版 | 确认后封版（ZIP SHA256 回填本报告 §4.1） | LOW |
| 2 | v2.6 pre-ship 移交方式 | 复用 v2.5 流程（本地 `审计交付/` + 第三方审阅）或内部封版 | LOW |
| 3 | 下一步方向：v1.0 大章节 | MCP 子 Agent / 证据链 UI / 远程对话通道 / 代码托管联动（§4.4 里程碑表 + P-10） | 业务侧拍板 |
| 4 | 工作区 5 项非交付残留是否入库/清理 | 维持现状（用户此前指示「其他的先不提交」） | LOW |

## 7. 框架 v2.0 强制项验证

| 框架 § | 要求 | 验证结果 |
|---|---|---|
| §0.3 数值单家 + E-NN 流程 | 状态变更走 E-NN changelog + 五条件 | ✅ E293~E303 全部按 §0.3 登记附录 A，owner 真实冒烟为证据（n≥阈值、无相反证据） |
| §4.2 回归成本归属 | 不代跑全量 LLM/API/desktop | ✅ 全周期真实冒烟由 owner 侧执行；所有代码变更均 `bench:na(new-param)` |
| §4.3 AI 安全面 L1 | Prompt Injection / SSRF / 命令注入 | ✅ 邮件正文 untrusted_data 隔离（E293）；B1~B4 写盘沙箱/域白名单/安装日志/SSRF 升级（E294~E297）；163 兼容 ID 命令（E303） |
| §5.2 预估成本(¥) 列 | 修复路径含位置 + 内容 + 效果 + 工时 + 预估成本 | ✅ 各子计划文档均含（email-imap 系列 + v26-b1-b4-security） |
| §5.3 置信度 §9 | HIGH/MEDIUM/LOW 逐条标注 + 单条汇总 | ✅ 各 E-NN 附录 A 证据含置信度/验证口径 |
| §5.4 最小侵入式优先 | 不修则 6 个月内必然重大故障 | ✅ B1~B4 为审计 §3.2 缺口闭环，最小侵入（白名单/门禁增量，不改既有路径默认行为） |
| §6 沟通原则 | 不确定标 LOW / 工具降级 / 缺失声明 | ✅ Outlook OAuth2、Gmail 未测、B5 未触发等均诚实声明（roadmap + handoff） |

## 8. 总结

- **v2.6 pre-ship 收口**：✅ 闭环——scope 内全部落地（v2.6 增量 E293~E303 + B1~B4 E294~E297），三检全绿，20 笔提交齐备。
- **B5（P-148~P-150）**：按触发条件未命中，保持延后，不预先落地。
- **预估成本(¥)**：¥0（全周期本地实现 + 离线单测 + 文档 + owner 真实 IMAP 冒烟；无 LLM/API 付费调用）。
- **下一步**：待 owner 封版确认（§6），随后可启动 v1.0 大章节或按 owner 拍板新方向。
