# v2.5 审计交付包移交单（delivery handover）

> 移交方：项目方（审计方 owner：老张）
> 接收方：第三方审计方（待签收）
> 移交日期：2026-08-30
> 移交物：见 §1
> 关联：`docs/audit-package-checklist.md` §10.4 / `docs/audit-t3/pre-ship-closure.md` §4 / `docs/2026-08-30-progress-handoff.md` §7

---

## 1. 移交物清单

### 1.1 主交付包

| 文件 | 大小 | SHA256 | 说明 |
|---|---|---|---|
| `ai-butler-audit-package-v0.2b-audit-2026-08-30.zip` | 3,348,276 B（3.3 MB） | `EA8C97797E0BDBB9F6C2DE0B7E3D61849F8F3CD97DA4752518EFC622764C4C77` | **主交付包**，基于 tag `v0.2b-audit-2026-08-30`（指向 `cba6af6`），含 1009 条目（git archive 口径）|

### 1.2 随附证据（不属交付包本体）

| 文件 | 大小 | SHA256 | 说明 |
|---|---|---|---|
| `R-3-evidence.zip` | 166,541 B | `77a8E37F9655063F32EBA4DB5E7AC09E47664D7EAB39F7C785C079DD510B474B` | R-3 CodeGraph 噪音隔离验证证据（终端截图 + check-ignore 验证）。**不**在交付包内（§11 排除清单外随附）|

### 1.3 存放路径

```
M:\202608111\审计交付\
├── ai-butler-audit-package-v0.2b-audit-2026-08-30.zip  ← 主交付包
└── R-3-evidence.zip                                    ← R-3 证据随附
```

---

## 2. owner 拍板与封版决定（2026-08-30 21:35）

