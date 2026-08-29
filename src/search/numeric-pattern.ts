/**
 * 领域无关「数字+量级单位」形态检测（[P-ZZZ'] 信号 B 雏形，E275 诊断，E277 单位表跨领域扩展）。
 * 不认识「市值/价格/延迟/评分」等具体领域词，只认「数字 + 量级单位」——
 * 对 6300亿 / 1022亿 / 4800亿港元 / 700亿元 / 增长 8% / 12ms / 96核 / 120帧 / 4.9星 同样生效，零领域词表。
 * 供「候选池 vs evidence」对照诊断与后续数值列举型打分/门控复用。
 */

/** 数字 + 量级单位表（金额/时间延迟/硬件/音视频/评分计数，领域中性，E277 扩展） */
export const NUMERIC_UNITS = [
  // 金额（保留，但不再是唯一主角）
  '亿', '万', '千', '港元', '美元', '美金', '元', '块',
  // 时间 / 延迟（数据库、性能类核心；'分' 兼作时间与评分单位，语义不区分——只关心「数字+量级单位」）
  'ms', '毫秒', 'us', '微秒', 'ns', '纳秒', '秒', 's', '分', '分钟', '小时', 'h',
  // 延迟百分位标签（p50/p99/p999，E279：benchmark 页常见写法；数值本身通常另有 ms 等量纲兜底）
  'p50', 'p99', 'p999',
  // 吞吐（TPS/QPS/IOPS，E279：数据库/存储 benchmark 标配，量纲无关）
  'TPS', 'QPS', 'IOPS',
  // 硬件规格（CPU/内存/存储）
  '核', 'GHz', 'MHz', 'GB', 'TB', 'MB', 'KB',
  // 音视频 / 图形（帧率、码率、分辨率）
  '帧', 'fps', 'Hz', 'kHz', 'Mbps', 'Kbps',
  // 评分 / 比例 / 计数
  '星', '颗', '%', '倍', '个', '项', '条',
];

/** 长单位优先（毫秒/分钟 先于 秒/分），英文单位加结束词边界防子串误匹配（12ms 命中、12msx 不命中） */
const NUMERIC_UNIT_ALTERNATION = [...NUMERIC_UNITS]
  .sort((a, b) => b.length - a.length)
  .map((u) =>
    /^[A-Za-z]+$/.test(u) ? `${u}(?![A-Za-z0-9])` : u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )
  .join('|');

const NUMERIC_UNIT_RE = new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${NUMERIC_UNIT_ALTERNATION})`);
const NUMERIC_UNIT_RE_G = new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${NUMERIC_UNIT_ALTERNATION})`, 'g');

/** 文本是否含「数字+量级单位」（不感知领域，不要求与 query 共现） */
export function hasNumericUnit(text: string): boolean {
  return NUMERIC_UNIT_RE.test(text);
}

/** numeric unit count for density weighting */
export function numericUnitCount(text: string): number {
  const matches = text.match(NUMERIC_UNIT_RE_G) ?? [];
  return new Set(matches.map((m) => m.replace(/\s+/g, ''))).size;
}

/** 文本是否含任意数字（补检索触发用的弱信号；hasNumericUnit 蕴含本判定） */
export function hasAnyNumber(text: string): boolean {
  return /\d/.test(text);
}

const QUERY_STOPWORDS = new Set([
  '中国', '公司', '较高', '哪些', '几家', '一家', '几个', '什么', '怎么', '多少',
  '的', '是', '了', '吗', '呢', '请', '帮', '一下', '列出', '介绍', '比较', '分别',
]);

/** 提取 query 中文串的 2~3 字滑窗片段（去停用词），供「与 query 主题共现」参考 */
export function queryTopicTokens(query: string): string[] {
  const runs = query.match(/[\u4e00-\u9fff]+/g) ?? [];
  const tokens = new Set<string>();
  for (const run of runs) {
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= run.length; i++) {
        const t = run.slice(i, i + n);
        if (!QUERY_STOPWORDS.has(t)) tokens.add(t);
      }
    }
  }
  return [...tokens];
}

/** 文本与 query 主题词是否共现（诊断参考字段；数值判定不依赖它） */
export function cooccursWithQuery(text: string, query: string): boolean {
  const tokens = queryTopicTokens(query);
  return tokens.some((t) => text.includes(t));
}
