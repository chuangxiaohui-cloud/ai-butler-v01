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
  { pattern: /(^|\.)infineon\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)st\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)analog\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)espressif\.com$/, authority: 1.0, official: true },
  { pattern: /(^|\.)github\.com$/, authority: 0.9, official: true },
  { pattern: /wikipedia\.org$/, authority: 0.9, official: true },
  { pattern: /(docs\.python\.org|react\.dev|v2\.tauri\.app|keil\.com)$/, authority: 0.9, official: true },
  { pattern: /(^|\.)(digikey|mouser|lcsc)\.(com|cn)$/, authority: 0.8 },
  { pattern: /(^|\.)(zhihu|csdn|bilibili)\.(com|net)$/, authority: 0.75 },
  { pattern: /(^|\.)(tencent|aliyun)\.(com|cn)$/, authority: 0.7 },
  { pattern: /(^|\.)elecfans\.com$/, authority: 0.6 },
  { pattern: /jingyan\.baidu\.com$/, authority: 0.5 },
];

const VENDOR_DOMAIN_MAP: Array<{ prefix: string; domain: string }> = [
  { prefix: 'STM32', domain: 'st.com' },
  { prefix: 'ESP32', domain: 'espressif.com' },
  { prefix: 'TPS', domain: 'ti.com' },
  { prefix: 'IRF', domain: 'infineon.com' },
  { prefix: 'LT', domain: 'analog.com' },
];

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

export function isOfficialForQuery(url: string, query: string): boolean {
  const part = extractPartNumber(query);
  if (!part) return false;
  const vendor = VENDOR_DOMAIN_MAP.find((v) => part.toUpperCase().startsWith(v.prefix));
  if (!vendor) return false;
  const hostname = getHostname(url);
  return hostname === vendor.domain || hostname.endsWith(`.${vendor.domain}`);
}
