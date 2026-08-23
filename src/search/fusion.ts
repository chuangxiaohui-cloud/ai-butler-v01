/**
 * Stage 4 融合层：4 串行过滤器 + 加权评分（§6.5.1/6.5.2/6.5.4）
 * 实体匹配 → 去重 → SEO 降权 → 时效加权；评分含规则① fact_consistency 与官方源乘数。
 */

import {
  extractPartNumber,
  getDomainAuthority,
  isDomesticDatasheetUrl,
  isOfficialForQueryCtx,
  buildOfficialQueryContext,
  OFFICIAL_MULTIPLIER,
} from './authority.js';
import { resolveFactConsistency } from './rule1.js';
import type { SearchResultItem } from './providers/types.js';
import type { IntentKey } from './stages/s2_classify.js';
import { isRecencySensitiveQuery } from './recency.js';

export const DISCARD_THRESHOLD = 0.4; // [P-16]
export const LOW_CONFIDENCE_THRESHOLD = 0.6; // [P-17]
export const SIMPLE_TOP_K = 3; // [P-26]

const INTENT_WEIGHTS: Record<string, [number, number, number, number]> = {
  news: [0.2, 0.5, 0.2, 0.1],
  experience: [0.3, 0.2, 0.3, 0.2],
  factual: [0.3, 0.1, 0.3, 0.3],
  troubleshooting: [0.3, 0.2, 0.3, 0.2],
  comparison: [0.3, 0.1, 0.3, 0.3],
  how_to: [0.3, 0.1, 0.4, 0.2],
  default: [0.3, 0.2, 0.3, 0.2],
};

export interface FusionItem {
  result: SearchResultItem;
  domainAuthority: number;
  official: boolean;
  seoNoise: boolean;
  relevance: number;
  answerCoverage: number;
  timeliness: number;
  usability: number;
  factConsistency: number;
  finalScore: number;
}

export interface FusedOutput {
  items: FusionItem[];
  dropped: string[];
  gated: boolean;
  lowConfidence: boolean;
}

export interface FuseOptions {
  minScore?: number;
  skipRelevanceGate?: boolean;
}

