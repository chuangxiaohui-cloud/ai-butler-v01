# 进度交接 2026-08-29（E280 数值 predicate 原始查询判定 + 测量需求词帧 + E281 medium 合成预算 12s→18s）

> 当前分支：v0.2b｜本轮收口：E280（数值 predicate 原始查询判定一致性 + 测量需求词帧）+ E281（medium 合成预算 12s→18s；E277/E278/E279 同日已收口）。
> 上一份交接见 `docs/2026-08-28-progress-handoff.md`。

## 今日已收口

### E277 数值列举通用性钉死（用户拍板：市值只是症状，病根是数值列举型 query 的证据选择机制）

- **背景**：用户判断「延迟最低的数据库 / 价格最贵的显卡 / 评分最高的电影」会与市值 query 同样失败——`[P-ZZZ']` 的 predicate + 内容形态密度 + 覆盖度门控是对整类「哪几家最 X」的通用修复。核对代码：机制本体零领域词（`answer-readiness.ts` 疑问词表 / `fusion.ts` 任意数字密度 / `numeric-pattern.ts` 纯正则），但有两处「值」的领域化残留。
- **修复（按用户方案，②③→①）**：① `params.ts` P-137 补检索后缀 `' 亿元'` → `' 数据 参数 对比'`（领域中性触发词，量纲无关，非金融 query 不再被污染成金融检索）；② `numeric-pattern.ts` 单位表扩展为 金额+时间延迟+硬件+音视频+评分计数 五类（ms/毫秒/GHz/核/帧/fps/星/颗…，长单位优先 + 英文单位词边界）；③ 新增跨领域单测 6 处（numeric-pattern 5：数据库延迟 ms+后缀断言、CPU 核数、游戏帧率、商品评分、纯泛文反例；fusion 1：延迟页(ms) 密度加权高于同相关泛文）+ 更新既有 ms 断言 1 处。
- **证据**：目标 4 文件单测 41/41 绿；全量 `test:all` 绿（单测 + 集成 32/32）；doc-lint 0 FAIL 0 WARN（C8 61 key）。
- **登记**：附录 A E277；§5 P-137 行值同步（亿元→数据 参数 对比）；§6.5.6 措辞同步；计划文档 `docs/plans/2026-08-29-numeric-enumeration-generality.md`。
- **残余**：'个/条/项' 等高频通用量词计入密度可能轻微稀释区分度（护栏已压制，噪音出现可移出单位表）；延迟/价格/评分类 query 的真实管道端到端验证需手动 `npm run dev`（成本纪律不代跑）。

### E278 CLI 合成档位对齐（用户批准：默认 heavy→medium，消除 CLI 必现 synthesis_timeout）

- **根因（用户复测）**：`npm run dev -- "延迟最低的数据库有哪些"` 连续 3 次 `synthesis_timeout`（91s/97s/104s）——`src/main.ts` 硬编码 `createOptionalHeavyClient()`（v4-pro，[P-130] 30s），s5 在 `opts.llm` 存在时直接用该客户端，v4-pro 推理贴着 30s 红线，API 延迟一高即必超。与 E275/E277 的证据选择问题不同：这次是「合成压根没成功」。
- **修复（用户批准的一行）**：`llm.ts` 新增 `createOptionalMediumClient`；`main.ts` CLI 默认档改 medium（deepseek-v4-flash，[P-116] 12s），与 P-105/桌面端对齐；`pipeline.ts` 注释同步。
- **证据**：build 绿；llm 相关单测 22/22 绿；真实 CLI 重跑直接作答（gate=none，elapsed 49s，medium=v4-flash），答案含 Redis/MongoDB(内存模式)/TiDB/MySQL/KVStore/OceanBase 并诚实标注「无横向对比、无法断定最低」。
- **登记**：附录 A E278；计划文档 `docs/plans/2026-08-29-cli-default-tier-medium.md`。
- **残余**：medium 在当前 API 延迟下仍偶发撞 12s（E276 已记录）；若需更稳调 [P-116]（§5 变更，另行拍板）。

### E279 数值 predicate 主检索确定性增强（用户批准：主检索缺数据触发子查询是病根，judge 加硬上限）

