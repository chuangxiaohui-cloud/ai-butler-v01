/**
 * 来源权威注入（§6.5.3）
 * 域名权威度表 + 原厂域名映射 + 官方源乘数 [P-18]。
 */

export const OFFICIAL_MULTIPLIER = 1.2; // [P-18]

interface DomainRule {
  pattern: RegExp;
  authority: number;
  official?: boolean;
}

const DOMAIN_RULES: DomainRule[] = [
  { pattern: /(^|\.)ti\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)e2e\.ti\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)infineon\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)st\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)community\.st\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)freertos\.org$/, authority: 1.0, official: true },
  { pattern: /(^|\.)analog\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)espressif\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)github\.com$/, authority: 0.9, official: true },
  { pattern: /wikipedia\.org$/, authority: 0.9, official: true },
  { pattern: /(docs\.python\.org|react\.dev|v2\.tauri\.app|keil\.com)$/, authority: 0.9, official: true },
  { pattern: /(^|\.)(cmse|cnsa)\.gov\.cn$/, authority: 1.0, official: true },
  { pattern: /(^|\.)people\.com\.cn$/, authority: 0.9, official: true },
  { pattern: /(^|\.)news\.cn$/, authority: 0.9, official: true },
  { pattern: /(^|\.)(digikey|mouser|lcsc|szlcsc)\.(com|cn)$/, authority: 0.8 },
  { pattern: /(^|\.)xcc\.com$/, authority: 0.75 },
  { pattern: /(^|\.)semiee\.com$/, authority: 0.75 },
  { pattern: /(^|\.)alldatasheet\.com$/, authority: 0.7 },
  { pattern: /(^|\.)(zhihu|csdn|bilibili)\.(com|net)$/, authority: 0.75 },
  { pattern: /(^|\.)(tencent|aliyun)\.(com|cn)$/, authority: 0.7 },
  { pattern: /(^|\.)elecfans\.com$/, authority: 0.6 },
  { pattern: /jingyan\.baidu\.com$/, authority: 0.5 },
  // 金融/市值类权威源（P2，E270）：交易所与行情/榜单源，市值/排名问题不再平权
  { pattern: /(^|\.)sse\.com\.cn$/, authority: 1.0, official: true },
  { pattern: /(^|\.)szse\.cn$/, authority: 1.0, official: true },
  { pattern: /(^|\.)hkex\.com\.hk$/, authority: 0.9, official: true },
  { pattern: /(^|\.)eastmoney\.com$/, authority: 0.85 },
  { pattern: /(^|\.)cninfo\.com\.cn$/, authority: 0.85 },
  { pattern: /(^|\.)forbes\.com$/, authority: 0.8 },
  { pattern: /(^|\.)hurun\.net$/, authority: 0.8 },
];

/** 金融/市值类查询权威源（P2，E270）：交易所/行情/榜单源参与权威度评分 */
const FINANCE_MARKET_RE =
  /市值|估值|股价|股票|上市公司|A股|港股|美股|行情|排名|榜单|富豪榜|福布斯|胡润/;

export function isFinanceMarketQuery(query: string): boolean {
  return FINANCE_MARKET_RE.test(query);
}

const VENDOR_DOMAIN_MAP: Array<{ prefix: string; domain: string }> = [
  { prefix: 'STM32', domain: 'st.com' },
  { prefix: 'ESP32', domain: 'espressif.com' },
  { prefix: 'TPS', domain: 'ti.com' },
  { prefix: 'IRF', domain: 'infineon.com' },
  { prefix: 'LT', domain: 'analog.com' },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface SoftwareOfficialRule {
  names: string[];
  hosts: string[];
  // P6：name 正则模块级预编译，避免每条结果每个规则 new RegExp
  nameRe: RegExp;
}

const SOFTWARE_OFFICIAL_RULES: SoftwareOfficialRule[] = (
  [

  { names: ['tauri'], hosts: ['github.com', 'v2.tauri.app'] },
  { names: ['freecad'], hosts: ['freecadweb.org', 'github.com'] },
  { names: ['kicad'], hosts: ['kicad.org', 'gitlab.com', 'github.com'] },
  { names: ['altium'], hosts: ['altium.com', 'techdocs.altium.com'] },
  { names: ['keil', 'mdk'], hosts: ['keil.com'] },
  { names: ['ltspice'], hosts: ['analog.com'] },
  { names: ['electron'], hosts: ['electronjs.org', 'github.com'] },
  { names: ['arduino'], hosts: ['arduino.cc', 'github.com'] },
  { names: ['openworker'], hosts: ['github.com'] },
  { names: ['openclaw'], hosts: ['github.com', 'docs.openclaw.ai', 'docs2.openclaw.ai'] },
  ] as Array<{ names: string[]; hosts: string[] }>
).map((rule) => ({
  ...rule,
  nameRe: new RegExp(rule.names.map((name) => `\\b${escapeRegExp(name)}\\b`).join('|')),
}));

const TECH_OFFICIAL_DOMAINS: Array<{ pattern: RegExp; domains: string[] }> = [
  {
    pattern: /stm32|adc|看门狗|watchdog|pwm|定时器|rtos|freertos|spi|i2c/i,
    domains: ['st.com', 'community.st.com'],
  },
  {
    pattern: /altium|spice/i,
    domains: ['altium.com', 'techdocs.altium.com'],
  },
  {
    pattern: /ltspice/i,
    domains: ['analog.com'],
  },
  {
    pattern: /rtos|freertos/i,
    domains: ['freertos.org'],
  },
  {
    pattern: /buck|电感/i,
    domains: ['ti.com', 'e2e.ti.com'],
  },
];

export function techOfficialDomainsForQuery(query: string): string[] {
  const out: string[] = [];
  for (const rule of TECH_OFFICIAL_DOMAINS) {
    if (rule.pattern.test(query)) out.push(...rule.domains);
  }
  return [...new Set(out)];
}

const SPACE_STATUS_RE = /航天员|宇航员|空间站|在轨|载人航天/;
export const SPACE_STATUS_DOMAINS = ['cmse.gov.cn', 'cnsa.gov.cn', 'people.com.cn', 'news.cn'];

export function isSpaceStatusQuery(query: string): boolean {
  return SPACE_STATUS_RE.test(query);
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function getDomainAuthority(url: string): number {
  const hostname = getHostname(url);
  if (!hostname) return 0.3; // 默认未收录
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(hostname)) return rule.authority;
  }
  return 0.3;
}

