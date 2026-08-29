# 进度交接 2026-08-28（E268 身份一致性 + E269 合成跟随选档 + E270 知识问答四步链路 / 工具告警分离 + E271 通用管道机制级修复 + E272 P-127~P-131 转定稿 + E273 融合选证机制级修复 + E274 S5 合成截断机制修复 + E275 市值/排名数值列举修复 + E276 合成预算瘦身（正文注入 3000→1500 + 超时兜底去 URL 墙）

> 当前分支：v0.2b｜本轮收口：E268（身份问答一致性）+ E269（合成跟随 UI 选档、Tavily 预警静默、视觉档进切换器）+ E270（知识问答四步链路：通用问答强制抓正文作答 + 工具告警静默兜底 + E81 词表与金融权威域）+ E271（通用问答管道机制级修复：fallback 预算分档 + HTTP 直抓正文 + 三维回答力信号）+ E272（[P-127]/[P-128]/[P-129]/[P-130]/[P-131] 转定稿签认）+ E273（融合选证机制级修复：数据页不再被丢弃 + 信号 A 真并入评分 + 跨域转载去重）+ E274（S5 合成截断机制修复：maxTokens 升档 + finish_reason 截断检测重试）+ E275（市值/排名数值列举：内容形态密度加权 + 零数字覆盖门控 + rule1 % 排除）。
> 上一份交接见 `docs/2026-08-27-progress-handoff.md`。

## 今日已收口

### E276 合成预算瘦身（E275 交付后实测仍答非所问 → 正文注入 3000→1500 + 超时兜底去 URL 墙）

- **根因（用户实测）**：E275 后融合/证据已正常（候选池含 guba 讯飞1022亿/三六零555亿/昆仑万维408亿 等数据页，evidence top-3 稳定含公司级市值页），但桌面实测 55~90s/次、token 消耗高——P0 四步链路把 3 篇正文各 [P-128] 3000 字符 ≈ 8~10k tokens 喂合成，medium（deepseek-v4-flash）在 [P-06]/[P-116] 12s 预算内完不成 → 超时 → `s5_synthesize.ts` 兜底输出「搜索到了 N 条…已抓取正文：T（U）；T（U）」URL 墙（答非所问 + 高延迟 + 高 token 三问题同源）。
- **修复（全机制级）**：① [P-128] 3000→1500 字符——数值/列举类页面关键数据集中在正文头部，截断不丢数字；3 篇 × 1.5k ≈ 4.4~5k tokens，medium 合成稳定收口在预算内；② `s5_synthesize.ts` 超时兜底重写——「回答生成超时，以下为本次检索到的相关资料…」+ 每条来源：标题（无 `<title>` 页用域名兜底 `sourceLabel`）+ 正文头部 120 字片段 + URL 独立一行，按 URL 去重（pageContents 优先）；③ `pipeline.ts` 合成失败 gate 升级条件放宽为 `gate === 'none' || gate === 'low_confidence'` → `synthesis_timeout`（超时不再被低置信门掩盖成「证据不足」）。
- **证据**：新增/更新单测 6 条（s5 fallback 重写 3、域名兜底 1、[P-128] 注入上限 1、pipeline low_confidence 不掩盖 1）；相关 6 文件单测 123/123 绿；全量单测 1073（1072 pass / 1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN。真实复测：prompt 7320 → 4921~5020 字符（降约 1/3）；medium 5 次复测 2 次直接作答（10.4~11.5s，含 智谱破1万亿港元/寒武纪6300亿/摩尔线程3100亿/沐曦2500亿）、3 次 API 延迟撞 12s 走干净 fallback（gate none/synthesis_timeout 正确）；heavy v4-pro 仍撞 30s（E274 已知）但 fallback 干净；flash 延迟探针小 prompt 1.2s vs 同规模 9.2s → 主因 API 延迟波动。基准 `bench/B-20260828-02-synthesis-budget-fit.md`。
- **登记**：附录 A E276；[P-128] 3000→1500（provisional@2026-08-28）；计划文档 `docs/plans/2026-08-28-fusion-coverage-scoring-fix.md` E276 补记；基准 bench:B-20260828-02。
- **残余**：deepseek API 延迟波动时 medium 仍偶发撞 12s（显式超时兜底，可重试或切快速档）；heavy 档 v4-pro 30s 预算仍会超时（E274 已知，切快速档即可）。

