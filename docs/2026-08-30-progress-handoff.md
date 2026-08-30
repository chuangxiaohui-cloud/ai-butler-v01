# 进度交接 2026-08-30（GitHub 解读收尾 + 成本归因 + 审计材料 + 提交收口 + 审计 T+3 推进）

> 当前分支：v0.2b｜本轮收口：GitHub 解读闭环；17.65 元成本归因；审计材料清单；E275-E285 提交收口；审计 T+3 交付物 5/5 + E286/E287/E288 落地。
> 上一份交接见 `docs/2026-08-29-progress-handoff.md`。上一份只读核对结论：E275-E284 工作区大量未提交改动，提交前需 doc-lint + test:all 全绿。

## 今日已收口

### 1. GitHub 解读收尾（E283/E284 闭环核对，只读）

- **核对结论**：代码与文档一致，无残留缺口。
  - E283：`src/search/llm.ts` `createSkillCompleteClient`（github-reader → medium v4-flash + `[P-122]` 90s 预算）；`src/skills/deps.ts` `completeForSkill` 按名解析；`pipeline.ts` direct-skill 统一 `withStreamingToken`（onToken 可选）；main/gateway/im 三入口接线；市场通道 `github-project.ts` 同档。
  - E284：`src/skills/github-reader/cache.ts`（`SqliteGithubApiCache` + `createGithubApiCache()` 单例，`GITHUB_CACHE_DB_PATH` 或 `data/github-api-cache.db`）；`SkillDeps.httpCache` 可选注入；`httpGetJson` 仅成功 JSON.parse 后写缓存；raw README/manifest 不缓存；`params.ts` `P-142`=300000ms。
  - 文档登记：三份计划文档（readme-content / synthesis-speed / http-cache）、handoff 速度九轮、附录 A E283/E284、§5 P-142 全部一致；目录地图按 `src/skills/*/` 泛化登记，无需改动。
  - 验证状态（上轮已验，本轮未重跑）：build 绿；cache 4/4、github-reader 22/22、pipeline 53/53、llm 8/8、github-project 4/4；test:all 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN（C8 65 key）。
- **残余**：E284 缓存复测待用户（同一仓库二次 fetchMs 应回落 ~1-2s、答案数据不变）；市场通道 github-project 未接缓存（默认结构化模板路径，后续项）。

### 2. 17.65 元 token 成本归因（用户疑问：github 解读烧钱 vs Codex 配置）

- **数据来源**：`data/usage.jsonl`（项目管道调用）+ `~/.codex/state_5.sqlite threads.tokens_used`（Codex 自身）+ `~/.codex/config.toml`（Codex 模型配置）。
- **结论**：
  1. **主因是 Codex 自身调试会话，不是 github 解读功能**。`~/.codex/config.toml`：`model_provider=custom`、`model=deepseek-v4-flash`、`base_url=https://api.deepseek.com/v1`——本助手每次回合都打到 DeepSeek 账户，长线程每回合全量重发上下文。08-29 三个 Codex 线程 `tokens_used`：952881fb（E280/Q2 预算决策）63.5M、116de832（148s 优化）5.3M、356e36e7（github 调试主线程，截至 08-30 00:08 北京）40.4M，合计 ≈ **1.09 亿 token**。17.65 元 ÷ 1.09 亿 ≈ 0.16 元/百万 token 混合单价，与 flash 档定价量级吻合——账单主要来自 Codex 会话本身。
  2. **github 功能本身极便宜**：usage.jsonl 实证每轮复测 = 1 次 MiniMax 分类（p≈1450/c=200）+ 1 次 DeepSeek 合成。08-29 九轮 github 复测窗口：DeepSeek ≈ 4.5 万 token（v4-pro 6 次 p=12.9k/c=19.6k + v4-flash 3 次 p=8.1k/c=4.5k）+ MiniMax 分类 ≈ 1.5 万 token。按 0.16 元/百万反推全天 github 功能 < 0.1 元。
  3. 已修复的浪费项（github 侧）：heavy 档 v4-pro 隐藏 think 块（output 一半烧在推理）→ E283 切 v4-flash；18s 截断触发模板兜底重试 → 修订为 `[P-122]` 90s；E284 缓存减少 GitHub API 重试与限流。