- **判据（用户）**：① 合成通（gate=none）过 ② 答案缺具体延迟数值 不过 ③ predicate=numeric 过。定位：检索层没召回带数字的 benchmark 文档。
- **根因（轨迹实证）**：`data/trajectory.jsonl` 显示同 query 三次运行主检索 query 分别为「延迟最低的数据库 性能对比 / 低延迟数据库排名 / 裸 query」——分类器 LLM 每次改写不同。带「性能对比」时证据出现 22ms/6ms 对比文；裸 query 时全为泛文。P-137 补检索本轮不触发（证据有数字），且它是「证据完全无数字」安全网，救不了主检索。
- **修复（用户批准，含修订 A/B/C）**：① `query-rewrite.ts` numeric 分支确定性追加 `${query} 数据 参数 对比` 子查询（classifyPredicate 纯疑问词判定、零领域词，LLM 改写时规则子查询强制入队）；② `search-loop.ts` judge 数值感知——仅增强子查询在队且未超 [P-139] 上限时延迟判够，无 LLM 强制判不够保证至少跑一轮，超限接受当前证据；③ `numeric-pattern.ts` 单位表补 p50/p99/p999/TPS/QPS/IOPS 六项；修订 A=[P-139] 上限 2 轮；修订 B=用例 2 改「Redis 和 Memcached 哪个读取延迟更低」；修订 C=后缀零领域词硬约束（不用 benchmark/p99/ms）。
- **证据**：新增单测 10 处（rewrite 6 / search-loop 3 / numeric-pattern 1）；目标 3 文件 50/50 绿；全量单测 1084/1085（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 62 key）。
- **登记**：附录 A E279；§5 新增 [P-139] + [P-137] 行更新；§6.5.6 E279 段落；计划文档 `docs/plans/2026-08-29-numeric-main-rewrite.md`。
- **待用户复测**（e2e，成本纪律不代跑）：`npm run dev -- "延迟最低的数据库有哪些"` 期望证据/答案含 ms 级数值；`npm run dev -- "Redis 和 Memcached 哪个读取延迟更低"` 期望含双方数值+单位；`npm run dev -- "PostgreSQL 16 写入性能 benchmark"` 期望含 TPS/IOPS 数值。

### E280 数值 predicate 原始查询判定 + 测量需求词帧（用户批准：三项归因全部接受，Fix 1 直接做，决策 A/C 走选项 1）

- **背景**：E279 落地后用户 e2e 复测三条全挂、失败模式各不相同。B1 隐藏变体定位（用户确认真 bug）：s2 分类器把「Redis 和 Memcached 哪个读取延迟更低」改写成「读取延迟对比」（剥掉「哪个」），改写层 `ruleBasedRewrite` 用改写后串判 predicate 得 `other`，而输出层用 cleanQuery 判 `numeric`——同一次运行两个 predicate 的数据流不一致。Q3 `predicate: "other"` 实锤 benchmark 类 query 当时无测量需求词帧，机制未启动。Q1 `synthesis_timeout`（58s）是挡路石（检索已成功、合成 LLM 调用超时）。
- **修复（用户批准）**：① `query-rewrite.ts` `ruleBasedRewrite`/`rewriteQuery` 增 `originalQuery` 透传，numeric 分支 predicate 一律用原始 query 判定（`search-loop.ts` `hasNumericEnhancement` 同源）；② `answer-readiness.ts` 数字判定补测量需求词帧（benchmark/基准测试/跑分/压测/实测/性能测试/评测），两条硬约束：不含 延迟/价格/评分 等量纲词、定义类帧（什么是/定义/概念）显式排除；③ `pipeline.ts`+`trajectory-log.ts` 轨迹补记 `subQueries` 分层定位。决策 A 走选项 1（不调 [P-116]/[P-06]，附条件预批）；决策 C 走选项 1（零领域词 + 两条硬约束）。
- **证据**：新增单测 6 处（rewrite 3 / search-loop 1 / answer-readiness 2）；目标 4 文件 66/66 绿；全量单测 1090/1091（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN。e2e 复测（用户预批 4 次真实 CLI）：Q1 通过（gate=low_confidence、36s、答案含 DynamoDB 个位数毫秒级/S3 延迟降至 10%，subQueries 证实增强子查询已执行）；Q2 检索层生效（召回 Anton Putra 基准文、毫秒级数值进证据）但两次均 `synthesis_timeout`（38s/53s）卡 medium [P-116] 12s 预算；Q3 predicate 由 other 修复为 numeric（gate=none、54s）但检索仍无 PG16 TPS 实测（Tavily 配额耗尽为环境折扣）。
- **登记**：附录 A E280；§6.5.6 信号 B E280 段落；计划文档 `docs/plans/2026-08-29-numeric-original-query-predicate.md`。
- **转 E281**：Q2 合成阻塞已由 E281 拍板解决（[P-116]/[P-06] 12s→18s）；Q3 检索缺数据待 Tavily 配额恢复复测。

