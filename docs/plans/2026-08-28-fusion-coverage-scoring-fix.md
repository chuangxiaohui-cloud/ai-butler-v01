# 推进计划：融合选证机制级修复（数据页不再被丢弃 + 信号 A 真并入评分 + 跨域转载去重）

> 日期：2026-08-28 · 分支：v0.2b · 状态：已完成

## 目标

用户实测「中国AI大模型公司市值较高的是哪几家？」：桌面版回答诚实但缺具体市值数字（只有 DeepSeek 710 亿美元），Web 版 20s 给出智谱/MiniMax/讯飞/三六零/DeepSeek/Kimi 具体数字。定位为**融合层选证丢数据页**（机制级），按「修检测器、不加领域规则」修复：

- 召回无问题：真实管道 60 条含 智谱市值1.07万亿（cls.cn）/五小龙（21jingji）/MiniMax3000亿（stcn）/讯飞1022亿（guba）等高价值数据页。
- 融合丢弃机理：短内容 snippet 打 0.4 + AnySearch 无日期字段在 news 意图打 0.15 → 数据页 0.29~0.31 低于 [P-16] 0.4 丢弃线；E271 信号 A `answerCoverage` 只进惩罚门、未进评分；news 偏好缺 numeric 形态。
- 附带问题：heavy v4-pro 在 800 maxTokens 下只输出 `<think>`，E238「剥离后为空保留原文」把推理泄漏给用户；「参考来源」标题+URL 被 LLM 拼成无换行长串。

## 计划

1. `fusion.ts`：usability 短数字片段 0.6；缺失日期统一 0.5 中性兜底；信号 A 并入评分（[P-132] `coverageScoreWeight=0.15`）；news 偏好补 numeric；predicate 感知加成（numeric/temporal 主形态命中补足覆盖）；跨域转载同文判同质（[P-133] `syndicatedDupJaccard=0.75`）
2. `s5_synthesize.ts`：think-only 检测按失败处理；参考来源逐条换行约束
3. 单测：fusion 短数字片段/覆盖加成组合/news numeric 覆盖/跨域转载去重/缺失日期 0.5；s5 think-only
4. 真实融合复算（缓存 60 条召回）+ CLI E2E + medium S5 探针
5. 文档：需求文档 §5 登记 [P-132]/[P-133]、§6.5.2/§6.5.6 同步、附录 A E273；doc-lint
6. 清理临时脚本，收尾 handoff

**验收标准**

- 不引入任何领域关键词/域名/实体到代码与文档规则
- 数据页（智谱市值1.07万亿/五小龙/1.07万亿/麻省理工）在真实融合中全部越过 [P-16] 保留，7天狂飙由丢弃转保留；guba 2024 旧市值页仍正确丢弃
- 跨域转载同文（eastmoney/ifeng/sina 同文 Jaccard 0.92~0.95）top-K 只留一条，替换为异质高分页
- think-only 不泄漏；参考来源逐条换行
- 全量单测 + 集成全绿；doc-lint 0 FAIL 0 WARN（C8 56 key）

## 执行过程

### 改动

- `src/search/fusion.ts`：
  - `usabilityScore`：`len>=60 && 含数字 → 0.6`（数据页/榜单页 snippet 天然短而多数值，复用既有 0.6 刻度，不新增参数）
  - `timelinessScore`：缺失日期统一 `missing=0.5`（原强时效 0.15 会把无日期字段的「内容即答案」页整体压到 [P-16] 以下；带日期的旧闻仍按窗口衰减到 0）
  - 信号 A 并入评分：四维加权和之上 `+= PARAMS.coverageScoreWeight * answerCoverage`（[P-132]=0.15），仅对定义了形态偏好的意图生效；E271 附 A「并入融合评分」承诺兑现
  - `INTENT_SHAPE_PREFERENCE.news`：`['date','attribution']` → `['date','attribution','numeric']`
  - predicate 感知加成：`answerCoverageScore` 接收 `classifyPredicate(query)` 结果，numeric predicate 命中 numeric、temporal 命中 date 时 `min(1, 0.5+hits/2)`（只加成不惩罚，避免误伤中文数词页）
  - 信号 C 扩展：`isHomogeneousPair` 跨域名同文（Jaccard ≥ [P-133]=0.75）也判同质簇；实测同文 0.92~0.95、异文 ≤0.13，阈值带安全余量
