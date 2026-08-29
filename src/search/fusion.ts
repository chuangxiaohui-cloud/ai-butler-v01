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
import { classifyPredicate, type PredicateKind } from './answer-readiness.js';
import { numericUnitCount } from './numeric-pattern.js';
import { isRecencySensitiveQuery } from './recency.js';
import { PARAMS } from '../config/params.js';

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
  /** 完整通过 minScore 门槛的排序列表（top-K 截断前，E275 诊断用） */
  ranked: FusionItem[];
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

// P-ZZZ' 信号 A：证据粒度匹配（重构）——按意图偏好「证据形态」而非领域词。
// 形态检测与领域无关：数字/日期/步骤/引述/标识符；不包含任何领域关键词/域名/实体。
interface ShapeFlags {
  numeric: boolean;
  date: boolean;
  steps: boolean;
  attribution: boolean;
  identifier: boolean;
}

function detectShapes(textLower: string): ShapeFlags {
  // 数值形态按「密度」判定：≥2 处数值才视为数据型证据（规格/列表页天然多数值；
  // 只有零星年份/编号的泛文不算覆盖）——与领域无关的纯形态信号
  const numericHits = (textLower.match(/\d[\d,.]*/g) ?? []).length;
  return {
    numeric: numericHits >= 2,
    date:
      /(?:19|20)\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?/.test(textLower) ||
      /\d{1,2}月\d{1,2}日/.test(textLower) ||
      /(?:19|20)\d{6}/.test(textLower),
    steps:
      /第[一二三四五六七八九十百\d]+[步环阶段]/.test(textLower) ||
      /(?:^|\n)\s*\d+[\.、)．]/.test(textLower),
    attribution: /认为|表示|指出|称|透露|预计|宣称|宣布|强调|解释/.test(textLower),
    identifier: /[a-z][a-z0-9_]{2,}/i.test(textLower) && /[a-z]{2,}/i.test(textLower),
  };
}

/** 意图 → 证据形态偏好（与 query 领域无关；键为项目自有意图枚举） */
const INTENT_SHAPE_PREFERENCE: Partial<Record<IntentKey, Array<keyof ShapeFlags>>> = {
  factual: ['numeric', 'date', 'identifier'],
  comparison: ['numeric', 'identifier'],
  how_to: ['steps', 'identifier'],
  troubleshooting: ['steps', 'identifier'],
  experience: ['attribution', 'steps'],
  news: ['date', 'attribution', 'numeric'],
  github_analysis: ['identifier'],
};

function answerCoverageScore(
  intent: IntentKey,
  textLower: string,
  predicate: PredicateKind = 'other',
): number {
  const prefs = INTENT_SHAPE_PREFERENCE[intent];
  if (!prefs || prefs.length === 0) return 1;
  const shapes = detectShapes(textLower);
  const hits = prefs.filter((p) => shapes[p]).length;
  // predicate 感知加成（E273）：数值/时序 predicate 下，对应主形态命中即视为「直接作答」
  // 证据——纯数字数据页（市值/榜单 snippet 通常只有数字、无日期/引述）不再被
  // 「带日期+引述但无数字」的新闻页以覆盖度压过；只加成不惩罚，避免误伤中文数词页。
  if (predicate === 'numeric' && shapes.numeric) return Math.min(1, 0.5 + hits / 2);
  if (predicate === 'temporal' && shapes.date) return Math.min(1, 0.5 + hits / 2);
  return Math.min(1, hits / 2);
}