### E281 medium 合成预算 12s→18s（用户拍板：按审计 M5 调 [P-116]/[P-06]，heavy 30s 不动）

- **根因（探针 + usage 实证）**：Q2 两次 `synthesis_timeout` 均无合成 usage 记录，判定为 deepseek 未在 [P-116] 12s 内返回被总预算中止；同规模探针（deepseek 5048 / MiniMax 4450 prompt tokens，maxTokens 1500）deepseek-v4-flash 4.0/6.5/10.9s，MiniMax-M2.7 14.7s/25s abort——12s 对主链无抖动余量，MiniMax 兜底不可依赖。
- **修复（用户拍板）**：`src/config/params.ts` `[P-116]` 12000→18000ms；需求 §5 `[P-06]` 12s→18s、`[P-116]` 12000→18000ms；`[P-130]` heavy 30s 不变（保持分档语义，不直接调 30s）。
- **证据**：bench:B-20260829-01 探针报告；build 绿；llm-registry/llm/pipeline 相关单测 67/67 绿；全量 `test:all` 单测 + 集成 32/32 全绿（重跑确认 INT-MCP-001 恢复通过）；doc-lint 0 FAIL 0 WARN；Q2 e2e 用户已复测通过（gate=none、elapsed 64.7s、predicate=numeric，答案含 生产 1.2/1.8ms、压测 0.5ms（P95 0.7/P99 1.1ms）、Tech Insider 0.09/0.12ms）。
- **登记**：附录 A E281；§5 P-06/P-116 值同步；§6.7/§6.5.6 E281 说明；bench:B-20260829-01。
- **残余**：Q2 e2e 已通过；MiniMax 兜底仍可能超 18s（非主链）；`bench:devil-v25` 全量回归待跑。

### E282 运行时看门狗（用户选定：synthesis_timeout 环境噪音显式化，架构审阅 4.1）

- **背景**：8 月以来多次「单测全绿但用户实测翻车」，根因是 API 延迟波动 / bench 高频调用 / Tavily 配额耗尽三类环境噪音没有专门运行时观测；Q2 两次 `synthesis_timeout` 即典型。
- **修复（用户选定）**：新增 `src/maturity/runtime-watchdog.ts`，订阅 `data/trajectory.jsonl` 的 answer 事件，统计最近 [P-140] 窗口内 `synthesis_timeout` 占比，≥ [P-141] 阈值时经 pipeline `toolNotice` 告警（CLI/gateway 生产接线开启，测试默认关闭）；新增 [P-140]/[P-141] provisional 参数并同步 §5/附录 A E282。
- **证据**：runtime-watchdog 单测 7/7 绿；pipeline 单测 56/56 绿；gateway 单测 24/24 绿；build 绿；doc-lint 0 FAIL 0 WARN（C8 64 key）。
- **登记**：附录 A E282；§5 P-140/P-141；计划文档 `docs/plans/2026-08-29-runtime-watchdog.md`；目录文档同步。
- **残余**：告警当前仅进 `toolNotice`（未接邮件/状态栏持久化），观察后按需扩展；`bench:devil-v25` 全量回归待跑。

### 承诺清单表（架构审阅 4.3，纯文档）

- **变更**：`docs/architecture/system-architecture.md` 顶部新增「0. 承诺清单（宣称 vs 实际）」表，14 行对外承诺逐项标注 `✅ 已生产化 / 🟡 可切但默认未开 / 🔴 文档宣称但生产未跑 / 📋 设计阶段`，并附证据 E-NN/ADR；H6（三层路由 L2 接线）核实现状为 E227 已收口，不在本表新增待办。KnowledgeCore 未在仓库文档/需求中出现，未虚构承诺行。
- **证据**：纯文档变更；doc-lint 只验收需求文档，不受影响；无 §5/§6 参数或行为变更。
- **状态**：完成；「宣称 vs 实际」成为可视化工件，后续模块状态变化按表头纪律同步。

