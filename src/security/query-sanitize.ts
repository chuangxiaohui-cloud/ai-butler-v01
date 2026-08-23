/**
 * 联网搜索脱敏规则（§10.3）
 * 搜索请求发出前对用户查询做最小化脱敏：剥离本地绝对路径、用户名/邮箱、API Key/令牌、
 * 内网地址与回环地址，仅传必要信息；剥离项可审计，疑似密钥告警。
 * 脱敏开关默认开（enabled=true），可在工程开发栏显式选择携带项目上下文（信任源）。
 */

export interface SanitizeResult {
  query: string;
  stripped: string[];
  warnings: string[];
}

interface SanitizeRule {
  name: string;
  re: RegExp;
  placeholder: string;
  warning?: string;
}

const RULES: SanitizeRule[] = [
  {
    name: '本地绝对路径',
    re: /[A-Za-z]:\\[^\s,;]+|(?:\/home|\/Users|\/etc|\/var|\/opt|\/usr|\/tmp)\/[^\s,;]+/g,
    placeholder: '<路径>',
  },
  {
    name: '家目录路径',
    re: /~\/[^\s,;]+/g,
    placeholder: '<路径>',
  },
  {
    name: '邮箱/用户名@主机',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    placeholder: '<邮箱>',
  },
  {
    name: 'API Key/令牌',
    re: /\b(sk-[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]+)\b/g,
    placeholder: '<密钥>',
    warning: '检测到疑似密钥，已剥离并告警',
  },
  {
    name: '内网地址',
    re: /\b(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    placeholder: '<内网地址>',
  },
  {
    name: '回环地址',
    re: /\b(localhost|127\.0\.0\.1|::1)\b/g,
    placeholder: '<回环地址>',
  },
];

export function sanitizeSearchQuery(query: string, enabled = true): SanitizeResult {
  if (!enabled || query.length === 0) {
    return { query, stripped: [], warnings: [] };
  }
  let out = query;
  const stripped: string[] = [];
  const warnings: string[] = [];
  for (const rule of RULES) {
    const found: string[] = [];
    rule.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.re.exec(out)) !== null) {
      if (!found.includes(match[0])) found.push(match[0]);
    }
    if (found.length === 0) continue;
    stripped.push(...found);
    if (rule.warning) warnings.push(rule.warning);
    out = out.replace(rule.re, rule.placeholder);
  }
  return { query: out.replace(/\s{2,}/g, ' ').trim(), stripped, warnings };
}
