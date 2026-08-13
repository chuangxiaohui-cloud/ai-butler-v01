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

const SOFTWARE_OFFICIAL_RULES: Array<{ names: string[]; hosts: string[] }> = [
  { names: ['tauri'], hosts: ['github.com', 'v2.tauri.app'] },
  { names: ['freecad'], hosts: ['freecadweb.org', 'github.com'] },
  { names: ['kicad'], hosts: ['kicad.org', 'gitlab.com', 'github.com'] },
  { names: ['altium'], hosts: ['altium.com', 'techdocs.altium.com'] },
  { names: ['keil', 'mdk'], hosts: ['keil.com'] },
  { names: ['ltspice'], hosts: ['analog.com'] },
  { names: ['electron'], hosts: ['electronjs.org', 'github.com'] },
  { names: ['arduino'], hosts: ['arduino.cc', 'github.com'] },
  { names: ['openworker'], hosts: ['github.com'] },
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
  const q = query.toLowerCase();
  const hostname = getHostname(url);
  for (const rule of SOFTWARE_OFFICIAL_RULES) {
    const nameHit = rule.names.some((name) => new RegExp(`\\b${name}\\b`).test(q));
    const hostHit = rule.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (nameHit && hostHit) return true;
  }
  const part = extractPartNumber(query);
  if (!part) return false;
  const vendor = VENDOR_DOMAIN_MAP.find((v) => part.toUpperCase().startsWith(v.prefix));
  if (!vendor) return false;
  return hostname === vendor.domain || hostname.endsWith(`.${vendor.domain}`);
}
