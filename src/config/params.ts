/**
 * §5 PARAM 登记中心（Week 1 新建，Phase 2 迁移路由参数）
 * 纪律：
 *  - 每个参数 = P-NN 编号 + camelCase key，编号全局唯一递增；
 *  - P-80~P-82 / P-84 / P-95~P-104 为路由参数迁移，行为值不变。
 */

export const PARAMS = {
  /** P-80 路由高置信直接执行阈值 */
  routeConfidenceHigh: 0.75,
  /** P-81 路由低置信必须澄清阈值 */
  routeConfidenceLow: 0.45,
  /** P-82 候选分差低于此值判定歧义 */
  routeCandidateGap: 0.15,
  /** P-84 fallback 提取全局置信度折扣 */
  fallbackDiscount: 0.9,
  /** P-89 wrapLegacySkill 包装旧 handler 的默认置信度 */
  legacySkillConfidence: 0.8,
  /** P-90 长期事实注入 prompt 的最低置信度 */
  injectMinConfidence: 0.6,
  /** P-91 单次注入长期事实条数上限 */
  injectMaxFacts: 10,
  /** P-92 30天未访问衰减系数(user_explicit/corrected 减半应用) */
  decayFactor30d: 0.9,
  /** P-93 90天未访问衰减系数 */
  decayFactor90d: 0.7,
  /** P-94 低于此值归档、不再注入 */
  archiveThreshold: 0.3,
  /** P-95 actionType 权重 */
  actionTypeWeight: 0.3,
  /** P-96 targetDomain 权重 */
  targetDomainWeight: 0.25,
  /** P-97 scope 权重 */
  scopeWeight: 0.15,
  /** P-98 searchSourceHint 权重 */
  searchSourceHintWeight: 0.1,
  /** P-99 urgency 权重 */
  urgencyWeight: 0.03,
  /** P-100 ambiguityFlags 权重 */
  ambiguityFlagsWeight: 0.08,
  /** P-101 hasImage 权重 */
  hasImageWeight: 0.05,
  /** P-102 hasDocument 权重 */
  hasDocumentWeight: 0.04,
  /** P-103 路由候选 base 最低分 */
  routeBaseThreshold: 0.29,
  /** P-104 单次路由最多候选数 */
  routeMaxCandidates: 3,
  /** P-105 模型路由默认档（便宜优先，缺省中档） */
  modelRouterDefaultTier: 'medium',
  /** P-106 模型路由轻档最低置信度（仅无搜索需求时启用） */
  modelRouterLightConfidence: 0.9,
  /** P-107 Provider fallback 链上限 */
  providerFallbackMax: 3,
  /** P-110 搜索缓存最大条目数（LRU 淘汰） */
  cacheMaxEntries: 2000,
  /** P-111 文档解析 Python 子进程超时 */
  documentParsePythonTimeoutMs: 20_000,
  /** P-112 office-daily Python 子进程超时 */
  officePythonTimeoutMs: 120_000,
  /** P-113 单文件 JSONL 轮转大小上限（50MB） */
  jsonlMaxBytes: 50 * 1024 * 1024,
  /** P-114 gateway 限速桶最大 IP 条目数 */
  rateLimitMaxEntries: 10_000,
  /** P-115 /api/ask 最大并发请求数 */
  askMaxConcurrent: 4,
  /** P-116 LLM fallback 链总预算（对齐 [P-06] Stage 5 预算，medium 档基准；E281：12s→18s 给 deepseek 抖动留余量） */
  llmFallbackTotalBudgetMs: 18_000,
  /** P-129 light 档 fallback 链总预算（分类等轻任务，快模型短预算） */
  llmFallbackBudgetLightMs: 5_000,
  /** P-130 heavy 档 fallback 链总预算（v4-pro 等推理模型合成，实测 >18s，放宽到单客户端超时上限） */
  llmFallbackBudgetHeavyMs: 30_000,
  /** P-140 运行时看门狗统计窗口：最近 1 小时内统计 answer 轨迹的 synthesis_timeout 占比（E282，环境噪音显式化） */
  watchdogWindowMs: 60 * 60 * 1000,
  /** P-141 运行时看门狗告警阈值：窗口内 synthesis_timeout 占比 ≥ 该值时经 toolNotice 告警（E282） */
  watchdogTimeoutRatio: 0.2,
  /** P-142 GitHub API JSON 缓存 TTL（E284：只缓存 repo/contributors/commits/releases 元数据；raw README/manifest 不缓存） */
  githubApiCacheTtlMs: 300_000,
  /** P-117 低置信二次取证总预算（对齐单目标抓取 8s 超时） */
  secondPassBudgetMs: 8_000,
  /** P-118 取证 PDF 解析大小上限 */
  pdfParseMaxBytes: 20 * 1024 * 1024,
  /** P-119 路由校准样本时间窗（天） */
  calibrationWindowDays: 30,
  /** P-120 LLM 规则提案 confidenceBoost 上限 */
  llmRuleBoostMax: 0.25,
  /** P-121 CDP 调试口状态自动过期时间（风险窗口有界） */
  cdpStateTtlMs: 10 * 60 * 1000,
  /** P-122 Skill 生成 per-call 预算（engineer/content-writer 长文生成，实测 41-53s；长需求 60s 撞线，90s 留余量） */
  skillGenerationBudgetMs: 90_000,
  /** P-123 IM 输出适配上限（§4.5 短正文优先，超长截断避免刷屏） */
  imMaxLength: 500,
  /** P-124 浏览器操作单任务最大动作数（§4.1.5 有界与成本） */
  browserOpMaxSteps: 30,
  /** P-125 浏览器操作单步执行超时（§4.1.5） */
  browserOpStepTimeoutMs: 15_000,
  /** P-126 浏览器操作每步 DOM 快照上限（§4.1.5） */
  browserOpDomSnapshotMaxChars: 8_000,
  /** P-127 知识问答抓取正文进合成的单页存储上限（P0 四步链路，browser 证据） */
  knowledgePageFetchChars: 4_000,
  /** P-128 Stage 5 网页正文单篇注入 prompt 上限（E276：3000→1500，与 medium 18s 预算匹配；3 篇 × 1.5k ≈ 4.4k tokens，实测合成稳定收口在预算内；数值/列举页数字集中在头部，截断不丢关键数据） */
  synthesizePageTextChars: 1_500,
  /** P-131 证据多样性约束：标题/正文 token Jaccard 超过该值视为同质簇（零依赖语义近似） */
  evidenceDiversityJaccard: 0.6,
  /** P-132 融合评分答案覆盖加成权重：信号 A 按 answerCoverage 加成分（不稀释四维权重） */
  coverageScoreWeight: 0.15,
  /** P-133 跨域转载同文 Jaccard 阈值：不同域名同文转载（实测同文 ≥0.92、异文 ≤0.13） */
  syndicatedDupJaccard: 0.75,
  /** P-134 Stage 5 合成单次 maxTokens（思考块与答案共享预算；v4-pro 实测 1500 下约 25s 收口，2000 需 33s 撞 heavy 30s 预算） */
  synthesisMaxTokens: 1_500,
  /** P-135 Stage 5 合成截断重试 maxTokens（仍截断则走兜底，不反复重试） */
  synthesisMaxTokensRetry: 3_200,
  /** P-136 数值 predicate 下「数字+量级单位」密度加权内容形态加分：`bonus × min(count, [P-138])`（E275：公司级数据页按独立数值数加权，泛文单数值只加一档） */
  numericPatternBonus: 0.15,
  /** P-138 数值形态密度计数上限：单证据最多按 N 个独立「数值+单位」加权（防长文数字堆砌无意义膨胀） */
  numericPatternCountCap: 5,
  /** P-137 数值 predicate 证据零数字时的补检索查询后缀（E277：亿元→领域中性触发词，量纲无关，对市值/延迟/评分/价格全部适用；引导搜索引擎返回带数据的对比/表格页） */
  numericSupplementSuffix: ' 数据 参数 对比',
  /** P-139 数值 predicate 主检索增强子查询的覆盖度延迟上限（E279：仅增强子查询在队时延迟判够，超此轮数接受当前证据，防预算膨胀） */
  numericJudgeExtraSearchCap: 2,
  /** P-13 深度报告增量预算（生成+证据组装，不含内部搜索调用；对齐 §4.3.2） */
  deepReportBudgetMs: 45_000,
  /** P-38 编译/构建超时（§11.1.3，Keil/gcc/cmake） */
  compileTimeoutMs: 300_000,
  /** P-39 烧录/下载超时（§11.1.3） */
  flashTimeoutMs: 120_000,
  /** P-40 单文件生成超时（§11.1.3） */
  fileGenTimeoutMs: 60_000,
  /** P-41 子Agent心跳超时（§11.1.3） */
  subAgentHeartbeatMs: 30_000,
  /** P-44 确定性操作重试次数（§11.1.2，编译/下载/格式化） */
  subAgentRetryDeterministic: 2,
  /** P-45 非确定性操作重试次数（§11.1.2，生成类） */
  subAgentRetryNonDeterministic: 1,
  /** P-46 退避基数（§11.1.2，指数退避逐次翻倍） */
  subAgentBackoffBaseMs: 2_000,
  /** P-57 子Agent启动延迟（§4.3/§11，启动后须在此时间内进入执行状态） */
  subAgentStartTimeoutMs: 1_000,
} as const;