### E273 融合选证机制级修复（用户实测「市值/排名」缺具体数字 → 融合丢数据页）

- **根因（对比 Web 版 20s 出结果的差异）**：召回无问题（真实管道 60 条含 智谱市值1.07万亿/五小龙/MiniMax3000亿/讯飞1022亿 等直接回答市值的数据页），但融合把数据页全丢——短 snippet 打 usability 0.4 + AnySearch 无日期字段在 news 意图打 timeliness 0.15 → 0.29~0.31 低于 [P-16] 0.4 丢弃线；E271 信号 A `answerCoverage` 只进惩罚门未进评分；news 形态偏好缺 numeric。top-3 只剩 生态图谱/8只概念股/TOP20 泛文 → LLM 无数字可答。
- **修复（全机制级，无领域关键词/域名/实体）**：① `usabilityScore` 短片段含数字（≥60 字符）→ 0.6（数据页/榜单页 snippet 天然短而多数值）；② 缺失日期统一 0.5 中性兜底（带日期的旧闻仍按窗口衰减，guba 2024 旧市值页仍正确丢弃）；③ 信号 A 真并入评分（[P-132] `coverageScoreWeight=0.15` 加成分）+ news 偏好补 numeric + predicate 感知加成（numeric/temporal 主形态命中即补足覆盖）；④ 信号 C 跨域转载同文去重（[P-133] `syndicatedDupJaccard=0.75`，同文实测 Jaccard 0.92~0.95 只留一条）；⑤ S5 think-only 检测（heavy v4-pro 800 maxTokens 推理耗尽不再泄漏 `<think>`）+ 参考来源逐条换行约束（消灭标题+URL 粘连乱码）。
- **证据**：真实召回 60 条缓存复算——修复前数据页 0.29~0.31 全丢弃，top-3=生态图谱(0.68)/8只概念股(0.60)/TOP20(0.60)；修复后 top-3=8只概念股(0.750)/TOP20(0.739)/胡润50强(0.699)，智谱市值首破万亿/五小龙/1.07万亿/麻省理工 0.626 全保留、7天狂飙 0.558 由丢弃转保留；CLI 真实管道 E2E evidence 含胡润50强（寒武纪/摩尔线程/沐曦 市值合计约1.2万亿），heavy 本次 synthesis_timeout 兜底无 think 泄漏；medium S5 探针参考来源逐条换行、readiness=numeric ready=true；新增/更新单测 6 条；全量单测 1058/1059（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 56 key）。
- **登记**：附录 A E273；[P-132]/[P-133] provisional@2026-08-28；计划文档 `docs/plans/2026-08-28-fusion-coverage-scoring-fix.md`。
- **残余权衡（已写入附录 A 状态）**：新鲜但无日期字段的智谱/MiniMax 页（0.626）仍低于胡润50强（0.699）——差距来自相关度（0.27 vs 0.47）与权威分（0.3 vs 0.8），均为正当信号；news 意图下带日期的泛文仍可压过无日期数据页。不通过加大 [P-132]（全局膨胀分数、弱化 lowConfidence 门）或加领域规则解决，待 devil-v25 回归评估是否调 [P-132]/[P-26] 标定。

### E274 S5 合成截断机制修复（复测发现 800 maxTokens 下 v4 思考块把答案截成残句）