- `src/config/params.ts`：PARAMS 新增 `coverageScoreWeight: 0.15`（[P-132]）/ `syndicatedDupJaccard: 0.75`（[P-133]），PARAM_IDS 同步
- `src/search/stages/s5_synthesize.ts`：`isThinkOnly()` 检测「剥离 think 后为空」按失败处理（throw → 兜底，不泄漏推理）；参考来源约束改为每条单独一行 `- 标题（链接）`
- 需求文档：§5 登记 [P-132]/[P-133]（provisional@2026-08-28）；§6.5.2 评分公式加信号 A 加成项；§6.5.6 信号 A（news+数值、predicate 感知、[P-132]）与信号 C（跨域转载同文 [P-133]）；附录 A 登记 E273

### 验证

- 真实召回 60 条缓存复算（`_mv_results.json` + 真实 `fuseResults`）：修复前 top-3 = 生态图谱(0.68)/8只概念股(0.60)/TOP20(0.60)，数据页 0.29~0.31 全丢弃；修复后 top-3 = 8只概念股(0.750)/TOP20(0.739)/胡润50强(0.699)，智谱市值首破万亿/五小龙/1.07万亿/麻省理工 0.626 全保留，7天狂飙 0.558 由丢弃转保留；guba 2024 旧市值页（带旧日期 time=0）仍丢弃
- CLI 真实管道 E2E：「中国AI大模型公司市值较高的是哪几家？」evidence 含胡润50强（寒武纪/摩尔线程/沐曦 市值合计约1.2万亿）；heavy v4-pro 本次走 synthesis_timeout 兜底（无 think 泄漏）
- medium S5 探针：参考来源逐条换行 `- 标题（链接）`，粘连乱码消除；evidence readiness=numeric ready=true 不再注入「证据缺乏数值」边界
- 单测：fusion 44 条（新增 短数字片段 1、覆盖加成组合 1、news numeric 覆盖 1、跨域转载去重 1、缺失日期 0.15→0.5 更新 1）+ s5 think-only 1；全量单测 1058/1059（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN（C8 56 key）

### 遇到的问题

- 只修 usability+floor+coverage(0.15) 不够：数据页 0.556 仍低于 700 亿簇（0.71~0.75），top-3 不变。定位：news 权重时效占 0.5 + 700 亿簇有日期 + 跨域转载 4 份同文占槽位。解法：跨域转载去重（[P-133]）把 ifeng/sina 同文替换为胡润50强，top-3 变为 8只概念股/TOP20/胡润50强。
- predicate 感知覆盖（numeric 命中补满）后数据页 0.556→0.626，仍低于胡润50强 0.699——差距来自 rel（0.27 vs 0.47）与 authority（0.3 vs 0.8），均为正当信号（胡润是权威财富榜单且主题更贴「中国人工智能企业50强」）。不做 0.2+ 的 [P-132] 加码（会全局膨胀分数、弱化 lowConfidence 门），不作为领域规则绕过——残余权衡写入附录 A 状态。
- 胡润页 HTTP 直抓返回 JS 渲染导航垃圾，价值仅在 68 字符 snippet；真实管道浏览器兜底可抓，medium 模型本次超时走兜底（API 延迟环境因素，非代码回归）。

## 结果

- 单测 1058/1059（1 skip）+ 集成 32/32 全绿；doc-lint 0 FAIL 0 WARN（C8 56 key）；`npm run build` 通过
- 需求文档同步：§5 [P-132]/[P-133]（provisional）、§6.5.2/§6.5.6、附录 A E273
- 提交：待提交（E273）
- 遗留：新鲜但无日期字段的智谱/MiniMax 页（0.626）仍低于胡润50强（0.699）；随 devil-v25 回归评估是否调 [P-132]/[P-26] 标定；临时调试脚本已清理

## E274 补记（同日）：S5 合成截断机制修复

### 背景

按 handoff「下一步」用真实管道复测同一 query：E273 后回答已直接区分「上市市值 vs 一级市场估值」并准备列名单，但 deepseek-v4 系列思考块与最终答案共享 `max_tokens`，800 上限下思考块稍长即把答案截断成残句（实测截于「结合最近一个」，source=llm 静默返回，无任何提示）。属 S5 合成机制问题，非融合层。

### 修复（E274，全机制级）