export type ParamKey = keyof typeof PARAMS;

/** camelCase key → P-NN，供 §5 追溯；Record 类型在编译期强制全覆盖 */
export const PARAM_IDS: Record<ParamKey, string> = {
  routeConfidenceHigh: 'P-80',
  routeConfidenceLow: 'P-81',
  routeCandidateGap: 'P-82',
  fallbackDiscount: 'P-84',
  legacySkillConfidence: 'P-89',
  injectMinConfidence: 'P-90',
  injectMaxFacts: 'P-91',
  decayFactor30d: 'P-92',
  decayFactor90d: 'P-93',
  archiveThreshold: 'P-94',
  actionTypeWeight: 'P-95',
  targetDomainWeight: 'P-96',
  scopeWeight: 'P-97',
  searchSourceHintWeight: 'P-98',
  urgencyWeight: 'P-99',
  ambiguityFlagsWeight: 'P-100',
  hasImageWeight: 'P-101',
  hasDocumentWeight: 'P-102',
  routeBaseThreshold: 'P-103',
  routeMaxCandidates: 'P-104',
  modelRouterDefaultTier: 'P-105',
  modelRouterLightConfidence: 'P-106',
  providerFallbackMax: 'P-107',
  cacheMaxEntries: 'P-110',
  documentParsePythonTimeoutMs: 'P-111',
  officePythonTimeoutMs: 'P-112',
  jsonlMaxBytes: 'P-113',
  rateLimitMaxEntries: 'P-114',
  askMaxConcurrent: 'P-115',
  llmFallbackTotalBudgetMs: 'P-116',
  llmFallbackBudgetLightMs: 'P-129',
  llmFallbackBudgetHeavyMs: 'P-130',
  watchdogWindowMs: 'P-140',
  watchdogTimeoutRatio: 'P-141',
  githubApiCacheTtlMs: 'P-142',
  secondPassBudgetMs: 'P-117',
  pdfParseMaxBytes: 'P-118',
  calibrationWindowDays: 'P-119',
  llmRuleBoostMax: 'P-120',
  compileTimeoutMs: 'P-38',
  flashTimeoutMs: 'P-39',
  fileGenTimeoutMs: 'P-40',
  subAgentHeartbeatMs: 'P-41',
  subAgentRetryDeterministic: 'P-44',
  subAgentRetryNonDeterministic: 'P-45',
  subAgentBackoffBaseMs: 'P-46',
  subAgentStartTimeoutMs: 'P-57',
  cdpStateTtlMs: 'P-121',
  skillGenerationBudgetMs: 'P-122',
  imMaxLength: 'P-123',
  browserOpMaxSteps: 'P-124',
  browserOpStepTimeoutMs: 'P-125',
  browserOpDomSnapshotMaxChars: 'P-126',
  knowledgePageFetchChars: 'P-127',
  synthesizePageTextChars: 'P-128',
  evidenceDiversityJaccard: 'P-131',
  coverageScoreWeight: 'P-132',
  syndicatedDupJaccard: 'P-133',
  synthesisMaxTokens: 'P-134',
  synthesisMaxTokensRetry: 'P-135',
  numericPatternBonus: 'P-136',
  numericPatternCountCap: 'P-138',
  numericSupplementSuffix: 'P-137',
  numericJudgeExtraSearchCap: 'P-139',
  deepReportBudgetMs: 'P-13',
};