- **建议**：
  1. 到 api.deepseek.com 用量页核对 08-29 明细（确认 17.65 元口径与模型分布）；MiniMax 控制台核对分类器费用（另账）。
  2. Codex 侧省钱：若用户有 ChatGPT 订阅，Codex 主模型可换订阅内模型，DeepSeek 账户只留给项目管道；或降低 `model_reasoning_effort`（当前 medium）、长任务及时 `/compact` 或新开任务、避免长线程多轮调试。
  3. 单次 github 解读 ≈ 1.5 万-2 万 token（分类+合成各一次），属功能固有成本，无需再优化。

### 3. 第三方审计材料清单（基于 `docs/audit-navigation.md`）

- 入口三件套：README.md、AGENTS.md、`docs/audit-navigation.md`（建议目录→真实路径 / 文档 / 测试 / 快速入口四表）。
- 需求与宪法：`一人公司AI-Agent需求文档_v2.5.md`（§0 文档宪法、§5 PARAM 注册表、§6 管道、附录 A E-NN 变更台账、附录 D 采购台账）。
- 架构与设计：`docs/architecture/*`（system-architecture / module-dataflow / module-dependencies / deployment / interface-contract）、`docs/adrs/0001-architecture-foundation.md`、`docs/design/*`（search-pipeline / intent-routing / memory-system / security-model / skill-registry / param-registry / ui-interaction）。
- 工程与运维：`docs/engineering/*`（api / database-schema / environment-config / testing-strategy）、`docs/code-directory.md`、`docs/directory-structure.md`。
- 验收证据：`bench/`（devil-v25 基线 + B-20260828/29 报告）、`docs/reports/architecture-review-2026-08-29.md`、最新 progress-handoff（注明未提交工作区）。
- 运行验证：`npm run build` / `npm run test:all` / `npm run doc-lint` / `npm run gateway` / `npm run desktop:smoke`；`.env.example`（脱敏）。
- 已知缺口（诚实声明）：无独立 E2E 套件、OpenAPI 待生成、memory-core 为外部依赖、UI 组件未拆分等（audit-navigation 🔨 标记处）。
- 已落盘：`docs/audit-package-checklist.md` v2.5（装箱单 + 审阅路线：§0 资质自证 / §3.1 架构可视化验证（CodeGraph 辅助 + 人工复核）/ §5.1 PARAM 对齐 / §6.1 冒烟通过标准（『可用』判定锚定 §4.2+§6.1.3+§6.5+§6.6）/ §7 AI 代码特异性必查（分层抽样 20 条）/ §9 结论置信度 / §10 交付前收口·提交前检查清单 / §11 打包建议）；已登记 `docs/code-directory.md` 与 `docs/documentation-map.md`（四·17）。打包交付 ZIP 待用户决定。

### 4. 提交前收口完成（E275-E285，2026-08-30）

已按 `docs/audit-package-checklist.md` §10 执行：doc-lint 0 FAIL + build 通过 + 单测 1120/1121 + 集成 32/32 全绿后分批提交 6 笔：

| 提交号 | 内容 |
|---|---|
| `c4b3e5b` | E283+E284：GitHub 解读收口（合成切 v4-flash + P-122 90s + API 缓存 + 管道/三入口接线） |
| `e33e2c2` | R-1：Stage 2 规则③预检 + 安全 TDD + 运行时看护/数值模式新模块 |
| `12641a4` | E285：审计 R-2 文档治理（P-95~P-104 补登 + P-128 定稿 + doc-lint 预算 170）+ 审计材料包 v2.5 |
| `7171ba5` | E275-E285 文档同步（交接/计划/基准/目录地图）+ .gitignore 忽略 .claude/.omc |
| `9c0e52c` | R-1 补 T+3 规则③预检端到端测试 |
| `48e31bd` | T+3 交付物 1/5：PARAM 抽样 30 条核对报告（新发现 R-7：P-85/P-86 数值双处存储） |

未提交残余仅剩：参考项目/工作文档（AI-Butler、OpenHands、docx/xls/pdf、旧版需求文档 v1.9-v2.3、文档/ 副本）与误创建文件 `undefined`（不提交）。

### 5. 审计 T+3 推进完成（2026-08-30 下午，E286/E287/E288 + 交付物 5/5）