- `src/search/llm-client.ts`：解析 `finish_reason`，新增 opt-in `rejectOnTruncate`（默认行为不变，不影响分类/路由等短任务），`finish_reason=length` 抛 `LLMLengthTruncatedError`（含剥离 think 后的 partial）
- `src/search/llm-registry.ts`：fallback 链对截断错误直接上抛不换 provider（同 maxTokens 换家仍截断，避免白耗预算）
- `src/search/stages/s5_synthesize.ts`：单次合成按 [P-134]=1500 maxTokens，仍截断按 [P-135]=3200 重试一次，再失败走 §6.7 降级链；P0 提示补「回答正文保持精炼、直接给结论不做冗余展开」
- `src/config/params.ts` + 需求文档：§5 登记 [P-134]/[P-135]（provisional@2026-08-28）、§6.7 合成输出预算说明、附录 A E274

### 校准依据（直连探针）

- medium（v4-flash，桌面默认档）真实规模正文探针（5407 prompt tokens）：1500 maxTokens 5.8s `finish_reason=stop` 完整作答 642 字，远低于 [P-116] 12s 预算
- heavy（v4-pro）：2000 tokens 需 33.4s（reasoning 1602）> [P-130] 30s → 管道重 tier 仍超时走显式「回答生成超时」兜底（与 E273 已接受行为一致）；1200 tokens 全耗思考（finish=length 空正文）→ 触发截断检测；1500+精炼约束 25.2s 收口（单次样本）
- 真实管道 E2E（CLI heavy）：修复前 800 截断残句；修复后重 tier 超时走显式兜底，不再静默残句

### 验证

- 新增/更新单测 5 条（llm-client 截断抛错/stop 不干扰 2、llm-registry 截断不换 provider 1、s5 截断重试成功/重试仍截断走兜底 2）；全量单测 + 集成 32/32 全绿；doc-lint 0 FAIL 0 WARN（C8 58 key）
- 残余（环境因素）：本次复测期间 Tavily 月配额耗尽，召回缺高价值市值数据页，LLM 只能诚实说明「证据未覆盖」——待配额恢复后复测

## E275 补记（同日）：市值/排名类数值列举——内容形态密度加权 + 零数字覆盖门控 + rule1 % 排除

### 背景

用户实测 v1.0「中国AI大模型公司市值较高的是哪几家?」：仍回答「给不出市值排名」（只有 DeepSeek 710 亿美元 + 竞争力榜单），Web 版能给出智谱/MiniMax/讯飞/三六零/DeepSeek/Kimi 具体数字。按用户给出的两件事方案推进：

1. **诊断日志**（`DIAGNOSE_NUMERIC=1`，`pipeline.ts` 候选池 vs evidence 双 dump）——确诊在**融合层**：候选池 58 条含 36 条带数字量级（智谱5000亿港元/寒武纪6300亿/MiniMax900亿/讯飞1022亿/三六零555亿），但 evidence 只有 3 条泛文（0.946 东方财富700亿/0.925 中华网TOP20/0.900 IPO 泛文），公司数据页 0.617~0.862 被压出 top-K。召回无问题。