| # | 项 | 拍板 | 理由 |
|---|---|---|---|
| 1 | tag/ZIP 重定位（cba6af6 → fb10e92 / 2e1c89b）| ❌ **接受 cba6af6 现状** | E290/E291 属 work-in-progress，不阻塞 v2.5 交付语义；接受当前快照作为封版基线 |
| 2 | E291 office-daily SMTP双闸（2/4 测试未过）| ⏳ **继续推进，不阻塞** | 并发会话正在修复（1051/1053 测试）；不进入本次交付包语义 |
| 3 | 审计 ZIP 移交目的地 | ✅ `M:\202608111\审计交付\` | owner 拍板本地存档（暂不上传网盘/邮件） |
| 4 | 未追踪 17 项清理（v1.9-v2.3 / temp）| ✅ **同意清理** | 本次交付后顺手增补 `.gitignore` 或物理删除 |

**封版基线**：tag `v0.2b-audit-2026-08-30` @ `cba6af6fc4dc198f6b59f123d4dd5874ef9f32ee`

---

## 3. 交付包内容覆盖（1009 条目逐项核验）

| 项类 | 数量 | 来源 |
|---|---|---|
| 入口三件套 | 3 | `README.md` / `AGENTS.md` / `docs/audit-navigation.md` |
| 需求与宪法 | 3+ | `一人公司AI-Agent需求文档_v2.5.md` / `docs/plans/` / `docs/YYYY-MM-DD-progress-handoff.md` |
| 架构与设计 | 12 | `docs/architecture/*`（5 份）+ `docs/adrs/*`（1 份）+ `docs/design/*`（7 份）|
| 工程与运维 | 5+ | `docs/engineering/*` / `docs/code-directory.md` / `docs/directory-structure.md` |
| 审计材料 | 8 | `docs/audit-navigation.md` / `docs/audit-package-checklist.md` / `docs/audit/decisions-R{1,3}.md` / `docs/audit-t3/{closure-report,skill-trust-audit,pre-ship-closure,delivery-handover}.md` / `docs/reports/architecture-audit-2026-08-30.md` |
| bench 证据 | ~50 | `bench/B-20260818-01-official-subquery.md` … `bench/B-20260830-*.md` |
| 资质自证模板 | 1 | `docs/audit-package/attestation-template.md` |
| 源代码（git archive）| 全量 | `src/`（含 `src/skills/` `src/search/` `src/agent/` `src/config/` 等）|
| 测试（git archive）| 全量 | `tests/` `bench/` |
| 配置文件 | 全量 | `.env.example` / `package.json` / `tsconfig.json` 等 |
| **排除项**（§11）| ❌ 不含 | `.env` / `data/` / `dist/` / `desktop/release/` / `desktop/resources/` / `desktop/src-tauri/target/` / 参考项目（11 个）/ `audit-evidence/` / `R-3-evidence.zip` / `undefined` / `e284-run*.json` / v1.9-v2.3 历史文档 / v2.5 草稿 / 临时 .xls/.docx/.pdf |

---

## 4. 审计方资质自证（§0.1，签约前必签）

- [ ] 提供过往 AI Agent / LLM 应用审计案例（脱敏）
- [ ] 已阅读本项目 v2.5 需求文档与架构文档（§3）
- [ ] 理解 PARAM 注册表机制（§5 + `src/config/params.ts` + `docs/design/param-registry.md`）
- [ ] 具备 Prompt Injection / SSRF / 命令注入等 AI 安全测试能力

**签署件模板**：`docs/audit-package/attestation-template.md`（在交付包内）

---

## 5. 审阅快速入口（按 audit-navigation.md 「审核快速入口」）

1. **入口三件套** → §1 入口三件套
2. **架构验证**（必做，§3.1）→ `docs/architecture/*` + CodeGraph `.codegraph/`
3. **PARAM 对齐**（§5.1）→ `src/config/params.ts` ↔ 需求文档 §5 + 附录 A
4. **冒烟通过**（§6.1）→ `npm run build` / `npm run test:all` / `npm run doc-lint`
5. **AI 代码特异性必查**（§7）→ `docs/audit-t3/skill-trust-audit.md`（24 项 Skill 五源信任域）
6. **置信度声明**（§9）→ `docs/reports/architecture-audit-2026-08-30.md` §8
7. **签字**（§0.1 + §10）→ 本移交单 §4

---

## 6. 已闭环 vs 已知缺口（诚实声明）

### 6.1 已闭环（v2.5 交付基线）

- ✅ R-1（CRITICAL）：Stage 2 规则③预检 + [P-04] 2500ms provisional（待 9/2 复测）
- ✅ R-2（HIGH）：§5.5 补登 P-95~P-104 + E289 08-13 批定稿
- ✅ R-3（LOW）：.gitignore 11 参考项目 + benchmarks 黄标
- ✅ R-5（MEDIUM）：§6.6 分领域阈值契约化（评估结论不修）
- ✅ R-7（LOW）：[P-85]/[P-86] 迁入 PARAMS 单一来源（C8 67 key）
- ✅ R-9（LOW）：PARAM 抽样 30 条核对
- ✅ 24 项 Skill §10 信任域审查（5 源 + 5 权限，6 项 v2.6+ 缺口候选）

### 6.2 已知缺口（诚实声明，框架 §6）

- 🟡 **R-8 / 无独立 E2E 套件**：当前用 desktop 冒烟替代（owner 侧承担）
- 🟡 **OpenAPI 规范待生成**：未生成（v2.6+ 候选）
- 🟡 **memory-core 外部依赖**：集成测试 mock 覆盖，真实环境依赖外部服务
- 🟡 **UI 组件未拆分**：desktop Tauri 包内聚，暂未独立组件库
- 🟡 **P-04 [P-04] 2500ms** 临时：provider 抖动期维持，待 9/2 复测决定回退
- ⏳ **E290/E291 work-in-progress**：未进入 v2.5 交付包语义（owner 拍板接受）

### 6.3 v2.6+ 候选（不阻塞 v2.5）

- P-148~P-150 分领域阈值（applyRule3 4 类已覆盖，候选增量）
- office-daily SMTP 双闸（E291 进行中）
- 4 项写盘 Skill 沙箱
- video-learner ASR/B站域白名单
- browser-session URL SSRF 过滤
- market/installer 安装日志
- market/github-project 缓存（E290 已闭环，剩余 ~1h 验证）

---

## 7. 验证锚点（审计方接收后请优先核对）

| 验证项 | 命令 | 期望 |
|---|---|---|
| 交付包 SHA256 一致 | `sha256sum ai-butler-audit-package-v0.2b-audit-2026-08-30.zip` | `EA8C97797E0BDBB9F6C2DE0B7E3D61849F8F3CD97DA4752518EFC622764C4C77` |
| tag 存在且指向 cba6af6 | `git rev-parse v0.2b-audit-2026-08-30` | `cba6af6fc4dc198f6b59f123d4dd5874ef9f32ee` |
| 构建绿 | `npm run build` | exit 0 |
| 单测 + 集成绿 | `npm run test:all` | exit 0，集成 32/32 |
| 文档 lint 绿 | `npm run doc-lint` | 0 FAIL 0 WARN |
| PARAM 引用全 | （doc-lint C8 项）| 67 个 key 全覆盖 |
| 排除清单无 | `git archive v0.2b-audit-2026-08-30 \| tar -t` | 不含 `.env`/`data`/`dist`/参考项目等 |
| bench 基线保护 | `bench/devil-v25/` + `bench/B-20260830-01` | 已登记，未跑全量 |

---

## 8. 签字栏

**项目方**（移交方）：
- 签字人：老张
- 日期：2026-08-30
- 角色：项目 owner / 审计对接人
- 联系方式：略（内部）

**第三方审计方**（接收方）：
- 签字人：____________________
- 日期：____________________
- 角色：____________________
- 联系方式：____________________
- 资质自证（§0.1）已确认：____________________

---

## 附录 A：本移交单 commit 历史

| 提交号 | 内容 |
|---|---|
| 本提交 | docs(audit-t3)：落 v2.5 交付包移交单（delivery-handover.md）— §1-§8 + owner 拍板登记 + 签字栏 |

**预估成本(¥)**：¥0（纯静态/文档治理；移交动作仅 cp + sha256sum 验证）。