function tokenizeText(text: string): string[] {
  const tokens: string[] = [];
  const ascii = text.match(/[a-z0-9][a-z0-9+#._/-]*/gi) ?? [];
  for (const t of ascii) tokens.push(t.toLowerCase());
  const cjk = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const chunk of cjk) {
    if (chunk.length <= 2) {
      tokens.push(chunk);
      continue;
    }
    if (chunk.length <= 6) tokens.push(chunk);
    for (let i = 0; i + 2 <= chunk.length; i += 1) {
      tokens.push(chunk.slice(i, i + 2));
    }
  }
  return tokens;
}

// P6：query 侧 tokenize+去重每条结果只算一次；per-item 只做小写包含判断
function buildRelevanceTokens(query: string): string[] {
  return [...new Set(tokenizeText(query))];
}

function relevanceScore(tokens: string[], textLower: string): number {
  if (tokens.length === 0) return 0.5;
  const hits = tokens.filter((t) => textLower.includes(t)).length;
  return hits / tokens.length;
}

const ANSWER_SIGNALS: Partial<Record<IntentKey, string[]>> = {
  factual: [
    '最大',
    '最小',
    '范围',
    '参数',
    '规格',
    '特性',
    '输入',
    '输出',
    '电压',
    '电流',
    '频率',
    '数据',
    'datasheet',
    'description',
    'features',
    'specifications',
    '用途',
    '简介',
    '多少',
    '是什么',
    '应用',
    '功率',
    '温度',
    '封装',
    '引脚',
    'maximum',
    'voltage',
    'current',
    'frequency',
  ],
  experience: [
    '经验',
    '踩坑',
    '坑',
    '注意',
    '教训',
    '实践',
    '解决',
    '问题',
    '建议',
    '避免',
    '容易',
    '实战',
    '注意事项',
    '心得',
    '技巧',
    '处理',
    '断连',
    '连接',
    '机制',
  ],
  comparison: [
    '对比',
    '区别',
    '比较',
    '优缺点',
    '优势',
    '劣势',
    '不同',
    '优于',
    '选择',
    '适合',
    'vs',
    'versus',
    'comparison',
    'difference',
    'pros',
    'cons',
    '优点',
    '缺点',
  ],
  how_to: [
    '步骤',
    '第1步',
    '第一步',
    '首先',
    '然后',
    '点击',
    '选择',
    '打开',
    '文件',
    '菜单',
    '导出',
    '生成',
    '设置',
    '配置',
    '输入',
    '确认',
    '保存',
    '完成',
    '工作台',
    '工具栏',
    '教程',
    '方法',
    'guide',
    'tutorial',
    'steps',
    'export',
    'import',
    'menu',
    'file',
    '流程',
  ],
  troubleshooting: [
    '报错',
    '错误',
    '失败',
    '原因',
    '解决',
    '修复',
    '排查',
    '检查',
    '方法',
    '步骤',
    '导致',
    '故障',
    '方案',
    '建议',
    '重试',
    '清除',
    '重启',
    '定位',
    '处理',
    'troubleshoot',
    'fix',
    'error',
    'cause',
    'solution',
    'diagnose',
    'debug',
  ],
  github_analysis: [
    '架构',
    '技术栈',
    '用途',
    '功能',
    '特性',
    '使用',
    '开源',
    '项目',
    '仓库',
    'readme',
    '简介',
    '特点',
    '分析',
    'architecture',
    'tech',
    'stack',
    'purpose',
    'feature',
    'usage',
    'open',
    'source',
  ],
  news: [
    '今日',
    '今天',
    '最新',
    '实时',
    '行情',
    '发布',
    '报道',
    '截至',
    '进展',
    '更新',
    'news',
    'latest',
    'report',
    'today',
  ],
};

// P6：信号表模块级预编译小写，避免每条结果重复 toLowerCase
const ANSWER_SIGNALS_LOWER: Partial<Record<IntentKey, string[]>> = Object.fromEntries(
  Object.entries(ANSWER_SIGNALS).map(([intent, signals]) => [
    intent,
    signals.map((s) => s.toLowerCase()),
  ]),
) as Partial<Record<IntentKey, string[]>>;

function answerCoverageScore(intent: IntentKey, textLower: string): number {
  const signals = ANSWER_SIGNALS_LOWER[intent];
  if (!signals || signals.length === 0) return 1;
  const hits = signals.filter((s) => textLower.includes(s)).length;
  return Math.min(1, hits / 3);
}

interface ItemText {
  text: string; // `${title} ${content}` 原始拼接
  lower: string; // 标题+正文全小写（P6：每 item 只拼一次）
  titleLower: string;
}

function buildItemText(item: SearchResultItem): ItemText {
  const text = `${item.title} ${item.content}`;
  return { text, lower: text.toLowerCase(), titleLower: item.title.toLowerCase() };
}

function isFaqWithoutProcedure(itemText: ItemText, intent: IntentKey): boolean {
  if (intent !== 'how_to') return false;
  if (!/常见疑问|常见问题|答疑|50答|q&a|faq|问答/.test(itemText.titleLower)) return false;
  return !/申报|填报|办理|操作流程|步骤|第[一二三四五六七八九十\d]步|一键确认|提交|入口|流程|guide|tutorial|steps/.test(itemText.lower);
}

const TROUBLESHOOTING_TOPIC_TERMS = [
  'drc',
  'clearance',
  'constraint',
  'nack',
  'transmit',
  '卡死',
  '无应答',
  '通信失败',
  '断连',
  '阻塞',
  '频繁',
];

function isErrorTopicMismatch(
  queryLower: string,
  itemText: ItemText,
  intent: IntentKey,
): boolean {
  if (intent !== 'troubleshooting') return false;
  const specific = TROUBLESHOOTING_TOPIC_TERMS.filter((term) => queryLower.includes(term));
  if (specific.length === 0) return false;
  return !specific.some((term) => itemText.titleLower.includes(term));
}

function timelinessScore(item: SearchResultItem, recencySensitive = false): number {
  const missing = recencySensitive ? 0.15 : 0.5;
  if (!item.published) return missing;
  const days = (Date.now() - new Date(item.published).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return missing;
  const windowDays = recencySensitive ? 90 : 365;
  return Math.max(0, Math.min(1, 1 - days / windowDays));
}

function usabilityScore(item: SearchResultItem): number {
  const len = item.content.length;
  if (len >= 200 && /\d/.test(item.content)) return 0.8;
  if (len >= 200) return 0.6;
  return 0.4;
}

function isSeoNoise(item: SearchResultItem, itemText: ItemText): boolean {
  if (
    /24小时|在线客服|人工服务|加微信|联系电话|联系客服|服务至上|现货|批发|免费注册|购物车|下单|爱采购|厂家|报价|订购|立即购买|欢迎咨询/.test(
      itemText.lower,
    )
  ) {
    return true;
  }
  if (
    /文库|程序员大本营|文档下载|积分下载|下载文档|一键导入|永久使用|热点项目精选|维基词典|wiktionary|jisho|wanikani|汉字|笔顺|字源/.test(
      itemText.lower,
    )
  ) {
    return true;
  }
  if (!/\d/.test(item.content) && item.content.length < 80) return true;
  return false;
}

function dedupe(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const out: SearchResultItem[] = [];
  for (const item of items) {
    const key = item.url || `${item.title}|${item.content.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function entityFilter(query: string, items: SearchResultItem[]): SearchResultItem[] {
  const part = extractPartNumber(query);
  if (!part) return items;
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])(?!-[a-z0-9])`, 'i');
  const exactTitle = new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])(?!-[a-z0-9])`, 'i');
  const variantTitle = new RegExp(`(^|[^a-z0-9])${escaped}-?[a-z0-9]+(?![a-z0-9])`, 'i');
  return items.filter((item) => {
    if (!pattern.test(`${item.title} ${item.content}`)) return false;
    if (variantTitle.test(item.title) && !exactTitle.test(item.title)) return false;
    return true;
  });
}

const RELEVANCE_GATED_INTENTS = new Set<IntentKey>([
  'factual',
  'experience',
  'comparison',
  'how_to',
  'troubleshooting',
  'github_analysis',
]);

function mentionsDomesticDatasheet(query: string): boolean {
  return /立创|芯查查|半导小芯|szlcsc|xcc|semiee/i.test(query);
}

export function fuseResults(
  query: string,
  items: SearchResultItem[],
  intent: IntentKey,
  topK = SIMPLE_TOP_K,
  relevanceQuery = query,
  opts: FuseOptions = {},
): FusedOutput {
  const dropped: string[] = [];
  const minScore = opts.minScore ?? DISCARD_THRESHOLD;

  // 过滤器①：实体精确匹配
  let candidates = entityFilter(query, items);
  if (candidates.length !== items.length) {
    dropped.push(...items.filter((i) => !candidates.includes(i)).map((i) => i.url));
  }
  // 过滤器②：跨引擎去重
  candidates = dedupe(candidates);
  // 过滤器③：SEO 垃圾页标记降权
  // 过滤器④：时效权重在评分时按意图应用

  const rule1 = resolveFactConsistency(
    candidates.map((c) => ({ url: c.url, title: c.title, content: c.content, query })),
  );
  const recencySensitive = isRecencySensitiveQuery(query);
  const effectiveIntent = recencySensitive ? 'news' : intent;
  const weights = INTENT_WEIGHTS[effectiveIntent] ?? INTENT_WEIGHTS.default;
  // P6：query 派生值每条结果只算一次（relevance token / 官方域上下文 / 小写 query）
  const relevanceTokens = buildRelevanceTokens(relevanceQuery);
  const officialCtx = buildOfficialQueryContext(query);
  const queryLower = query.toLowerCase();

  const fused: FusionItem[] = candidates.map((result) => {
    const itemText = buildItemText(result);
    const official = isOfficialForQueryCtx(result.url, officialCtx);
    const domainAuthority = getDomainAuthority(result.url);
    const seoNoise =
      isSeoNoise(result, itemText) &&
      !(result.provider === 'browser' && (official || isDomesticDatasheetUrl(result.url)));
    const relevance = relevanceScore(relevanceTokens, itemText.lower);
    const answerCoverage = answerCoverageScore(intent, itemText.lower);
    const timeliness = timelinessScore(result, recencySensitive);
    const usability = usabilityScore(result);
    const factConsistency = rule1.factConsistency.get(result.url) ?? 1;
    let score =
      weights[0] * relevance +
      weights[1] * timeliness +
      weights[2] * usability +
      weights[3] * factConsistency;
    if (seoNoise) score *= 0.5;
    if (
      !opts.skipRelevanceGate &&
      !official &&
      relevance < 0.5 &&
      answerCoverage < 0.6 &&
      RELEVANCE_GATED_INTENTS.has(intent)
    ) {
      score *= 0.7 + 0.3 * relevance;
    }
    if (!official && isFaqWithoutProcedure(itemText, intent)) score *= 0.75;
    if (!official && isErrorTopicMismatch(queryLower, itemText, intent)) score *= 0.75;
    if (!official) score *= 0.9 + 0.1 * domainAuthority;
    if (official) score *= OFFICIAL_MULTIPLIER;
    return {
      result,
      domainAuthority,
      official,
      seoNoise,
      relevance,
      answerCoverage,
      timeliness,
      usability,
      factConsistency,
      finalScore: Number(score.toFixed(3)),
    };
  });

  const kept = fused.filter((f) => {
    const ok = f.finalScore >= minScore;
    if (!ok) dropped.push(f.result.url);
    return ok;
  });
  const sorted = [...kept].sort((a, b) => b.finalScore - a.finalScore).slice(0, topK);
  const lowConfidence =
    sorted.length === 0 || sorted[0].finalScore < LOW_CONFIDENCE_THRESHOLD;

  // 用户点名国内资料站时，至少保留一条该站证据，避免被 top3 截断
  if (mentionsDomesticDatasheet(query)) {
    const domestic = fused
      .filter((f) => isDomesticDatasheetUrl(f.result.url))
      .sort((a, b) => b.finalScore - a.finalScore)[0];
    if (domestic && !sorted.some((f) => f.result.url === domestic.result.url)) {
      sorted.push(domestic);
    }
  }

  return {
    items: sorted,
    dropped,
    gated: rule1.gated,
    lowConfidence,
  };
}
