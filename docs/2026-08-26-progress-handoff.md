# 进度交接 2026-08-26（E241-E246——S5 平台适配器 + GitHub 解读 + S7 可执行 handler + S6 真实推送 CLI + 交付期文档 + v1.0 全量验收执行 + E247-E250 成熟度观测基建与累积通道 + E251 市场 Skill 安全输入通道）

> 当前分支：v0.2b｜本轮收口：E241（S5 QQ OneBot 11 真实适配器）、E242（GitHub 解读 Skill 升级）、
> E243（S7 可执行 handler——市场 Skill 执行链）、E244（S6 真实推送 CLI 装配）、E245（v1.0 交付期文档）、
> E246（v1.0 全量验收执行——未通过，条件③ 阻塞）、E247（成熟度观测基建）、E248（市场 Skill 自然语言路由收口）、E249（复用率口径校准）、E250（市场 Skill 累积通道）、E251（市场 Skill 安全输入通道）。
> 上一份交接见 `docs/2026-08-25-progress-handoff.md`。

## 今日已收口

1. **E242 GitHub 解读 Skill 升级**（v2.5 §3.2/§4.4/§6.1.2/§12.2/§12.5.1 补实现）：
   - `src/skills/github-reader/index.ts` 重写为 ExecutableSkill `createGithubReaderSkill()`：X.6 契约
     + L1 降级链（GitHub API → raw README/manifest → releases.atom/主页 → 显式「未获取（原因）」）
     + health_score 加权 + LLM 按《专业审阅协议 §一》合成（无 LLM/失败落结构化契约兜底）。
   - 契约与降级链借鉴 POC-C（已登记 `docs/borrowed-designs.md`）；迁移参考
     `docs/2026-08-26-pocc-github-analyze-migration.md`、需求解读
     `docs/2026-08-26-github-analysis-requirements.md`。
   - 路由改判：GitHub 链接 + 项目问句 → `github_analysis`（E242 规则，对齐 §6.1.2 API 优先）。
   - 证据：新增单测 15 条；真实冒烟 openworker 健康分 82（与 POC-C 口径一致）。
2. **E241 S5 真实平台适配器——QQ OneBot 11**（8/25 晚实现，本轮补验证/文档/提交收口）：
   - `ImChannel` 抽象 + `src/im/onebot/` 适配器 + `config.ts`/`run.ts`（`npm run im:dev` 复用同一
     pipeline）+ `im-gate` 授权 CLI + [P-123] `imMaxLength=500` 登记。
   - 证据：新增单测 14 条 + 集成 4 条真实 HTTP 协议端到端（INT-IM-001~004）。
3. **E243 S7 可执行 handler——市场 Skill 执行链**（E226 骨架补齐「真实执行」）：
   - `src/skills/market/runner.ts`（`MarketSkillRunner`）：store 状态校验 → 复验 manifest →
     command 权限门禁 → §10.1 沙箱 cwd（`sandbox/market-skills/<name>`）内逐条执行 steps+verify：
     §10.2 命令白名单（拒绝即中止 + 自动审计）、`spawnSync` shell:false、timeout 按 kind
     （[P-38]/[P-39]/[P-40]）、stdout/stderr 4KB 有界截断。
   - CLI 入口 `npm run skill:market:run -- <name>|--list`（`scripts/market-run.ts`）。
   - 证据：新增单测 12 条 + 集成 3 条真实 git 命令端到端（INT-MARKET-001~003）；真实冒烟
     `skill:market:run -- smoke-check` 沙箱内执行 git steps+verify 全 ok（冒烟后清理）。
   - 计划文档 `docs/plans/2026-08-26-s7-market-skill-runner.md` 已收口。
4. **E244 S6 真实推送——CLI 装配 + 库加固**（E225 库级骨架接真实 CLI，按 E240/E241 同款流程）：
   - `src/repo/cli.ts` 编排：`repo:push`（`--dry-run` 只读计划 / `--yes` 真实推送，参数校验拒绝
     非法 host/仓库标识/scope）、`repo:whitelist`（authorize/revoke/list）、`repo:audit`（--limit 倒序）；
   - 薄壳 `scripts/repo-*.ts` + `npm run repo:push|repo:whitelist|repo:audit`；
   - PushService 加固两处真实边界：`cwd` 可注入 + `git add` 只添加存在的项目前缀（新仓库
     缺失 pathspec 不再硬失败）；plan 分支名归一（本机 git 实测 `symbolic-ref --short HEAD` 返回
     `heads/v0.2b`，剥前缀对齐 push-to-hosts）。
   - 证据：新增单测 14 条 + 集成 4 条真实 git 端到端（INT-REPO-001~004，本地裸仓库远程）；
     真实冒烟 `repo:push --dry-run` 输出变更清单/分支 v0.2b/未授权提示。
   - 计划文档 `docs/plans/2026-08-26-v1-s6-push-cli.md` 已收口。