| 提交号 | 内容 |
|---|---|
| `c6d1b57` | E286：R-7 修复——[P-85]/[P-86] 迁入 params.ts 单一来源（删 search-loop 硬编码，C8 67 key） |
| `519bcbe` | E287：R-5 评估——§6.6 分领域阈值暂不新增 P-NN，改契约化注释 |
| `d8e524f` | E288：[P-04] 临时上调 2500ms（provider 抖动期）——classify:smoke 复跑 8/10 达标，转 provisional@2026-08-30 + bench:B-20260830-01 |
| `f343793` | T+3 交付物 2+5/5（smoke-e2e / r5-evaluation）+ R-3 方案 A 落地（.gitignore 增补 11 参考目录）+ 审计报告状态同步 |
| `4a9565b` | R-3 Plan A 落地：`.gitignore` 增补 11 个参考项目目录（双重忽略条目 line 85-96）|
| `e91e6ba` | R-3 Plan B：benchmarks/ 黄标结论（一次性验证产物，不入库）|
| `3708ce3` | R-3 完整决策记录归档（含 11 项目忽略 + benchmarks 结论 + 验证锚点）|

- **T+3 交付物 5/5 全部完成**：param-sample-30（48e31bd）/ smoke-e2e-report / r1-regression / r3-codegraph / r5-evaluation（f343793 收口）。
- **T+3 周期收口报告**（2026-09-01）：`docs/audit-t3/closure-report.md`（周期收口 + 5 项交付物状态 + 3 项 owner 拍板 + E285~E289 changelog + bench 基准保护 + 残余项与下一阶段候选）。
- **R-1 双问题闭环**：S02/L05 → rule 0ms 硬拦截（安全场景）；[P-04] 1750→2500ms 后 classify 5/10→8/10 达标（性能瓶颈）。[P-04] 现为 provisional@2026-08-30 临时值，provider 恢复后按 E1 复验门回退。**正式决策记录**：`docs/audit/decisions-R1.md`（决策人：老张，状态 provisional，选项 A 维持 2500ms）。
- **R-3 方案 A 已执行**：11 个参考项目目录（AI-Butler/OpenHands/Tavily+AnySearch+Bocha/openocta/opensquilla/openworker/v3/crm/benchmarks/deepseek-harness/agent-skills）加入 .gitignore，git status 噪音从 120→26 项。**正式决策记录**：`docs/audit/decisions-R3.md`（Plan A 提交 `4a9565b` + Plan B benchmarks 提交 `e91e6ba` + 完整决策记录 `3708ce3` + 终端验证截图 `R3-terminal-proof.png`）。
- **R-5 结论**：暂不新增分领域 P-NN（applyRule3 已覆盖 drug/tax/regulation/statistics 4 类），候选 P-148~P-150 列 v2.6+ 可选能力。
- **并发会话发现**：2:50 前后另一会话生成了 r5-evaluation.md / smoke-e2e-report.md 并更新审计报告 T+3 状态，已审阅并入账（无冲突）。

### 6. 24 项 Skill §10 信任域审查（2026-08-30 下午）

- **核对范围**：`src/skills/registry.ts` 24 项（5 Legacy + 19 Executable）+ `src/skills/market/` 4 模块；与 `一人公司AI-Agent需求文档_v2.5.md` §10.5 五源信任域 + `market/types.ts` 5 类权限交叉对账。
- **结论**：✅ 全部 Skill 落入 5 源信任域矩阵，无第六域穿透，无直接命令注入面。
- **已落地防御**（5 项）：SkillDeps 依赖注入模式（19/19 Executable）；`project-writer`/`project-packager` §10.1 沙箱门 + logSandboxAudit；`mcp-agent` DANGEROUS_ARGS 默认拒绝（mode=kill）；`github-reader` URL 常量化（api.github.com/raw.githubusercontent.com/github.com）；Python 子进程路径全部 `fileURLToPath(import.meta.url)` 固定 + E251 input.txt 用户文本不入命令行。
- **6 项 v2.6+ 缺口候选**（P-148~P-153 候选）：①`office-daily` SMTP 发送双闸（HIGH，2-3h）；② 4 项写盘 Skill 加沙箱（MEDIUM，3-4h）；③`video-learner` ASR/B站域白名单（MEDIUM，1-2h）；④`browser-session` URL SSRF 过滤（MEDIUM，1-2h）；⑤`market/installer` 安装日志（LOW，1h）；⑥ `market/github-project` 接缓存（LOW，1h）。
- **交付物**：`docs/audit-t3/skill-trust-audit.md`（8 章节，含逐 Skill 矩阵 + 五源交叉表 + 修复路径成本估算）；交叉链接到 `architecture-audit-2026-08-30.md §11/§12` + `closure-report.md §6.2/§8`。
- **预估成本(¥)**：¥0（纯静态审计；6 项缺口 v2.6+ 候选落地预算 ¥0~¥50，全部纯代码治理）。