### M6 普通知识问答耗时纯读探针（B-20260829-02）

- **背景**：审阅 M6 登记的「普通知识问答 33-50s/次」未量化，用户指定先做纯读探针，不改参数不调 API。
- **落地**：新增 `scripts/probe-search-latency.ts`（只读），按 session 拆 route/search/synthesize/answer 阶段；结果落 `bench/B-20260829-02-search-latency-probe.md`。
- **结论（近 7 天 n=262）**：total p50 16.7s / p95 83.0s；search p50 1.33s / p95 46.3s；search→synth p50 11.9s / p95 26.1s；synth→answer p50 1ms。分引擎 stage p50 825ms / max 4.97s——provider 不是瓶颈。
- **瓶颈定位**：① 复杂数值/benchmark 查询 Stage 3 串行子搜索循环（5 条子查询 + 每条 LLM 改写/judge）；② search→synth（P0 二次取证 + Stage 5 合成 LLM，trajectory 当前无法再拆分）。
- **状态**：纯读探针完成；**下一步已落地**——trajectory 补 `secondPassMs`/`contentFetchMs`/`supplementMs`/`synthesisMs` 内部计时（`docs/plans/2026-08-29-trajectory-stage-timing.md`），待用户下次真实运行后复跑探针即可拆清 P0 fetch 与 Stage 5 合成；之后再由用户拍板优化方向（如子搜索并行/限轮、P0 取证数量），均不改参数。

### M7 安全 TDD §10.4 命令白名单硬编码拒绝补齐

- **背景**：架构审阅 2.5/M7 指出 §10.4 硬编码拒绝覆盖缺口——`del /S /Q` 规则在位但测试无显式断言；`powershell -enc` 与 `node -e` 在 `command-whitelist.ts` 仅因不在白名单被动拒绝，未形成显式硬拒绝与测试证据。
- **修复（最小面）**：`command-whitelist.ts` HARD_REJECTS 新增 PowerShell `-enc/-EncodedCommand` 与 `node -e/--eval` 两条显式规则；测试补 `del /S /Q`、`powershell -enc`、`node -e` 断言（含 reason）；`sandbox.test.ts` 补 §10.4 读 `~/.ssh/id_rsa` 独立断言。gateway `terminal.ts`/`app.ts` 未动，`node -e` 解释器通道“白名单显式放行”语义保持不变。
- **证据**：build 绿；`node --test dist/security/command-whitelist.test.js` 5/5 绿 + `dist/security/sandbox.test.js` 8/8 绿；doc-lint 0 FAIL 0 WARN（C8 64 key）。
- **登记**：计划 `docs/plans/2026-08-29-security-tdd-hard-reject.md`；`docs/design/security-model.md` 硬编码拒绝状态与待补清单同步。
- **残余**：无（§10.4 命令白名单与读侧越界用例已全量覆盖）。

### GitHub 解读 CLI 路由与输出修复（P1-P3）

- **背景**：用户复测 `npm run dev -- "https://github.com/openclaw/openclaw 这项目是做什么用的？"` 被市场 Skill `github-project` 触发词 `github.com` 截走，输出嵌套 JSON、顶层 evidence 为空且「深度 LLM 合成未接入」；README Quick Start 的 ```bash fence 污染 usage。
- **修复**：① pipeline 市场 Skill 拦截排除 `github_analysis`（E242 主链路优先）；② `scripts/market-github-project.ts` 成功时输出可读 answer、`nl-router.ts` render 剥离 npm 横幅；③ github-reader `sectionContent` 跳过 ```/~~~ fence 行。
- **证据**：build 绿；pipeline 50/50、nl-router 9/9、github-reader 16/16（各新增 1 条）；doc-lint 0 FAIL 0 WARN（C8 64 key）。
- **登记**：计划 `docs/plans/2026-08-29-github-market-route-render-fix.md`。
- **残余**：真实 e2e 复测待用户手动跑；market github-project 独立调用仍可通过 `npm run skill:market:run -- github-project --query ...` 走无 LLM 通道。

### GitHub 解读质量修复（P0-P3：confidence/evidence/截断/计时）

