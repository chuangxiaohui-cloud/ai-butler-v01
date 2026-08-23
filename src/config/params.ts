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
  /** P-116 LLM fallback 链总预算（对齐 [P-06] Stage 5 预算） */
  llmFallbackTotalBudgetMs: 12_000,
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
  /** P-13 深度报告增量预算（生成+证据组装，不含内部搜索调用；对齐 §4.3.2） */
  deepReportBudgetMs: 13_000,
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
  secondPassBudgetMs: 'P-117',
  pdfParseMaxBytes: 'P-118',
  calibrationWindowDays: 'P-119',
  llmRuleBoostMax: 'P-120',
  cdpStateTtlMs: 'P-121',
  deepReportBudgetMs: 'P-13',
};