## 待办（2026-08-30 下午更新）

1. ✅ **owner 侧冒烟 4/7 已回填**（agent 按报告 §3 代跑，结果见 `docs/audit-t3/smoke-e2e-report.md` §6）：search 10/10 双引擎 PASS；tavily 触发 6/6 正确但 2026-08 月配额 1000/1000 耗尽（环境原因，9/1 重置后复跑）；desktop PASS（DESKTOP_READY + gateway 拉起，exit=0）；低置信 PASS（先修脚本健壮性：跳过无 result 的 error 条目，如 C06 github 超时条目）。复盘输出：总数 57 / 无证据 5 / 弱证据 5 / 平均<0.5 9 / 含官方源 6。
2. ✅ **E284 缓存复测完成**：deepseek-harness 同仓库连跑两次，fetchMs 9234.9ms → 2817.8ms（回落 3.3×），答案核心数据一致；未到 ~1-2s 因 commits `since` 按秒重算（每次 miss）+ raw 不缓存（设计内）。复测结果已写回计划文档 `docs/plans/2026-08-29-github-reader-http-cache.md`；证据 `e284-run1.json` / `e284-run2.json`（临时文件，已按确认清理）。
3. ✅ **审计 ZIP 打包（2026-08-30 下午收口）**：owner 确认后执行——先收口提交 4 笔（b6faf8b E289 / d3dbb07 审计回填 / dffac83 脚本修复 / 13c5134 交付包文件，test:all 1126/1127+32/32 + doc-lint 0/0 全绿），再打快照 tag `v0.2b-audit-2026-08-30`，交付 ZIP 基于该 tag（含 checklist/bench 证据/.env.example/运行说明/资质自证模板，排除 .env/data/dist/desktop 产物/参考项目）。复核收口：并发会话的 T+3 闭环文档（decisions-R1/R3、closure-report、skill-trust-audit）合入后重打 tag + 重打 ZIP。
4. ✅ **P-95~P-104 到期拍板（已晋升 E289）**：owner 2026-08-30 签认晋升——同批 20 项（P-82 / P-84~P-86 / P-89~P-104）§5 状态 provisional@2026-08-13 → 定稿，数值不变；附录 A E289 五条件对照 + C.4 证据登记 + 计划 docs/plans/2026-08-30-param-promote-route-batch.md；doc-lint 0 FAIL 0 WARN。08-13 批 provisional 债务清零；后续超期检查：09-09 P-105~P-107、09-21 P-10、09-25/26/27 08-28/29 批（P-132~P-142）。
5. ⏳ **[P-04] 回退**：2026-08-30 12:18 抽样（classify:smoke 单轮）6/10、4 条 LLM 调用超 2500ms（E06/E11/E14/E16 → 4465-4602ms），provider 抖动未平息 → **维持 provisional 2500ms，暂不回退**；待稳定窗口 n≥30 / 超时率≤10% / 准确率≥80% 后按 p95×1.2 重定稿。**9/1 实测 6/10 = 60%（不达 80% 验收线），4/8 LLM 调用 4.7-5.0s 残余抖动** → owner 拍板维持选项 A 2500ms（回退 1750ms 会触发 fallback 降级，服务可用性劣化更严重）。**代码落点勘误**：[P-04] 实际生效点 `src/search/llm-registry.ts:115` `resolveTimeoutMs()` light 档默认 2500ms（env `LLM_CLASSIFY_TIMEOUT_MS` + 函数默认两路），非 `src/config/params.ts`（[P-04] 非 PARAMS key）。详见 `docs/audit-t3/param-sample-30.md §3.4`。**待 9/2 复测**：若 ≥7/10 启动回退评估（选项 B）；按 E1 复验门达标后定稿回退 1750ms。
6. ✅ **误创建文件 `undefined` 已删除**（2026-08-30 下午，owner 确认；project-writer 工具日志，非源码非入库）。复核时（18:11）再次出现同源日志实例（753B，3 行），已再次删除。
7. 📌 **v2.6+ 候选**：P-148~P-150 分领域阈值（r5-evaluation.md 已登记，触发条件明确）；市场通道 github-project 接缓存（已列入计划文档遗留项）。两项均不阻塞 v2.5 交付，默认延后。