- **背景**：用户复测确认上一轮 L1 解析生效，但暴露 4 个新问题：confidence 0.495 与权威报告语气不匹配、61.5s 稳定慢、答案截断、顶层 evidence 为空。
- **修复**：① pipeline direct skill 分支改用 skill 自身 confidence，透传 evidence，≤0.6 时答案开头注入醒目声明；② github-reader LLM 开启 `rejectOnTruncate`，截断重试 3200 tokens 否则落结构化兜底；③ confidence 按核心维度完整度计算，prompt 在低置信/字段缺失时禁用断言式措辞；④ `performance.now()` 埋点 `totalMs/fetchMs/synthesisMs` 写入 trajectory skill 事件。
- **证据**：build 绿；pipeline 52/52、github-reader 18/18、github-project 4/4；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-quality-confidence-timing.md`。
- **残余**：真实 e2e 复测待用户手动跑；61.5s 的 fetch/synth 拆分待轨迹数据确认。

### GitHub 解读质量二轮（真实复测归因 + 计时输出）

- **背景**：用户复测 184.7s 且答案退回 L1 键值对，输出 JSON 无计时字段；轨迹实证 `durationMs=177.7s`、`fetchMs=59.6s`、`synthesisMs=0`——格式退化是 LLM 合成失败落 `buildPlainAnswer`，不是 confidence 分支切换。
- **根因**：① `synthesisMs` 只在 LLM 成功后赋值，失败时长/错误被吞；② 上轮「截断重试」二次烧 P-122 的 90s 预算，177.7-59.6≈118s 与「首调截断 + 90s 重试超时」吻合。
- **修复**：① `AnswerResult` 新增可选 `timing`（`totalMs/fetchMs/synthesisMs/synthesisError`）透传 CLI 输出；② github-reader 成功与失败路径都记录 `synthesisMs`，失败原因进 `synthesisError`；③ 截断策略改单次 3200 + `rejectOnTruncate`，截断/失败直接兜底，不再二次调用；④ GitHub API 元数据与 manifest 探测并行化；⑤ pipeline 低置信声明补充“叠加不替换”测试。
- **证据**：build 绿；pipeline 52/52、github-reader 17/17、github-project 4/4；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-quality-confidence-timing.md` 追加二轮结果。
- **残余**：`fetchMs=59.6s` 是独立瓶颈，下一步并行化 GitHub API / manifest 探测或加缓存；真实 e2e 复测待用户手动跑。

### GitHub 解读质量三轮（429 归因 + Markdown 模板兜底）

- **背景**：用户复测 115.2s，输出 JSON 已带 `timing`（`totalMs=106.7s`、`fetchMs=46.5s`、`synthesisMs=60.2s`），并首次出现 `synthesisError="LLM HTTP 429: 余额不足或无可用资源包,请充值。"`；答案仍为 L1 键值对。
- **根因**：格式退化与 confidence 分支无关，是 LLM 合成调用失败（heavy provider 429）落到 `buildPlainAnswer` 兜底；`fetchMs≈46.5s` 仍偏高，嫌疑是分支候选串行 404 试探与 raw 网络延迟。
- **修复**：① `BRANCH_CANDIDATES` 改为 `['HEAD', 'main', 'master']`，HEAD 直连默认分支减少串行试探；② 兜底从键值对升级为 `buildMarkdownAnswer` 模板渲染（`# 项目解读` + `## 定位/架构/技术栈/使用/适用场景/健康分/风险/来源`），无 LLM/额度不足时仍输出可读 Markdown；③ 测试断言同步。
- **证据**：build 绿；pipeline 52/52、github-reader 17/17、github-project 4/4；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-quality-confidence-timing.md` 追加三轮结果。
- **残余**：`synthesisError=429` 是余额/资源包问题，恢复 heavy provider 额度后复测即可验证 LLM 合成恢复；`fetchMs≈46.5s` 仍高，下一步可加 GitHub raw/API 缓存或排查网络链路。

### GitHub 解读质量四轮（Skill heavy 超时对齐 P-122：DeepSeek 优先完成，避免落到智谱 429）

- **背景**：用户要求「deepseek 还有钱，智谱没钱就切到 deepseek」。排查发现运行时 heavy 链本来就是 `deepseek → minimax → zhipu`，但 `createSkillHeavyClient` 只放开总预算 P-122=90s，单 provider 超时仍是默认 30s；deepseek-v4-pro 长报告超过 30s 被切，随后兜底到 minimax/zhipu，最终撞上智谱 429。
- **修复**：`createSkillHeavyClient` 增加 `timeoutMs: PARAMS.skillGenerationBudgetMs`，每家 provider 最多跑 90s，DeepSeek 有机会在首位完成；新增单测断言单 provider 超时对齐 P-122。
- **证据**：build 绿；llm + llm-registry 19/19；运行时探针 chain `timeoutMs=[90000,90000,90000]`；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-skill-heavy-timeout-deepseek.md`。
- **残余**：用户下次复测期望 `synthesisError` 为空；若 deepseek 仍失败，再查 deepseek API 模型名/额度。