// P-ZZZ' 信号 C：证据多样性约束（零依赖语义近似）——同域名 + token Jaccard 超阈值视为同质簇，
// 从剩余候选中替换为异质高分项，保证 top-K 至少覆盖 ≥2 个语义簇。纯结构信号，与领域无关。
function diversityTokens(text: string): Set<string> {
  return new Set(tokenizeText(text));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function isHomogeneousPair(a: FusionItem, b: FusionItem): boolean {
  let hostA = '';
  let hostB = '';
  try {
    hostA = new URL(a.result.url).hostname;
    hostB = new URL(b.result.url).hostname;
  } catch {
    return false;
  }
  const sim = jaccard(
    diversityTokens(a.result.title + ' ' + a.result.content),
    diversityTokens(b.result.title + ' ' + b.result.content),
  );
  if (hostA !== '' && hostA === hostB) {
    // 同域页面：沿用 [P-131] 同质阈值（站内高度相似页）
    return sim >= PARAMS.evidenceDiversityJaccard;
  }
  if (hostA !== '' && hostB !== '' && hostA !== hostB) {
    // 跨域「转载同文」：同一篇文章被多家门户转载（标题/正文 token Jaccard 极高，
    // 实测同文 ≥0.92、不同文章 ≤0.13，0.75 为安全高阈值）；按 [P-133] 判同质，
    // 避免同文多域重复占用 top-K 槽位。
    return sim >= PARAMS.syndicatedDupJaccard;
  }
  return false;
}

function ensureDiversity(sorted: FusionItem[], fused: FusionItem[]): FusionItem[] {
  if (sorted.length < 2) return sorted;
  const result = [...sorted];
  const rest = fused.filter((f) => !result.includes(f));
  for (let i = 1; i < result.length; i += 1) {
    const prev = result.slice(0, i);
    if (!prev.some((p) => isHomogeneousPair(p, result[i]))) continue;
    const replacement = rest
      .filter((r) => !prev.some((p) => isHomogeneousPair(p, r)))
      .sort((a, b) => b.finalScore - a.finalScore)[0];
    if (!replacement) continue;
    result[i] = replacement;
    const idx = rest.indexOf(replacement);
    if (idx >= 0) rest.splice(idx, 1);
  }
  return result;
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
  // 缺失日期统一按中性兜底（0.5）：AnySearch 等引擎不回传日期字段，
  // 强时效意图下若按 0.15 会把「无日期但内容即答案」的数据页整体压到丢弃线以下；
  // 带日期的旧闻仍按窗口衰减到 0，不受此兜底影响。
  const missing = 0.5;
  if (!item.published) return missing;
  const days = (Date.now() - new Date(item.published).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return missing;
  const windowDays = recencySensitive ? 90 : 365;
  return Math.max(0, Math.min(1, 1 - days / windowDays));
}

function usabilityScore(item: SearchResultItem): number {
  const len = item.content.length;
  const hasDigit = /\d/.test(item.content);
  if (len >= 200 && hasDigit) return 0.8;
  if (len >= 200) return 0.6;
  // 短片段但含数值：数据页/榜单页 snippet 常短于 200 字符（如「智谱市值首破万亿
  // ・ 收盘价 2410 港元」），数值密度本身是可用性信号——短数字片段与长数字文章
  // 对「给数值」类 query 同样可用，直接对齐 0.8（E273 校准）。
  if (len >= 60 && hasDigit) return 0.8;
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
  // E273：predicate 类型（数值/时序/操作/观点）一次算好，供覆盖度信号按 query 需求加权
  const predicate = classifyPredicate(query);
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
    const answerCoverage = answerCoverageScore(intent, itemText.lower, predicate);
    const timeliness = timelinessScore(result, recencySensitive);
    const usability = usabilityScore(result);
    const factConsistency = rule1.factConsistency.get(result.url) ?? 1;
    let score =
      weights[0] * relevance +
      weights[1] * timeliness +
      weights[2] * usability +
      weights[3] * factConsistency;
    const shapePrefs = INTENT_SHAPE_PREFERENCE[intent];
    if (shapePrefs && shapePrefs.length > 0) {
      score += PARAMS.coverageScoreWeight * answerCoverage;
    }
    // E275：数值 predicate 下，含「数字+量级单位」的证据按「标题+正文头部」独立数值密度加权加分
    // （[P-136]×min(count,[P-138])）。密度只看头部：公司级数据页头部天然集中公司市值对
    // （guba 讯飞1022亿/三六零555亿/昆仑万维408亿…10 个），泛文头部只有 1~3 个；
    // 长文正文后段的数字多为融资/参数/预测等次要数字，不进密度。
    // 相关性护栏（rel≥0.1）：数字形态加分只作用于与 query 相关的证据——东财首页基金收益率
    // （rel=0.00，含 424.39% 等噪音数字）不加分，避免门户首页混入 top-K。
    if (predicate === 'numeric' && relevance >= 0.1) {
      const count = numericUnitCount(itemText.text.slice(0, 240));
      if (count > 0) {
        score += PARAMS.numericPatternBonus * Math.min(PARAMS.numericPatternCountCap, count);
      }
    }
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
  // P-ZZZ' 信号 C：top-K 内同质簇替换，保证证据多样（零依赖 token Jaccard）
  const diverse = ensureDiversity(sorted, fused);
  const ranked = [...kept].sort((a, b) => b.finalScore - a.finalScore);
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
    items: diverse,
    ranked,
    dropped,
    gated: rule1.gated,
    lowConfidence,
  };
}
