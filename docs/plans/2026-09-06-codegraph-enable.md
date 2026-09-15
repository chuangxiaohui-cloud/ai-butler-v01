# 推进计划：CodeGraph 接入 AI-Butler（代码影响分析 executor，E353）

> 日期：2026-09-06 · 分支：v0.2b · 状态：已完成
> 关联：owner「我的电脑已装 CodeGraph，现在看要不要集成进 AI-Butler、怎么用起来更好」；Archify 另见 `docs/plans/2026-09-06-archify-skill.md`。
> 范围澄清（owner 2026-09-06）：`审计交付/` 是第三方厂商的审计交付物，仅后续开发完成后再参考 —— 本计划不修改、不忽略、不关联该目录；执行中若发现索引噪音只记录并回报，不擅自处理。
> 需求落点：`一人公司AI-Agent需求文档_v2.5.md` 已把 CodeGraph 列为 P2 记忆资产（代码符号、调用关系与影响路径；场景「嵌入式固件改一个函数会影响哪些模块」，项目协作模式）。

## 结论：要不要集成 / 怎么用更好

要集成，但以「确定性 executor」方式接入，而不是把 CodeGraph 揉进搜索/问答管道：

- 本机已装 `@colbymchenry/codegraph` v1.0.1（100% 本地、SQLite、零配置），作为 AI-Butler 的只读本地工具最划算：¥0、无外部依赖、结果可审计。
- 产品内直接调 CLI（`explore`/`node`/`impact`/`callers`，`--json` 优先）优于接 MCP：AI-Butler 是「路由 + executor」架构，CLI 子进程更可控、可单测、可审计；MCP 留给将来 agentic 子 Agent（`src/mcp/`）时再考虑透传。
- 分层落地：
  - **L1（本次）**：新增 Skill `codegraph`（只读 executor，工程开发/系统架构师 lens），解决「改 X 影响什么 / 谁调用 X / X 的调用链 / 符号定位」类问题。
  - **L2（后续，本次不做）**：打开项目自动 `init`+增量 watch、目录选择器、「affected 测试文件」用例。避免一次改动面过大。

## 目标

新增产品 Skill `codegraph`：把项目协作模式下的「代码影响分析/调用关系」提问路由到本机 codegraph CLI，输出本地证据（文件/行号/影响链）并满足 `answer()` 契约。只读、不需 confirm 卡；优先模板化输出保持 ¥0；索引缺失给可执行引导。同时宿主侧把 `M:\202608111` 的 CodeGraph 索引建起来，使 `AGENTS.md:21` 的「已启用」声明与实际一致（开发效率，非产品功能）。

## 待 owner 确认（执行前）

1. L1 executor 本次就做？（推荐做：P2 资产的最小价值闭环，改动面约为 pm-xmind 的 1/3、无 LLM 成本。）
2. 目标目录解析：产品当前无「活动项目」概念 → 默认顺序 = 提问显式路径 → `projects/` 下最近子项目；两者都没有则回复引导让用户给出目录。是否接受（本次不做 UI 目录选择器）？
3. 宿主侧（与产品无关，可独立拍板）：`codegraph init` 建 `M:\202608111` 索引（推荐）；`codegraph install -t codex` 把 MCP 接给 Codex 会写 `C:\Users\zhxh\.codex`（需审批、需重启会话），可延后到 L2。

## 计划

1. 能力基线：确认 1.0.1 对目标语言（TS/JS 及嵌入式 C/C++）支持，摸清 `explore`/`node`/`impact`/`callers` 的 `--json` 输出、退出码与错误文本；`codegraph init`（`M:\202608111`）建宿主索引，记录耗时与统计（`.codegraph/` 已被 .gitignore 排除）。
2. Skill `src/skills/codegraph-skill/`：`run.ts` 解析 query（目标目录/符号/文件）→ 前置检查（CLI 存在 + `codegraph status` 已 init，否则给 `codegraph init <dir>` 引导）→ 按意图映射子命令（explore=影响/调用链、node=符号详情、impact=改动影响、callers=谁调用）→ 本地 spawn CLI（`--json` 优先）→ 解析为结构化结果 `{ files[], symbols[], impacted[] }`；`index.ts` 暴露 `createCodegraphSkill`（注入 runner 便于单测 mock）。只读，不写盘、不进 confirm。
3. 意图/路由：`intent-feature.ts` 增 `codegraph_impact` + 触发词（影响分析/改动影响/谁调用/调用链/依赖分析/符号定位），守卫：句中含代码符号或文件路径才落，纯问句让位 QA；`routing-table.ts` 增 R_CODEGRAPH（lens system_architect / 工程开发，高 baseConfidence、无 confirm）；`executors.ts` 登记 available。
4. 注册与清单：registry EXECUTABLE_SKILLS 增 codegraph（预计计数 26→27，以 registry 断言为准）；`src/skills/README.md`、目录地图、`docs/code-directory.md` 同步。
5. 输出组装：模板化 answer（命中文件清单 + 一句话影响方向），默认不调 LLM（¥0）；确需自然语言总结时再评估一次小模型调用并记账。
6. 文档：附录 A 登记 E353（激活既有 P2 资产）；本计划补「结果」；当天 progress-handoff 加链接。
7. 宿主 MCP（可选项，待确认 3）：`codegraph install --print-config codex` 只读预览 → 批准后 `codegraph install -t codex -l global -y`；重启 Codex 会话后确认 `codegraph_explore`/`codegraph_node` 可见。