### GitHub 解读质量五轮（maxTokens 4096/8192 + 截断单次重试）

- **背景**：用户复测 deepseek-harness，`synthesisError="LLM 输出达到 max_tokens 上限被截断"`，`fetchMs=3.3s`、`synthesisMs=47.1s`；usage 实证 `deepseek-v4-pro completionTokens=3199`，撞上 github-reader 硬编码 3200 上限，prompt 仅 1851 tokens。
- **修复**：github-reader 首轮 `maxTokens` 3200 → 4096，截断时单次升到 8192 重试，仍截断/失败才落模板兜底；测试覆盖「重试成功返回 LLM 报告」与「连续截断落兜底」。
- **证据**：build 绿；github-reader 18/18；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-quality-confidence-timing.md` 追加五轮结果。
- **残余**：v4-pro 长报告生成仍需几十秒，验收以 `synthesisError` 消失 + answer 为 LLM 报告为准。

### 合成流式输出 P0 + GitHub 解读限长 P1（用户拍板「一起上」）

- **背景**：用户复测 GitHub 解读链路 LLM 合成跑通（13 章节报告、confidence 0.550 声明、evidence 6 条透传、截断消失），但 `synthesisMs=131s`、`totalMs=141s`；用户给出 P0-P3 优化方向并拍板先做 P0（streaming）+ P1（输出限长）。
- **修复**：① `llm-client.ts` 新增 `CompleteOptions.onToken`——有回调即走 `stream: true` + SSE 逐块解析，抑制 `<think>` 推理块后回调可见增量（展示层不透出推理），仍返回全量文本；`finish_reason=length` 截断检测与 usage 记账（`stream_options.include_usage`）保留；② `s5_synthesize.ts` / `pipeline.ts` 透传 `onToken`，pipeline 对 skill 运行包 `withStreamingToken` 让 github-reader 等 skill 长文同样渐进展示；③ `main.ts` CLI 增量写 stderr，stdout 仍是最终 JSON（`answer(query)` 契约不变）；④ `github-reader` `SYNTH_MAX_TOKENS_RETRY 8192→4096`（同预算重试），system prompt 加「报告控制在 2000 字以内，重点突出定位、技术栈、风险三项」。
- **证据**：build 绿；相关单测 123/123（llm-client/s5/github-reader/pipeline/llm-registry/llm）；全量单测 1110 通过、1 跳过、0 失败；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-synthesis-streaming-max-tokens.md`。
- **残余**：streaming 只改善体感、不缩总耗时，131s 的真正削减靠 P1（限 2000 字 + 4096 上限）；真实 e2e 复测待用户手动跑，期望 stderr 出现打字效果、`synthesisMs` 明显下降；若 4096 上限仍截断会落 Markdown 模板兜底（预期取舍）。

### GitHub 解读质量六轮（README 正文进 LLM context，P0 数据层）