5. **E245 v1.0 交付期文档四件套**（P-10 owner 签认输入物，快照不预置结论）：
   - `docs/reports/security-audit-v1.md`：§10.4 用例清单 7 项逐条映射（6 项独立测试证据 + 1 项读侧
     共用证据无独立断言，诚实登记缺口）+ MCP/IM/repo/market 真实接入面安全证据盘点；
   - `docs/reports/privacy-data-processing-v1.md`：数据分类与本地落盘、外发最小化（§10.3）、token
     边界、用户控制权（记忆遗忘/仓库授权/反馈）；
   - `docs/reports/user-manual-v1.md`：CLI/gateway/桌面壳/UI 入口、三栏交互（§4.1）、证据链与反馈
     （§9）、Skill 与斜杠命令、记忆管理、代码托管与市场 Skill CLI、IM 通道；
   - `docs/reports/maturity-assessment-v1.md`：§12.4 五维指标客观评分——L1 熟练达成，L2 缺口
     （用户累积 Skill 0/验收样本无/复用率未达），L1→L2 ≈35-40% 与交接快照一致；
   - `docs/reports/architecture-design-final-v1.md`：整合 docs/architecture/* + ADR-0001/0002。
   - 登记：documentation-map 第四组 #1/#2/#7/#10/#14 转 ✅；需求附录 A E245；code-directory/
     directory-structure 补 `docs/reports/`；计划文档 `docs/plans/2026-08-26-v1-delivery-docs.md`。
6. E241-E245 均已提交 v0.2b（单一主题分开提交）：E241 = `00b30d3`、E242 = `f23d1f3`、E243 = `ba7694f`、
   E244 = `d706062`、E245 = `9108935`；计划文档结果段已同步。
7. **E246 v1.0 全量验收执行**（[P-10] 五条件集，owner 已签认条件⑤）：
   - 判定：条件①/②/④/⑤ ✅、**条件③（成熟度 §12.4 L2+）❌** → P-10 **验收未通过**，注册表维持
     provisional@2026-08-24；条件③ 需真实使用累积（Skill 50+/验收样本/复用率）后按 E197 复验门重跑；
   - 提交：`5113ba6`（E246）；证据：验收报告 `docs/reports/v1-acceptance-report-2026-08-26.md`、计划
     `docs/plans/2026-08-26-v1-acceptance-run.md`、需求附录 A E246；
   - live 复核注记：今日 `classify:smoke` 1750ms 预算 5/10、5000ms 预算 6/10，为 light 模型（deepseek-chat）
     provider 延迟（1.4-8s/次）触发降级，非代码回归，[P-04] 维持 provisional 待重采样本；
     Tavily 月配额耗尽（432），P-12 三引擎复跑留 9 月重置后执行（备忘不变）。
8. 全量验证：单测 866/867（1 skip）+ 集成 29/29；doc-lint 0 FAIL 0 WARN（E245 纯文档批次已含；
   E241-E244 代码批次 build/test 全绿；E246 复跑后仍 0 FAIL 0 WARN）。

9. **E247 成熟度观测基建**（[P-25] 轻量自检落地）：
   - `src/maturity/metrics.ts`（`computeMaturityMetrics` 纯函数 + L0-L3 判定；判据 §12.4：Skill 50+/通过率 80%+/复用率 60%+，预置不计数；通过率 = accept/(accept+reject+correct)，n≥30 才正式判定）+ `scripts/maturity-check.ts`（`npm run maturity:check [--json]`）。
   - 实测基线：等级 L1；预置 15/24 有使用；用户累积 Skill 0/50+；通过率 73.9%（17/23，n=23，pipeline-only）；复用率观察 16.6%（118 Skill / 709 回答事件）；缺口 4 条即 P-10 条件③ 解锁路径。
   - 证据：新增单测 6 条；计划文档 `docs/plans/2026-08-26-maturity-obs-infra.md`；需求附录 A E247。
10. **E248 市场 Skill 自然语言路由收口**（E243 遗留）：
    - `src/skills/market/nl-router.ts`（`matchInstalledSkillTrigger` 最长触发词优先 + `renderMarketSkillAnswer` 有界渲染）、`runner.ts` 加 `listInstalledWithTriggers()`；pipeline 新增 `marketSkillRunner` 注入点，安全/专用意图短路后命中触发词 → 直连执行并记 kind=market_trigger 轨迹；未命中/未安装不影响原路由。
    - 证据：新增单测 11 条（nl-router 8 + pipeline 3）；需求附录 A E248。
11. Phase 0 提交（v0.2b 单一主题分开提交）：E248 = `14cfad2`、E247 = `dd3779a`、文档批 = `ad9c914`。
12. Phase 0 全量验证：单测 883/884（1 skip）+ 集成 29/29；doc-lint 0 FAIL 0 WARN；`npm run maturity:check` 实测 L1。

13. **E249 复用率口径校准**：`countReuseEvents` 纯函数（direct + market_trigger 计入、injected 不计入）；`maturity:check` 改用；缺口文案移除「待 E243 收口后校准」。新增单测 2 条；附录 A 登记 E249。
14. **E250 市场 Skill 累积通道**（Phase 1 启动）：`installFromLocalDir` 本地安装 + `npm run skill:market:install -- --source <dir> --yes`；E248 生产接线（CLI/gateway 注入 `marketSkillRunner`）；E243 残留修复（Windows .cmd shim 经安全守卫 `isCmdSafeCommandLine` 走 `cmd.exe /d /s /c`）；首批精选包 `configs/market-skills/{doc-lint,build-check,skill-inventory,git-status}` 安装并执行全 ok。新增单测 4 条 + 集成 1 条（INT-MARKET-004）；`maturity:check` 用户累积 Skill 0→4；累积路径 Phase 1.2 改为市场安装通道（修正 `install:skill` 预置注册错配）。
15. **E251 市场 Skill 安全输入通道**（Phase 1 续）：manifest 声明 `input:'query'` → `MarketSkillRunner.run(name, { input })` 把查询（有界 4KB）写入沙箱 `input.txt`，步骤 `@input` 替换为文件路径（用户文本不进命令行，无注入面）；pipeline 直连传 `{ input: prepared.cleanQuery }`；CLI `--query` 带参；首个带参精选包 route-query（意图路由判题）安装并冒烟成功。新增单测 7 条 + 集成 1 条（INT-MARKET-005）；`sandbox/` 入 `.gitignore`。
16. Phase 1 提交：E249 = `78c83c2`、E250 = `0df0307`、文档批 = `ed16181`、bench housekeeping = `1103373`；E251 代码批 = `3383c5c`、E251 文档批 = `0bfa36b`、交接批 = 回填提交号。
17. Phase 1 全量验证：单测 896/897（1 skip，含 E251 新增 7 条）+ 集成 31/31（含 INT-MARKET-005）；doc-lint 0 FAIL 0 WARN；4 个精选 Skill + route-query 带参 Skill `skill:market:run` 全 ok。

## 下一步（按优先级）

1. **P-10 转定稿（条件③ 阻塞）**：v1.0 全量验收已执行（E246，owner 已签认条件⑤），条件①/②/④/⑤ ✅，
   唯一阻塞 = 成熟度 §12.4 L2+（当前 L1，L1→L2 ≈35-40%）。
2. **真实使用累积（解锁条件③）**：可执行清单见 `docs/plans/2026-08-26-maturity-accumulation-path.md`（Phase 1 启动后基线：用户 Skill 4/50+（E250 首批）、通过率 73.9%（17/23，n=23，正式判定需 n≥30）、复用率 16.6%（E249 校准口径））；每周沉淀 3-5 个走 `skill:market:install`（E250 通道已就绪；带参高频场景如 datasheet/BOM/文档类可直接用 E251 输入通道固化为 Skill：`input:'query'` + `@input`），达标后按 E197 复验门重跑 P-10。
3. ~~市场 Skill 自然语言路由~~ 已收口（E248：nl-router 触发词直连进 pipeline，未动意图枚举）；复用率观察自此计入直连派发。
4. **GitHub 解读 Phase 2**（非阻塞）：L2 联网补充（Issues/社区口碑）、X.7 记忆/工程栏联动。
5. **Tavily 9 月复核（备忘）**：9 月重置后跑 `npm run tavily:smoke`，核对 [P-64] 计费口径；
   E237 残留兜底（ET20+ET14、SM02、SM31）届时一并复核。
6. 用户实测：GitHub 仓库 URL 问答（E242）+ `npm run skill:market:run -- <已装 Skill>`（E243）
   + `npm run repo:push -- --dry-run` / 授权后 `--yes` 真实推送（E244，token 从环境变量注入）。

## 总进度快照

- v0.2b 里程碑 ≈96%：S1-S8 切片 + 真实接入（E240/E241/E243/E244）+ 交付期文档（E245）全收口，
  v1.0 全量验收 [P-10] 已执行（E246）：条件①/②/④/⑤ ✅、条件③（成熟度 L2+）未达成 → 验收未通过，
  P-10 维持 provisional@2026-08-24，阻塞项 = 真实使用累积；GitHub 解读（E242）属 v2.5 既有需求补实现，
  不影响里程碑口径。
  Phase 0 成熟度观测基建（E247/E248）已收口：`npm run maturity:check` 实测 L1，条件③ 解锁路径 = 真实使用累积节奏（见累积路径清单）。
  Phase 1 已启动（E249/E250）：复用率口径校准完成；市场 Skill 本地安装通道 + 生产接线就绪（E250），E251 再补安全输入通道（带参 Skill 可沉淀），用户累积 Skill 0→4，条件③ 缺口 = 46 个真实 Skill 与真实使用节奏。
- 能力成熟度 L1→L2 ≈35-40%，无变化（需真实使用累积，§12.4 判据）。