- **根因（本轮复测）**：E273 交付后按 handoff「下一步」用真实管道复测同一 query——回答已直接区分「上市市值 vs 一级市场估值」并准备列名单，但 deepseek-v4 系列思考块与最终答案共享 `max_tokens`，800 上限下思考块稍长即把答案截断（实测截于「结合最近一个」，source=llm 静默返回残句，无任何提示）。
- **修复（全机制级）**：① `llm-client.ts` 解析 `finish_reason`，新增 opt-in `rejectOnTruncate`（默认行为不变，不影响分类/路由等短任务），`finish_reason=length` 抛 `LLMLengthTruncatedError`；② `llm-registry.ts` fallback 链对截断错误直接上抛不换 provider（同 maxTokens 换家仍截断）；③ `s5_synthesize.ts` 单次合成 [P-134]=1500 maxTokens（v4-pro 实测 1500+精炼约束约 25s 收口、2000 需 33s 撞 heavy 30s 预算），仍截断按 [P-135]=3200 重试一次，再失败走 §6.7 降级链（不把残句当答案）；④ P0 提示补「回答正文保持精炼、直接给结论不做冗余展开」。
- **证据**：medium（v4-flash，桌面默认档）真实规模正文探针（5407 prompt tokens，3 页×3000 字符）——1500 maxTokens 5.8s `finish_reason=stop` 完整作答 642 字（含逐条参考来源），远低于 [P-116] 12s 预算；heavy（v4-pro）直连——2000 tokens 需 33.4s（reasoning 1602）> [P-130] 30s、1200 tokens 全耗思考（finish=length 空正文）触发截断检测、1500+精炼约束 25.2s 收口；真实管道 E2E（CLI heavy）——修复前 800 截断残句，修复后重 tier 超时走显式「回答生成超时」兜底（与 E273 已接受行为一致），桌面 medium 路径探针确认完整作答；新增/更新单测 5 条（llm-client 2、llm-registry 1、s5 2）；全量单测 + 集成 32/32 全绿；doc-lint 0 FAIL 0 WARN（C8 58 key）。
- **登记**：附录 A E274；[P-134]/[P-135] provisional@2026-08-28；计划文档补记见 `docs/plans/2026-08-28-fusion-coverage-scoring-fix.md`。
- **残余（环境因素，非代码回归）**：本次复测期间 Tavily 月配额耗尽（toolNotice 状态栏告警），召回缺高价值市值数据页（智谱/MiniMax/讯飞具体数字），LLM 只能基于现有证据诚实作答——待配额恢复后复测应浮现具体数字。

### E275 市值/排名类数值列举修复（用户实测仍答「给不出排名」→ 内容形态密度加权 + 零数字覆盖门控 + rule1 % 排除）