- **背景**：用户复测 deepseek-harness 输出仍是空壳推断——confidence 0.55、`usage/architecture/scenarios` 三个核心字段全部「未获取」、positioning 只有「English | 中文」。只读排查定位：README **抓取成功**（evidence 含 raw `[hard]`），但契约只向 LLM 传 4 个 README 派生字段（各 ≤600 字符），README 全文从不进 LLM context；章节正则匹配不到 `## Run`；positioning 导航行启发式对中文失效。
- **修复**：① 契约新增 `readme_excerpt`（README 原文前 8000 字符，随契约 JSON 进合成 prompt）；② `extractPositioning` 补「剥链接/分隔符后残余过短即导航行」判定，过滤 `English | 中文`；③ usage 正则补 `\brun\b|\brunning\b|运行|启动|部署|deploy|how\s+to`，`## Run from npm` 命中。
- **证据**：build 绿；github-reader 21/21（+3）；pipeline + github-project 56/56；test:all 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-reader-readme-content.md`。
- **残余**：monorepo 根 package.json 只含 devDeps 致 tech_stack 偏构建工具链（后续项）；真实 e2e 复测待用户手动跑。

### GitHub 解读质量七轮（协议重构：输出预算 ≤1200 字 + 数据边界防编造）

- **背景**：六轮后复测通过（confidence 0.65、usage 读到 `npx @deepseek-ai/dsh web`），但 `synthesisMs=49.96s` 仍长，且答案出现 `SAFETY.md`/`--no-open`/SSH host URL 三处不在抓取数据里的内容（本地快照无 SAFETY.md、README 未提及）——数据不足时的外推编造。用户拍板最后一轮一次修到位。
- **修复**：`REVIEW_PROTOCOL_SYSTEM` 重构——13 维编号列表改「内部检查清单」，新增硬性「输出要求」（≤1200 字、紧凑顺序、每节 1-3 句、禁止逐项展开）与硬性「数据边界」（只依据本次抓取的 README/manifest/GitHub API/evidence 发言，未出现的数据一律不得提及）；per-call 2000 字约束同步为 ≤1200；测试断言同步 + 新增 2 条。
- **证据**：build 绿；github-reader 21/21；pipeline + github-project + nl-router 65/65；test:all 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-reader-readme-content.md` 七轮补强。
- **残余**：e2e 复测待用户手动跑（期望 `synthesisMs` 明显下降、无 SAFETY.md/--no-open 类编造）；evidence 的 `[url](url)` 为桌面应用渲染 artifact，非代码问题。

### GitHub 解读速度八轮（合成档位 heavy→medium，synthesis 46s→秒级 E283）

- **背景**：七轮后复测答案质量达标（usage 读到 `npx @deepseek-ai/dsh web`、confidence 0.65），但 synthesis 连续三轮稳定 45.9–50s（totalMs 48–56s），用户判定为唯一剩余瓶颈。`data/usage.jsonl` 实证：heavy 档 v4-pro `completionTokens=2600`，而可见答案仅 ~800 字——隐藏 `<think>` 推理块与答案共享 max_tokens（`llm-client.ts` 注释佐证），约一半输出与绝大部分耗时耗在推理；github-reader 是 README 级契约渲染任务，不需要重推理。
- **修复**：`llm.ts` 新增 `createSkillCompleteClient(skillName)` 档位工厂——github-reader → medium（v4-flash）；`SkillDeps` 新增可选 `completeForSkill` 按 skill 名解析器；`pipeline.ts` direct-skill 分支统一经解析器取客户端并包 `withStreamingToken`（onToken 改可选，非流式入口 gateway/im 同样生效）；`main.ts`/`gateway/server.ts`/`im/run.ts` 三生产入口接线；市场通道 `github-project.ts` 默认同样切 medium。**修订（复测后）**：medium 默认 [P-116] 18s 预算把正在生成的答案截断（synthesisMs=18.0s → 模板兜底 confidence 0.5），github-reader 分支改 `createClientForRole('medium', { totalBudgetMs: [P-122], timeoutMs: [P-122] })`——模型仍 v4-flash、预算放宽到 90s，不动全局 [P-116]（E281 主链路语义保留）。测试隔离：单测注入 complete mock 且不提供 `completeForSkill` 时回落原逻辑，不构造真实 client。
- **证据**：build 绿；llm 8/8（+1，含预算=[P-122] 断言）、pipeline 53/53（+1）、github-project + github-reader 25/25；test:all 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN。用户复测（修订前）：synthesisMs 18.0s 被 [P-116] 截断、stderr 流式内容质量四轮最佳（约 70% 已生成）——确认 18s 预算不足而非模型过慢。
- **登记**：计划 `docs/plans/2026-08-29-github-reader-synthesis-speed.md`；附录 A E283。
- **残余**：真实 `npm run dev` 复测待用户（期望不再被 18s 截断、confidence 回到 0.65、synthesisMs 约 20-35s）；若仍超体感阈值，下一档是协议输出限长（1200→800 字）或 readme_excerpt 截短，需用户拍板。

