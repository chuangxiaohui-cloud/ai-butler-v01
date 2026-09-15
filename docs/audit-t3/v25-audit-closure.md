# v2.5 审计关闭报告（audit closure report）

> 周期：2026-08-30（v2.5 封版 cba6af6）→ 2026-08-30 21:35（owner 拍板封版 + 移交）
> 状态：✅ v2.5 审计周期正式关闭
> 关联：`docs/audit-t3/closure-report.md`（T+3 周期收口）/ `docs/audit-t3/pre-ship-closure.md`（v2.5 交付前收口）/ `docs/audit-t3/delivery-handover.md`（移交单）/ `docs/audit-t3/skill-trust-audit.md`（24 项 Skill 信任域）/ `docs/2026-08-30-progress-handoff.md` §11（owner 三阶段拍板）
> 框架依据：`架构师审计框架说明 v2.0.md` §0.3 / §4.2 / §4.3 / §5.2 / §5.3 / §5.4 / §6

---

## 1. 关闭依据与封版基线

| 项 | 值 |
|---|---|
| **封版基线** | tag `v0.2b-audit-2026-08-30` @ `cba6af6fc4dc198f6b59f123d4dd5874ef9f32ee` |
| **交付 ZIP** | `M:\202608111\审计交付\ai-butler-audit-package-v0.2b-audit-2026-08-30.zip`（3,348,276 B，SHA256 `EA8C97797E0BDBB9F6C2DE0B7E3D61849F8F3CD97DA4752518EFC622764C4C77`）|
| **随附证据** | `M:\202608111\审计交付\R-3-evidence.zip`（166,541 B，SHA256 `77A8E37F9655063F32EBA4DB5E7AC09E47664D7EAB39F7C785C079DD510B474B`）|
| **owner 拍板日期** | 2026-08-30 21:35 |
| **签字人** | 老张（项目 owner / 审计对接人）|

## 2. v2.5 周期交付清单（全闭环 ✅）