- **根因（DIAGNOSE_NUMERIC=1 诊断）**：召回无问题——候选池 58 条含 36 条带数字量级（智谱5000亿港元/寒武纪6300亿/MiniMax900亿/讯飞1022亿/三六零555亿），但融合 top-K 被「700亿市场规模」泛文族占满（eastmoney 0.946/凤凰 0.895/新浪 0.894/机构预测 0.883），evidence 只剩 3 条泛文 → LLM 无数字可答。确诊在**融合打分**，不是召回/子查询。
- **修复（[P-ZZZ'] 第一期，机制级、无领域规则）**：① `AnswerResult.predicate` 输出字段（§6.3，纯跨领域疑问词解析）；② 内容形态密度加权加分——数值 predicate 且 rel≥0.1 时 `[P-136]×min(头部独立数值计数,[P-138])`（公司数据页头部 4~10 个独立市值对 vs 泛文 1~3 个；纯加项 0.15 同权、全文密度被长文数字淹没，头部密度 + rel 护栏是校准关键）；③ 覆盖度门控 + 补检索——数值 predicate 且 evidence/正文完全无数字 → 一次带单位后缀（[P-137]）补检索后重新融合，补完仍无数字才允许 LLM 诚实降级；④ 附带 rule1 `%` 排除——`%` 是跨领域通用比例单位（涨跌幅/效率/增速），同一 query 下不同页面 `%` 大概率是不同事实（智谱+36.9% vs MiniMax+18.46% vs 首页基金 424.39%），按同一属性仲裁把五小龙/7天狂飙等数据页 fact 归零并误触发 low_confidence 门；规格类单元 V/A/W/Hz/℃ 不受影响。
- **证据**：真实管道 medium（deepseek-v4-flash，桌面默认档）复测 5 次——evidence top-3 稳定含公司级市值页（五小龙=智谱5000亿港元/MiniMax3000亿、guba=讯飞1022亿/三六零555亿/昆仑万维408亿、7天狂飙=MiniMax3000亿港元、投中网=智谱破1.04万亿港元、MiniMax900亿），LLM 直接作答「智谱市值站上1.04万亿港元/MiniMax 上市次日破千亿/科大讯飞1022亿/三六零555亿/寒武纪6300亿」并诚实标注时效边界（guba 2024 数据判旧）；rule1 % 排除后五小龙 fact 0→1、gate low_confidence→none；新增/更新单测 3 条（numeric-pattern 密度计数 1、fusion 密度加权 1、rule1 % 排除 1）；全量单测 + 集成 32/32 全绿；doc-lint 0 FAIL 0 WARN（C8 61 key）。
- **登记**：附录 A E275；[P-136]/[P-137]/[P-138] provisional@2026-08-28；计划文档补记见 `docs/plans/2026-08-28-fusion-coverage-scoring-fix.md`。
- **残余（环境因素，非代码回归）**：Tavily 月配额耗尽期间召回缺最新智谱/MiniMax 页偶发缺席（Bocha/AnySearch 正常）；deepseek medium 大正文下偶发撞 [P-116] 12s 预算（API 延迟，走 E274 显式「回答生成超时」兜底，重试即恢复）。

### E272 P-127~P-131 转定稿（随 devil-v25 全量回归评估）

- **回归执行**：清空 `bench/devil-v25/results.jsonl` 后全量重跑 122 条（旧基线 = git HEAD E237 时代结果，备份于 TEMP 可对比）；`compare:devil-v25` 结果——35 条系统级 Bug 35/35 已修复、8 条能力项 5/8 有进展、故障形态计数无真实恶化（路由 1→2 为 EC08「哪部分电路」澄清被正则误报、JSON 0→0、低置信兜底 7→7）；15 条由「搜索到了 N 条」兜底转为真实作答（ET05/06/30、SM01/09/18/19、EC07/19/21/30、C08 等）。
- **回退核因**：26 条 real→非real 迁移中，16 条伴随 Tavily 月配额耗尽告警（toolNotice 可证，环境因素）；其余为 bench 高频调用下 medium 档 12s 链预算（[P-116]）偶发击穿/API 错误——ET28 单条 CLI 重跑即恢复真实作答，非 E270/E271 逻辑回归；`synthesis_timeout` 显式门 +「回答生成超时」提示 + `toolNotice` 状态栏分离均按设计工作。
- **离线指标**：`bench:answer-readiness` 复跑——predicate 分类 60.7%（不变）、真实证据覆盖度 55.1%→55.7%（n=88）、证据多样性 93.7%→97.6%（n=85）。
- **文档**：§5 注册表 P-127/P-128/P-129/P-130/P-131 状态列 provisional@2026-08-28 → 定稿（数值不变）；附录 A 新增 E272 签认条目（五条件逐条对照 + owner 2026-08-28 签认，bench:B-20260828-01）；附录 C.4 登记 devil-v25 回归 122 条原始数据（SHA-256）；计划文档 `docs/plans/2026-08-28-params-finalize.md`。
- **验证**：doc-lint 0 FAIL 0 WARN（C8 54 key）；build + 全量单测 + 集成 32/32 全绿。

### 0. E270 知识问答四步链路（依用户诊断 + 文档/代码审阅落地）

- **审阅结论**：四步链路在 v2.5 需求确有闭环条文（Stage 3 [P-85]/[P-86]、抓正文 E76/E80/E182、合成 E104、契约 §6.3）——需求层无缺失；「UI 没接管道」假设不成立（`App.tsx` send() 直连 /api/ask，截图回答带搜索证据必来自管道）；真实弱项是「抓正文」只覆盖器件/低置信 + E81 词表缺金融时效词 + §6.5.3 无金融权威域。
- **P0**：`pipeline.ts` 知识/资讯意图强制 `pickKnowledgeContentTargets` → `fetchSecondPassTargets` 抓正文 → `pageContents` 直喂 `s5_synthesize`（【网页正文】块 + P0 硬约束「直接作答 + 文末参考来源，禁止只列链接」）；browser 证据切片 300→4000（[P-127]）；单篇正文 ≤[P-128]（3 篇 × 3k ≈ 9k tokens，12s 预算内）。
- **P1**：`splitSearchNotices` 拆分用户提示/工具告警；全引擎失败才提示「联网暂时不可用，以下为模型内置知识回答（可能非最新）」。
- **P2**：E81 词表补 市值/排名/排行/榜单/价格/股价/汇率（`recency.ts` + `s2_classify` 规则优先 news≤24h）；§6.5.3 补金融权威域（sse/szse 官方 1.0、hkex 0.9、eastmoney/cninfo 0.85、forbes/hurun 0.8）+ `query-rewrite` 金融 site: 子查询（E85 模式）。
- **P3**：工具告警（Tavily 超限/Bocha 余额）→ `AnswerResult.toolNotice` → UI 底部状态栏（移除死代码 banner），不污染气泡。
- **证据**：新增单测 12 条；全量单测 1029/1030（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 51 key）；UI 构建通过；gateway E2E：市值题 toolNotice=Tavily 超限、notice 空、LLM 诚实作答（截至 2026-08-28 无完整榜单 + 来源）、evidence 含 eastmoney；计划文档 `docs/plans/2026-08-28-knowledge-qa-four-step.md`。
- **登记**：附录 A E270；[P-127]/[P-128] provisional@2026-08-28。

### 3. E271 通用问答管道机制级修复（依审阅结论：预算分档 + HTTP 直抓 + 三维回答力信号）

- **审阅结论落地**：不修「市值」内容，修三个与 query 无关的结构缺陷——① fallback 预算不分档（heavy 推理模型 12s 总预算撞线 → 兜底摘要）；② 正文抓取依赖浏览器（P0 无浏览器就不抓）；③ 选证只看相关性不看「回答力」。全部机制级修复，代码与文档规则不引入任何领域关键词/域名/实体（用户硬约束）。
- **P-XXX 预算按档**：`params.ts` 新增 [P-129] light=5000ms / [P-130] heavy=30000ms（medium 沿用 [P-116] 12s）；`llm-registry.ts` 抽 `resolveFallbackBudgetMs(role)`；合成失败显式 `gate_triggered=synthesis_timeout` + 聊天提示「回答生成超时…可重试或切换更快档位」，轨迹记 error，不再静默「搜索到了 N 条」。
- **P-YYY HTTP 直抓**：新增 `src/search/http-fetch.ts`（node 原生 fetch + 正则正文提取 + UTF-8→GB18030 探测 + SSRF 复用）；`second-pass-fetch.ts` HTML 分支 HTTP 优先、浏览器兜底（`session` 改可选）；`pipeline.ts` P0 移除 browserSession 前置条件，全失败时 `toolNotice`「网页正文抓取失败…」。
- **P-ZZZ' 三维回答力信号**：A 证据粒度匹配（`fusion.ts` `detectShapes()` 数值密度/日期/步骤/引述/标识符，替换领域词表 `ANSWER_SIGNALS`，数值按密度 ≥2 判定避免泛文刷覆盖）；B 答案覆盖度（新增 `answer-readiness.ts` predicate 四分类 + 形态检测，观点词优先于「如何」，缺口注入 Stage 5 诚实边界）；C 证据多样性（同域名 + token Jaccard ≥ [P-131] 同质簇替换，零依赖近似）。
- **bench 整体指标**：新增 `scripts/bench-answer-readiness.ts`（`npm run bench:answer-readiness`，离线）——predicate 分类覆盖率 / 真实证据覆盖度达标率 / 证据多样性达标率，按意图分组，不逐 query 加断言；基线 bench:B-20260827-01（60.7% / 55.1% n=89 / 93.7% n=79）。
- **证据**：新增/更新单测 28 条（http-fetch 7、answer-readiness 10、fusion 多样性 1、llm-registry 预算分档 2、s5 诚实边界/失败标记 2、pipeline synthesis_timeout/P0 无浏览器 2、second-pass-fetch HTTP 直抓 4）；全量单测 + 集成 32/32 全绿；doc-lint 0 FAIL 0 WARN（C8 54 key）；UI 构建通过；`bench:devil-v25` 版本查询回归（官方 release 胜出）恢复通过。
- **登记**：附录 A E271；[P-129]/[P-130]/[P-131] provisional@2026-08-28；计划文档 `docs/plans/2026-08-28-general-qa-pipeline-fix.md`。

### 1. E268 身份问答一致性（桌面便携版实测反馈修复）

   - **根因**：`ui/prototype/src/App.tsx` 回复 meta 用发送时旧 `mode` + 硬编码「· 后端」，身份问题显示「工程开发 · 后端」；FALLBACK_MODELS 三档 DeepSeek 全标 deepseek-chat 且默认档为 heavy（回答解析出 v4-pro 与 UI 显示冲突，且普通问答默认走 heavy 成本高）。
   - **修复**：meta 改为按后端返回 `data.mode`/`data.submode` 计算（身份问题→「知识咨询」）；默认档位改 P-105 缺省中档 medium（`defaultModelId` + 目录加载后未手动选档跟随 `catalog.defaultTier`，`modelTouchedRef` 记录手动选择）；FALLBACK_MODELS 换实体模型名；`self-identity.ts` 措辞改「当前生效模型」并明确身份类问题由内置规则秒回、不消耗模型调用额度。
   - **MiniMax 三档**：按官方文档（2026-08-27）落地 light=MiniMax-M2.7-highspeed / medium=MiniMax-M2.7 / heavy=MiniMax-M3（`llm-registry.ts` defaultModels、`.env` 显式 `MINIMAX_*_MODEL`、`npm run model:export` 刷新静态目录；切换器不再出现两个 M2.7）。
   - **证据**：新增单测 3 条（self-identity heavy/medium 实体模型名 + llm-registry MiniMax light/medium）；全量单测 1015/1016（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；playwright-core + Edge 实测：默认当前模型 DeepSeek deepseek-v4-flash（medium）、下拉 MiniMax M2.7-highspeed/M2.7/M3、问「你现在是什么模型？」回复 meta=知识咨询、正文与 UI 一致且说明不消耗模型额度；重新打包便携版/安装版 + 打包版冒烟 DESKTOP_READY；`data\一人公司AI-Agent 0.1.0.exe` 已同步。
   - **登记**：附录 A E268；计划文档 `docs/plans/2026-08-27-identity-model-consistency.md`。



### 2. E269 合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器

   - **根因（答非所问）**：gateway/CLI 把 heavy 客户端直接注入合成（`deps.llm`），UI 选档从未作用于真实合成；heavy v4-pro 大证据 prompt 超过 [P-116] 12s fallback 预算即落「搜索到了 N 条相关结果」兜底摘要（答非所问 + 每次 30s+ 耗时）。
   - **修复**：`pipeline.ts` 在 `modelSelection` 存在时用 `createClientForRole(role, {preferredId})` 按所选档位建合成客户端（默认 medium=flash 快且便宜，不再静默烧 v4-pro，12s 预算内正常作答）；新增 `filterChatSearchNotices` 过滤 Tavily 月配额噪音（配额监控仍走 `tavily:smoke`）；视觉档贯通（`model-catalog.ts` 导出 vision、`parseModelId` 接受 vision、`ModelRouteInfo.tier` 扩为 ModelRole、UI FALLBACK_MODELS 与静态目录补 3 家 vision 条目）。
   - **证据**：新增单测 2 条（filterChatSearchNotices / model-catalog 含 vision）+ 更新 model-router vision 解析与 gateway 目录正则；全量单测 1017/1018（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 49 key）；真实端到端（gateway + modelId=deepseek:medium）「中国AI大模型公司中市值较高的是哪几家？」notice=null、LLM 真实作答（诚实说明无统一市值排名并给出寒武纪/科大讯飞/金山办公与主要玩家）、elapsed 33s（此前 83s 兜底）；playwright 实测切换器 DeepSeek 4 档含 deepseek-v4-flash-vision-exp（视觉）、回复 meta=知识咨询、无 Tavily 提示；视觉客户端 direct 调用 767ms 正常；重新打包便携版/安装版。
   - **登记**：附录 A E269；计划文档 `docs/plans/2026-08-28-synthesis-model-selection.md`。



## 提交

- `dbc9f09`（E268 身份问答一致性 + MiniMax 三档，10 文件 +150/-25）
- `b0e6ed0`（E269 合成跟随 UI 选档 + Tavily 预警静默 + 视觉档进切换器，15 文件 +142/-28）
- `992b71d`（E270 知识问答四步链路 + 工具告警分离 + E81 词表与金融权威域）
- E271（通用管道机制级修复 + 三维回答力信号，23 文件 +1197/-214，见 `git log --oneline -5`）
- +9753f（E272 P-127~P-131 转定稿 + devil-v25 全量回归，7 文件 +1709/-1785）
- E273+E274+E275 待提交（融合选证机制级修复 + 信号 A 真并入评分 + 跨域转载去重 + S5 think-only/来源格式 + S5 截断机制修复 + 市值/排名数值列举修复；含 §5 [P-132]~[P-138]、附录 A E273/E274/E275）

## 全量验证

- 单测全绿（E275 后新增 3 条）｜集成 32/32｜doc-lint 0 FAIL 0 WARN（C8 61 key）
- UI `tsc -b && vite build` 通过（index-BllgQORM.js）

## 下一步（按优先级）
  1. **E275 后用户实测新便携版（含 E273/E274/E275）**：便携版已更新——`data\一人公司AI-Agent 0.1.0-E275临时版.exe`（同步覆盖 `data\一人公司AI-Agent 0.1.0.exe`，含 E273/E274/E275 全部机制修复）。重点复测「市值/排名」类——应直接给出 智谱 1.04万亿港元/五小龙 5000亿港元/MiniMax 千亿/科大讯飞1022亿/三六零555亿/寒武纪6300亿 等具体数字；Tavily 月配额未恢复前最新市值页可能偶发缺席（Bocha/AnySearch 正常）；deepseek medium 大正文偶发撞 12s 预算时重试即恢复。
  2. **devil-v25 全量回归**（E273+E274+E275 机制级修复后）：建议 Tavily 配额重置后跑，排除环境噪音；`bench:answer-readiness` 对比基线看 predicate 分类/覆盖度/多样性是否提升（本次数值列举修复应抬高 numeric 类真实证据覆盖度）。
  3. **E275 残留可选**：数值列举 query 的 evidence 仍依赖候选池是否召回最新数据页——若 Tavily 恢复后仍缺具体公司，下一步是 E270 子查询生成的「单位约束」版（如追加 `市值 亿元` 子查询），仍不改融合规则。
  4. **E274 后续（可选）**：heavy 档（v4-pro）完整合成实测需 33.4s（2000 tokens）/25.2s（1500+精炼约束），已贴近 [P-130] 30s——若用户坚持用 heavy 档且要完整长答，需评估给 Stage 5 heavy 独立 per-call 预算（仿 E238 技能 90s 先例，另登 [P-NN]），本次不做。
  5. **普通知识问答耗时调优**：搜索仍 ~33-50s（Bocha/AnySearch 并行慢），涉及 §5 [P-NN] 需登记 bench 另排期。
6. ~~[P-127]/[P-128]/[P-129]/[P-130]/[P-131] 转定稿~~：已完成（E272，`539753f`）；devil-v25 全量回归结论——无代码级回归，Tavily 配额耗尽与 bench 高频 LLM 偶发超时为主要波动源（重试即恢复），下次全量回归建议在 Tavily 配额重置后跑以排除环境噪音。
  7. **P-10 转定稿（条件③ 唯一阻塞）**：成熟度 L2+（当前 L1，用户累积 Skill 32/50+）仍为唯一阻塞；累积路径继续每周 3-5 个 Skill。