export function extractPartNumber(query: string): string | null {
  const match = query.match(/[A-Z]{2,}[0-9A-Z-]{2,}/);
  return match?.[0] ?? null;
}

export interface OfficialSourceHint {
  vendor: string;
  domain: string;
}

export const DOMESTIC_DATASHEET_DOMAINS = ['szlcsc.com', 'xcc.com', 'semiee.com'];

export interface DomesticSiteSearchSpec {
  domain: string;
  name: string;
  searchUrl: (part: string) => string;
}

export const DOMESTIC_DATASHEET_SITES: DomesticSiteSearchSpec[] = [
  {
    domain: 'szlcsc.com',
    name: '立创商城',
    searchUrl: (part) => `https://so.szlcsc.com/global.html?k=${encodeURIComponent(part)}`,
  },
  {
    domain: 'xcc.com',
    name: '芯查查',
    searchUrl: (part) => `https://www.xcc.com/chip/material/search?title=${encodeURIComponent(part)}`,
  },
  {
    domain: 'semiee.com',
    name: '半导小芯',
    searchUrl: (part) => `https://www.semiee.com/search?searchModel=${encodeURIComponent(part)}`,
  },
];

export function officialSourceHintForQuery(query: string): OfficialSourceHint | null {
  const part = extractPartNumber(query);
  if (!part) return null;
  const vendor = VENDOR_DOMAIN_MAP.find((v) => part.toUpperCase().startsWith(v.prefix));
  return vendor ? { vendor: vendor.prefix, domain: vendor.domain } : null;
}

export function isDomesticDatasheetUrl(url: string): boolean {
  const hostname = getHostname(url);
  if (!hostname) return false;
  return DOMESTIC_DATASHEET_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

export interface OfficialQueryContext {
  q: string;
  techDomains: string[];
  spaceStatus: boolean;
  part: string | null;
  vendor: { prefix: string; domain: string } | null;
}

// P6：query 派生值一次算好传入，融合/仲裁循环内不再每条结果重算
export function buildOfficialQueryContext(query: string): OfficialQueryContext {
  const q = query.toLowerCase();
  const part = extractPartNumber(query);
  return {
    q,
    techDomains: techOfficialDomainsForQuery(query),
    spaceStatus: SPACE_STATUS_RE.test(q),
    part,
    vendor:
      part === null
        ? null
        : VENDOR_DOMAIN_MAP.find((v) => part.toUpperCase().startsWith(v.prefix)) ?? null,
  };
}

export function isHighTrustDatasheetUrl(url: string, query: string): boolean {
  return isHighTrustDatasheetUrlCtx(url, buildOfficialQueryContext(query));
}

export function isHighTrustDatasheetUrlCtx(url: string, ctx: OfficialQueryContext): boolean {
  return isOfficialForQueryCtx(url, ctx) || isDomesticDatasheetUrl(url);
}

export function isOfficialForQuery(url: string, query: string): boolean {
  return isOfficialForQueryCtx(url, buildOfficialQueryContext(query));
}

export function isOfficialForQueryCtx(url: string, ctx: OfficialQueryContext): boolean {
  const hostname = getHostname(url);
  for (const rule of SOFTWARE_OFFICIAL_RULES) {
    const nameHit = rule.nameRe.test(ctx.q);
    const hostHit = rule.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (nameHit && hostHit) return true;
  }
  if (
    ctx.techDomains.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  ) {
    return true;
  }
  if (ctx.spaceStatus) {
    return SPACE_STATUS_DOMAINS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  }
  if (!ctx.part || !ctx.vendor) return false;
  return hostname === ctx.vendor.domain || hostname.endsWith(`.${ctx.vendor.domain}`);
}
