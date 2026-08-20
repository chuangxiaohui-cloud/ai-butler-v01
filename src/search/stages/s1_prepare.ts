/**
 * Stage 1 预处理（§6.1.1）
 * 黑话映射（快路径）→ 脱敏 → 指代消解/澄清判定 → 缓存检查。
 * 记忆调用（L1-L3）在 WP8 接入，此处保留 memoryNotes 槽位。
 */

import { getCache, hashQuery } from '../cache.js';

export interface ClarifySuggestion {
  reason: string;
  question: string;
}

export interface PreparedQuery {
  originalQuery: string;
  cleanQuery: string;
  cacheKey: string;
  cachedValue: string | null;
  clarify: ClarifySuggestion | null;
  memoryNotes: string[];
}

const DEFAULT_JARGON_MAP: Record<string, string> = {
  protel: 'Altium Designer',
};

const SENSITIVE_PATTERNS = [
  /[A-Za-z]:\\[^\s,，。；;]+/g,
  /(?:https?:\/\/)?\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /(?:C:\\Users\\[^\\]+|~\\)[^\s,，。；;]*/g,
];

const PRONOUN_RE = /(这个|那个|这|那)(芯片|器件|项目|软件|型号|板子|板卡)/;
const ACTION_VERB_RE = /打包|重写|改写|画|写|生成|导出|发给|发送|修改|查|分析|创建|新建|删除|压缩/;
const PART_NUMBER_RE = /[A-Z]{2,}[0-9A-Z-]{2,}|[A-Z]{2,}[0-9]{2,}/;
const URL_RE = /https?:\/\/\S+/;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const LOCATION_DEPENDENT_RE =
  /附近|周边|哪里有|哪家|好吃|餐厅|餐馆|外卖|天气|快递|门店|维修|加油站/;
const LOCATION_HINT_RE =
  /[\u4e00-\u9fff]{2,}(市|区|县|镇|路|街|站|机场)|(深圳|北京|上海|广州|成都|杭州|武汉|南京|重庆|西安|苏州|天津|长沙|郑州|青岛|大连|厦门|福州|合肥|昆明|南宁|贵阳|海口|乌鲁木齐|拉萨|兰州|西宁|银川|呼和浩特|哈尔滨|长春|沈阳|石家庄|太原|济南|华强北|中关村)/;

export function normalizeMarkdownLinks(query: string): string {
  return query.replace(
    MARKDOWN_LINK_RE,
    (_whole, label: string, url: string) => {
      const text = label.trim();
      return text.includes(url) ? text : `${text} ${url}`;
    },
  );
}

export function applyJargonMap(
  query: string,
  map: Record<string, string> = DEFAULT_JARGON_MAP,
): string {
  let out = query;
  for (const [key, value] of Object.entries(map)) {
    out = out.replace(new RegExp(key, 'ig'), value);
  }
  return out;
}

export function sanitizeQuery(query: string): string {
  let out = query;
  for (const pattern of SENSITIVE_PATTERNS) out = out.replace(pattern, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function detectClarify(query: string): ClarifySuggestion | null {
  if (LOCATION_DEPENDENT_RE.test(query) && !LOCATION_HINT_RE.test(query)) {
    return {
      reason: 'location_missing',
      question: '请告诉我你在哪个城市或区域，我按当地给你查。',
    };
  }
  if (/大殖子/.test(query) && !/[A-Za-z0-9]{4,}/.test(query)) {
    return {
      reason: 'unknown_jargon',
      question: '“大殖子”这个说法我还没记住，你先告诉我它指哪个工具或项目，我记下来下次直接用。',
    };
  }
  // 已给出链接时视为指代已解决，不再要求补充型号/链接
  if (URL_RE.test(query)) return null;
  // 有明确动作指令时，指代由执行链处理，不在此处澄清
  if (ACTION_VERB_RE.test(query)) return null;
  if (PRONOUN_RE.test(query) && !PART_NUMBER_RE.test(query)) {
    return {
      reason: 'pronoun_unresolved',
      question: '你说的是哪个芯片/项目？给我具体型号或链接。',
    };
  }
  return null;
}

export function prepareQuery(query: string): PreparedQuery {
  const cleanQuery = sanitizeQuery(applyJargonMap(normalizeMarkdownLinks(query)));
  const cacheKey = `search:${hashQuery(cleanQuery)}`;
  return {
    originalQuery: query,
    cleanQuery,
    cacheKey,
    cachedValue: getCache(cacheKey),
    clarify: detectClarify(query),
    memoryNotes: [],
  };
}