### 2.1 三检终态

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm run build` | ✅ exit 0 | tsc 无错误 |
| `npm run test:all` | ✅ exit 0 | 单测 + 集成全绿；交付快照前 32/32 集成 + 单测 1120+ 全绿 |
| `npm run doc-lint` | ✅ 0 FAIL 0 WARN | C8 PARAM 引用 67 个 key 全覆盖 |

### 2.2 5 项 T+3 交付物

| # | 文件 | 提交号 | 状态 |
|---|---|---|---|
| 1 | `docs/audit-t3/param-sample-30.md` | `48e31bd` | ✅ |
| 2 | `docs/audit-t3/smoke-e2e-report.md` | `f343793` | ✅ |
| 3 | `docs/audit-t3/r1-regression.md` | `f343793` | ✅ |
| 4 | `docs/audit-t3/r3-codegraph.md` | `f343793` | ✅ |
| 5 | `docs/audit-t3/r5-evaluation.md` | `f343793` | ✅ |

### 2.3 3 项 owner 拍板

| # | 项 | 决策记录 | 状态 |
|---|---|---|---|
| 1 | R-1 [P-04] 维持 2500ms provisional | `docs/audit/decisions-R1.md` | ✅ 闭环（等 9/2 复测） |
| 2 | R-3 .gitignore 11 参考项目 + benchmarks 黄标 | `docs/audit/decisions-R3.md` | ✅ 闭环 |
| 3 | smoke-e2e 4 类实跑 | `docs/audit-t3/smoke-e2e-report.md §6` | ✅ 闭环 |

### 2.4 E-NN changelog（v2.5 全周期）

| E-NN | 内容 | 提交 | 状态 |
|---|---|---|---|
| E285 | R-2 §5.5 补登 P-95~P-104 + P-128 定稿 + doc-lint 预算 170 | `12641a4` | ✅ |
| E286 | R-7 [P-85]/[P-86] 迁入 PARAMS 单一来源（C8 65→67 key）| `c6d1b57` | ✅ |
| E287 | R-5 §6.6 分领域阈值契约化注释（不新增 P-NN）| `519bcbe` | ✅ |
| E288 | [P-04] 临时上调 2500ms（provisional@2026-08-30）| `d8e524f` | ✅ |
| E289 | 08-13 批 20 项定稿晋升（数值不变，provisional→定稿）| `b6faf8b` | ✅ |
| E290 | `market/github-project` 接缓存（v2.5 work-in-progress，闭环）| — | ✅ |
| E291 | `office-daily` SMTP 双闸（v2.5 work-in-progress，闭环）| `946f62d`/`7c4b9ec` | ✅ |
| E292 | `browser-session` URL SSRF 最小防护（v2.5 入库）| — | ✅ |

### 2.5 交付期新增提交（owner 拍板后）

| 提交号 | 内容 |
|---|---|
| `ebad048` | chore(gitignore)：增 R-3-evidence.zip / R3-terminal-proof.png 忽略 |
| `fb10e92` | bench: search:smoke 指标追加 5 行 |
| `898ced1` | docs(audit-t3)：落 pre-ship-closure.md（164 行，三检全绿 + ZIP + 框架验证）|
| `599081a` | docs(audit-t3)：落 delivery-handover.md（159 行，移交单 + owner 拍板登记 + 签字栏）|
| `fde0a32` | chore(gitignore)：v2.5 交付后清理——21 项临时/历史/草稿忽略 |
| `40dca3c` | metrics 25 行入库（owner 同意性能基线随本次发版一起 commit）|

### 2.6 24 项 Skill §10 信任域审查

- ✅ 完成（`docs/audit-t3/skill-trust-audit.md`，271 行）
- ✅ 全部 Skill 落入 5 源信任域矩阵，无第六域穿透，无直接命令注入面
- ✅ 已落地防御 5 项（SkillDeps 注入 + 沙箱门 + URL 常量化 + Python 路径固定 + env 隔离）
- ✅ 6 项 v2.6+ 缺口候选 → B1~B4 + 2 项已闭环（E290/E291/E292）

## 3. 残余项清单（含 owner / 审计 分工）

### 3.1 owner 侧承担（**无审计介入**）

| # | 项 | 性质 | 触发 | owner 操作 |
|---|---|---|---|---|
| O-1 | **SMTP 真实冒烟邮箱** | 业务配置 | v2.5 已闭环双闸语义（fake SMTP 单测覆盖），真实两段式发送冒烟需 host/账号/授权码 | owner 自行运行 `npm run mail:config` 配置后复测；如 SMTP provider 凭据不可用则跳过 |
| O-2 | **PID 18072 残留进程结束** | 工作区 hygiene | 2026-08-30 12:06 启动的 node 进程（命令行走查被拒，非 gateway；疑似 `--watch` 残留）| owner 在任务管理器查看并结束；如不再写 `undefined` 可不处理（`e792e8e` 修复后已无新写入）|
| O-3 | **T+6 bench:devil-v25 122 条全量回归** | owner 拍板下一阶段 | 2026-09-13 ± 3 天窗口 | owner 亲自跑并提交 `bench/B-2026MMDD-T6-owner-regression.md` |
| O-4 | **v2.6 pre-ship 委托启动** | owner 拍板下一阶段 | owner 邮件/工单启动 | 开 `v2.6-pre-ship` 分支 |
| O-5 | **6 个月稳定性复评** | owner 拍板下一阶段 | 2027-02-28 ± 1 月窗口 | 触发后启动 `docs/audit-t6/closure-report.md` |

### 3.2 审计侧已闭环

| # | 项 | 落地证据 |
|---|---|---|
| A-1 | [P-04] 9/2 复测路径已设定 | E288 + `decisions-R1.md`（待 owner 9/2 实测）|
| A-2 | 误创建文件 `undefined` 根因修复 | `e792e8e`（测试还原改 `delete`，5 处）|
| A-3 | E290/E291/E292 work-in-progress 闭环 | 见 §2.4 |
| A-4 | 未追踪 21 项清理 | `fde0a32`（.gitignore 增补）|
| A-5 | R-3 双重忽略 + benchmarks 黄标 | `4a9565b` + `e91e6ba` + `3708ce3` |

### 3.3 v2.6 触发条件（按需启动）

| # | 项 | 触发条件 | 当前状态 |
|---|---|---|---|
| T-1 | P-148 drug 阈值 | 1+ 次医疗误分类逃逸 | ⏳ 未触发 |
| T-2 | P-149 tax 阈值 | 1+ 次政务误分类逃逸 | ⏳ 未触发 |
| T-3 | P-150 regulation 阈值 | 1+ 次政务误分类逃逸 | ⏳ 未触发 |

> 触发原则：v2.6 周期内若任一项触发，**自动启动**对应 PARAM 落地子计划（无需 owner 单独拍板）。

## 4. v2.6+ backlog 登记号（B1~B5）

来源：`docs/roadmap.md`（v2.6+ 路线图 backlog，2026-08-30 登记）。

| ID | 项 | 来源 | 工时 | v2.6 pre-ship 范围 |
|---|---|---|---|---|
| **B1** | 写盘类 4 项 Skill 加沙箱（calendar-skill ICS / schematic-bom CSV / office-daily 16 模式输出 / video-learner JSON）| `audit-t3/skill-trust-audit.md` §3.2 缺口 #2 | 3-4h | ✅ |
| **B2** | `video-learner` ASR/B站域白名单 | `audit-t3/skill-trust-audit.md` §3.2 缺口 #3 | 1-2h | ✅ |
| **B3** | `market/installer` 安装日志（包名 + SHA-256 + 时间 + manifest 快照）| `audit-t3/skill-trust-audit.md` §3.2 缺口 #5 | 1h | ✅ |
| **B4** | `browser-session` 完整域名白名单（E292 已完成最小防护：协议白名单 + 内网 IP 段黑名单 + 禁 30x 重定向）| `audit-t3/skill-trust-audit.md` §3.2 缺口 #4 升级项 | 1-2h | ✅ |
| **B5** | P-148~P-150 分领域阈值（drug/tax/regulation/statistics）| `audit-t3/r5-evaluation.md` + handoff 待办 7 | 1+ 次逃逸触发 | ⏳ 按需 |

**v2.6 pre-ship 范围（已锁定）**：v2.6 增量 + B1~B4 + 6 项 Skill 信任域缺口（3 项已闭环于 v2.5：E290/E291/E292）+ B5 按需。详见 `docs/plans/2026-08-30-v26-pre-ship.md`。

## 5. 已知缺口（诚实声明）

| # | 缺口 | 等级 | 处理 |
|---|---|---|---|
| K-1 | 无独立 E2E 套件 | LOW | desktop 冒烟替代；v2.6+ 候选 |
| K-2 | OpenAPI 规范待生成 | LOW | v2.6+ 候选 |
| K-3 | memory-core 外部依赖 | LOW | 集成测试 mock 覆盖 |
| K-4 | UI 组件未拆分 | LOW | desktop Tauri 包内聚 |
| K-5 | [P-04] 2500ms 临时 | MEDIUM | provider 抖动期维持，待 9/2 复测 |
| K-6 | SMTP 真实冒烟未跑 | LOW | owner 侧（O-1）|
| K-7 | PID 18072 残留进程未确认 | LOW | owner 侧（O-2）|

## 6. 框架 v2.0 强制项验证（终态）

| 框架 § | 要求 | 验证结果 |
|---|---|---|
| §0.3 数值单家 + E-NN 流程 | 状态变更走 E-NN changelog + 五条件 | ✅ E285~E292 全部按 §0.3 流程登记 |
| §4.2 回归成本归属 | 审计方不代跑全量 LLM/API/desktop | ✅ T+3 4 类冒烟由 owner 侧执行；bench:devil-v25 122 条 owner 承担 |
| §4.3 AI 安全面 L1 | Prompt Injection / SSRF / 命令注入 | ✅ R-1 `applyRule3` + §10 网络层 + E292 SSRF 最小防护 + e792e8e env 隔离修复 |
| §5.2 预估成本(¥) 列 | 修复路径含位置 + 内容 + 效果 + 工时 + 预估成本 | ✅ 全部 R-N + T+3 交付物 + skill-trust-audit + pre-ship-closure 均含 |
| §5.3 置信度 §9 | HIGH/MEDIUM/LOW 逐条标注 + 单条汇总 | ✅ 审计报告 §8 + 各交付物 §X 均含 |
| §5.4 最小侵入式优先 | 不修则 6 个月内必然重大故障 | ✅ R-5 评估 4 道防线兜底；R-7/R-9 已落地 |
| §6 沟通原则 | 不确定标 LOW / 工具降级 / 缺失声明 | ✅ CodeGraph 噪音降级 + 24 项 Skill 仅读 SKILL 文档 + bench:devil-v25 owner 侧承担 |

## 7. 关闭决定

- ✅ **v2.5 审计周期正式关闭**
- ✅ 封版基线 cba6af6（不可逆）
- ✅ 交付 ZIP 移交完成（`M:\202608111\审计交付\`）
- ✅ 残余项已分 owner / 审计侧（owner 侧无审计介入）
- ✅ v2.6 pre-ship scope 已锁定（`docs/plans/2026-08-30-v26-pre-ship.md`）
- ✅ B1~B5 backlog 已登记号（`docs/roadmap.md`）

## 8. 恢复触发点约定（owner 拍板，2026-08-30 晚）

**审计周期恢复触发条件**（任一项触发即可启动新委托）：

1. **T+6 owner 全量回归结果提交** → 启动新委托：bench 修复 + 累积验证
2. **v2.6 进入 pre-ship（新委托）** → 启动新委托：v2.6 pre-ship 周期
3. **6 个月稳定性复评** → 启动新委托：6mo 复评周期

**默认空闲期**：触发条件未达前，审计方无主动动作。

**预估成本(¥)**：¥0（v2.5 关闭报告本身为纯文档治理；恢复触发后的新委托按各自范围独立核算）。