**验收标准**

- `npm run build` 绿；定向单测（query 解析/命令映射/前置检查/结果解析/路由/registry 计数）全绿；`npm run doc-lint` 0 FAIL 0 WARN；不自主跑 test:all/bench（成本纪律）。
- 手动（owner）：仓库 src 已 init 后问「改 `src/agent/router-v2.ts` 会影响哪些模块」→ 工程开发/架构师回复带文件证据；对未 init 目录提问 → 返回 `codegraph init <dir>` 引导；全程无 confirm 卡。
- 宿主：`codegraph status` = Initialized；`explore` 命中 `src/agent/`；若 `审计交付/` 等出现命中噪音 → 记入本计划「遇到的问题」并回报 owner，不擅自处理。

## 执行过程

### 改动

- `src/skills/codegraph/index.ts`（新）：只读 executor——query 解析（目标目录/符号/模式）、
  `codegraph status` 前置检查（未 init / CLI 缺失给引导）、explore/impact/callers/callees/node
  子命令映射、剥 ANSI、截断输出；runner DI（默认 spawn 本机 CLI，win 走 shell shim）。
- `src/agent/intent-feature.ts`：ACTION_TYPES 增 `codegraph_impact`；触发词规则（改…影响/谁调用/
  调用链/解读项目…）+ 双守卫（无代码语境泛问句、概念咨询问句 → qa/web_search）。
- `src/agent/routing-table.ts`：R_CODEGRAPH（lens architect、executor codegraph、searchNeed=false、
  strict）；`src/agent/executors.ts` 登记 `codegraph: available`。
- `src/skills/registry.ts` + `registry.test.ts`：注册 codegraph，计数 25→26；README 加行。
- `src/search/pipeline.ts`：codegraph 走 originalQuery（目录路径不被 Stage 1 清洗）。
- 测试：`src/skills/codegraph/index.test.ts` 7 条 + `src/agent/router-v2-codegraph.test.ts` 5 条。
- 文档：附录 A E353；borrowed-designs 2.11；code-directory Skill 目录 24→25；本计划；当日 handoff。

### 遇到的问题

- 触发词误伤两例：①「改天去广州玩会影响什么」——`改`+任意 20 字+`影响` 过宽，
  改白名单动词（改了/修改/调整…）去掉裸「改」；②「解读一下 M:\xxx 项目」中路径隔断
  READ 正则——中间改容错 `[^。；\n]{0,28}?`。均在 router-v2-codegraph 正反例钉死。
- 宿主 `codegraph init`（M:\202608111）扫描 1.2w+ 文件解析慢（含非忽略的审计交付副本），
  已在后台继续；按 owner 边界不修改/不忽略该目录，仅记录现象。

## 结果

- 验证：`npm run build` 绿；定向单测 27/27（codegraph 7 + router-v2-codegraph 5 +
  registry/confirm-gate/router-v2-xmind 回归）；`npm run doc-lint` 0 FAIL 0 WARN。
- 能力：问「改 X 会影响哪些模块 / 谁调用 X / X 调用链 / 解读项目」→ 只读直连本机
  codegraph 本地索引返回证据（文件/行号），无 confirm 卡、¥0；目录未 init 给引导。
- 测试：单测 27/27；全量 test:all/bench 未跑（成本纪律）。
- 提交：未提交（并入现有待统一批次）。
- 遗留：宿主索引建完后手动复验（对已 init 工程问影响/调用）；Archify（E352）下一轮开工。