2. **[P-ZZZ'] 第一期三动作**（机制级，无领域规则）：
   - **① predicate 输出字段**：`AnswerResult.predicate`（§6.3），纯跨领域疑问词解析
   - **② 内容形态密度加权加分**：数值 predicate 且 rel≥0.1 时，`[P-136] × min(头部独立数值计数, [P-138])`。纯加项 0.15 无法拉开差距（全文密度噪声大——长文自然多数字，700亿泛文/首页基金收益率都沾光）；改为「标题+正文头部」密度后，公司数据页（guba 10 个、五小龙 4 个）显著高于泛文（1~3 个）；rel<0.1 不加分（东财首页基金 424.39% 零相关不沾光）
   - **③ 覆盖度门控 + 补检索**：数值 predicate 且 evidence/正文完全无数字 → 一次带单位后缀（[P-137]）补检索后重新融合，补完仍无数字才允许 LLM 诚实降级

3. **附带机制修复（rule1 `%` 排除）**：rule1 把 `%` 当单一属性仲裁，金融 query 下涨跌幅/收益率不同 `%` 全被判冲突 → 所有页面 fact 归零 + 误触发 low_confidence 门（五小龙 36.9%/MiniMax 18.46%/首页 424.39% 互撞）。`%` 是跨领域通用比例单位，排除出冲突仲裁（规格类 V/A/W/Hz/℃ 不受影响）。

### 校准过程

- 初版纯加项 0.15：所有带数字页同权受益，top-3 仍被 700亿泛文族占满 → 改密度加权
- 全文密度：CSDN 报告/东财首页等长文自然 5~13 个数字 → 无法区分 → 改头部（标题+正文前 200 字）密度
- rel 护栏：东财首页（基金收益率，rel=0.00）被 +0.75 抬到 1.34 → 加 rel≥0.1 才加分
- rule1 % 排除后：五小龙 fact 0→1，gate low_confidence→none

### 验证（真实管道，桌面默认 medium=deepseek-v4-flash）

- evidence top-3 稳定含公司级市值页：五小龙（智谱5000亿港元/MiniMax3000亿）、guba（讯飞1022亿/三六零555亿/昆仑万维408亿）、7天狂飙（MiniMax3000亿港元）、投中网（智谱破1.04万亿港元）
- LLM 直接作答：「智谱市值站上1.04万亿港元/MiniMax 上市次日破千亿/科大讯飞1022亿/三六零555亿/寒武纪6300亿」并诚实标注时效边界（guba 2024 数据判旧）
- 新增/更新单测 3 条（numeric-pattern 密度计数 1、fusion 密度加权 1、rule1 % 排除 1）；全量单测 + 集成 32/32 全绿；doc-lint 0 FAIL 0 WARN（C8 61 key）
- 残余：Tavily 月配额耗尽期间召回缺最新智谱/MiniMax 页偶发缺席（环境因素）；deepseek medium 大正文下偶发撞 [P-116] 12s 预算（API 延迟，显式兜底）

## E276 补记（同日）：合成预算瘦身——正文注入 3000→1500 + 超时兜底去 URL 墙

### 背景

E275 交付后用户实测同 query 仍答非所问，桌面实测 55~90s/次、token 消耗高：`DIAGNOSE_NUMERIC=1` 候选池 vs evidence 对照显示融合已正常（guba 讯飞1022亿/三六零555亿/昆仑万维408亿 已进 top-3），真凶在 P0 四步链路——3 篇正文各 [P-128] 3000 字符 ≈ 8~10k tokens 喂合成，medium（deepseek-v4-flash）在 [P-06]/[P-116] 12s 预算内完不成 → 超时 → `s5_synthesize.ts` 兜底输出「搜索到了 N 条…已抓取正文：T（U）；T（U）」URL 墙。

### 修复（全机制级）

1. **[P-128] 3000→1500 字符**：数值/列举类页面关键数据集中在正文头部，截断不丢数字；3 篇 × 1.5k ≈ 4.4~5k tokens，medium 合成稳定收口在预算内
2. **`s5_synthesize.ts` 超时兜底重写**：不再「搜索到了 N 条」/「已抓取正文」URL 墙，改为「回答生成超时，以下为本次检索到的相关资料…」+ 每条来源：标题（无 `<title>` 页用域名兜底 `sourceLabel`）+ 正文头部 120 字片段 + URL 独立一行，按 URL 去重（pageContents 优先）
3. **`pipeline.ts` gate 升级放宽**：合成失败时 `gate === 'none' || gate === 'low_confidence'` → `synthesis_timeout`（超时不再被低置信门掩盖成「证据不足」）

### 验证（真实管道，桌面默认档 medium=deepseek-v4-flash）

- prompt 字符：3000 配置 ~7320 → 1500 配置 4921~5020（降约 1/3）
- 5 次复测：2 次 LLM 直接作答（elapsed 10.4~11.5s，含 智谱破1万亿港元/寒武纪6300亿/摩尔线程3100亿/沐曦2500亿），3 次撞 12s（deepseek API 延迟波动）走新 fallback——干净、带数字、gate 正确（none/synthesis_timeout）
- heavy（v4-pro）CLI 复测仍撞 30s（E274 已知行为）但 fallback 干净；flash 延迟探针小 prompt 1.2s、同规模 9.2s → 主因 API 延迟波动
- 新增/更新单测 6 条；相关 6 文件单测 123/123 绿；全量单测 1073（1072 pass / 1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN
- 基准：`bench/B-20260828-02-synthesis-budget-fit.md`（E276 证据）
- 登记：附录 A E276；[P-128] provisional@2026-08-28