### GitHub 解读速度九轮（GitHub API 轻量 SQLite 缓存，fetchMs 稳定化 E284）

- **背景**：八轮修订后用户复测收官成绩单全绿——synthesisMs 8.0s、totalMs 18.3s、confidence 0.65、evidence 6 条、流式/兜底正常；唯一残留 fetchMs 波动（1.9s↔10.2s，GitHub API/网络抖动 + 接近匿名限流 60 req/h）。用户拍板：只缓存 GitHub API JSON（TTL 5–10 分钟），raw README/manifest 不缓存。
- **修复**：新增 `src/skills/github-reader/cache.ts`（node:sqlite DatabaseSync，`http_cache(url PK, body, fetched_at, ttl_ms)`，过期惰性删除）+ `createGithubApiCache()` 单例（`GITHUB_CACHE_DB_PATH` 或 `data/github-api-cache.db`）；`SkillDeps.httpCache` 可选注入（测试不注入即不缓存，单测隔离）；`httpGetJson` 命中缓存直接返回、仅成功 JSON.parse 后写缓存（防非 JSON 错误页被缓存成永久 miss）；TTL 新增 [P-142]（300000ms，5 分钟）；main/gateway/im 三入口接线。市场通道 github-project 未接（默认结构化模板路径，后续项）。
- **证据**：新增单测 5 条（cache 4：miss→null/set 命中/TTL 过期惰性删除/覆盖写 + 单例；github-reader 1：二次执行 GitHub API 请求数不再增长、raw 仍直连）；`npm run build` 绿；cache 4/4、github-reader 22/22、pipeline 53/53、llm 8/8、github-project 4/4；test:all 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN。
- **登记**：计划 `docs/plans/2026-08-29-github-reader-http-cache.md`；§5 P-142；附录 A E284。
- **残余**：真实复测待用户（同一仓库二次解读 fetchMs 应回落 ~1-2s）；commits URL 的 `since` 参数每日变化，次日自动失效（正确行为）。

## 明日待办（2026-08-30）

1. **Q2 已闭环**：E281 后复测通过——gate=none、64.7s，答案含双方毫秒级数值；无需再做。
2. **Q3 检索缺口**：Tavily 月配额恢复后复测「PostgreSQL 16 写入性能 benchmark」期望 TPS/IOPS 数值；若引擎仍倾向调优文，考虑补充 benchmark 来源站。
3. **回归评估**：E279-E281 机制级/预算修复待 `bench:devil-v25` 回归（与 E275-E278 合并评估，未跑，默认不代跑）。
4. **注意**：当前工作区含 E275-E281 大量未提交改动（含需求文档 v2.5 附录 A/§5/§6.5.6/§6.7），未 `git commit`；提交前需先 `npm run doc-lint` + `npm run test:all` 全绿。
5. **E282 观察**：CLI/gateway 已接运行时看门狗，运行几次真实问答观察 `toolNotice` 是否按 [P-141] 阈值触发；若噪音误报可再校准阈值，若需邮件/状态栏持久化另行立项。
6. **GitHub 解读质量复测**：用户跑 `npm run dev -- "https://github.com/deepseek-ai/deepseek-harness 这项目是做什么用的？"`，期望 `synthesisError` 消失且 answer 为 LLM 合成报告（不再是模板渲染）；本次已把 maxTokens 提到 4096/8192 并加单次截断重试，`fetchMs` 已回到 ~3s；若仍有截断，看 `synthesisMs` 与 usage 的 completionTokens。
7. **GitHub 解读速度复测**：E283（含修订）已把 github-reader 合成切到 v4-flash 且预算放宽到 [P-122] 90s（全局 [P-116] 18s 不动），用户跑同一 query 期望不再被 18s 截断、confidence 回到 0.65；若答案质量或 confidence 回退，再评估协议对 flash 档的适配。
8. **GitHub 解读缓存复测**：E284 已给 GitHub API JSON 加 5 分钟 SQLite 缓存（raw README/manifest 不缓存），用户跑同一 query 二次，期望 fetchMs 由 ~10s 回落到 ~1-2s 且答案数据不变；若某 URL 未命中（commits 带每日变化的 since 参数），属预期行为。
