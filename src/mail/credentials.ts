/**
 * E170：SMTP 凭据存储（ADR-0002 阶段 1）
 * 凭据仅存 data/mail/mail-credentials.json（git 忽略），不写日志、不写需求文档。
 * 候选 Windows DPAPI 加密留作后续增强。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface SmtpCredentials {
  host: string;
  port: number;
  secure: boolean; // true = TLS 直连（465），false = 明文/STARTTLS（587）
  user: string;
  pass: string;
  from: string;
  /** E293：可选 IMAP 收件参数；缺省由 host 推导（smtp.xxx → imap.xxx，默认 993 TLS） */
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
}

/**
 * E302：多账号凭据容器——active 为当前生效账号 key，accounts 为账号字典。
 * 旧版单账号文件（裸 SmtpCredentials）读取时自动迁移为 active=default。
 */
export interface CredentialsStore {
  active: string;
  accounts: Record<string, SmtpCredentials>;
}

export const CREDENTIALS_FILE = 'mail-credentials.json';

/** 默认凭据路径：data/mail/mail-credentials.json（覆盖测试注入用） */
export function defaultCredentialsPath(): string {
  return join(process.cwd(), 'data', 'mail', CREDENTIALS_FILE);
}

/** 校验凭据字段，返回缺失/非法字段列表（空数组 = 合法） */
export function validateCredentials(
  creds: unknown,
): string[] {
  const missing: string[] = [];
  const c = creds as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return ['host', 'port', 'user', 'pass', 'from'];
  if (typeof c.host !== 'string' || !c.host.trim()) missing.push('host');
  const port = Number(c.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) missing.push('port');
  if (typeof c.user !== 'string' || !c.user.trim()) missing.push('user');
  if (typeof c.pass !== 'string' || !c.pass.trim()) missing.push('pass');
  if (typeof c.from !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(c.from.trim())) missing.push('from');
  if (c.imapHost !== undefined && (typeof c.imapHost !== 'string' || !c.imapHost.trim())) missing.push('imapHost');
  if (c.imapPort !== undefined) {
    const imapPort = Number(c.imapPort);
    if (!Number.isInteger(imapPort) || imapPort <= 0 || imapPort > 65535) missing.push('imapPort');
  }
  if (c.imapSecure !== undefined && typeof c.imapSecure !== 'boolean') missing.push('imapSecure');
  return missing;
}

/** 把 JSON 字段规范化为 SmtpCredentials（trim 文本、数值/布尔强转） */
function normalizeCredentials(c: Record<string, unknown>): SmtpCredentials {
  return {
    host: String(c.host).trim(),
    port: Number(c.port),
    secure: Boolean(c.secure),
    user: String(c.user).trim(),
    pass: String(c.pass),
    from: String(c.from).trim(),
    ...(c.imapHost !== undefined ? { imapHost: String(c.imapHost).trim() } : {}),
    ...(c.imapPort !== undefined ? { imapPort: Number(c.imapPort) } : {}),
    ...(c.imapSecure !== undefined ? { imapSecure: Boolean(c.imapSecure) } : {}),
  };
}

/** 解析凭据文件原文；旧单账号格式自动迁移为容器，格式非法返回 null（不抛错） */
function parseStoredCredentials(raw: string): CredentialsStore | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  // 旧版单账号文件（裸 SmtpCredentials）→ 自动迁移
  if (validateCredentials(parsed).length === 0) {
    return { active: 'default', accounts: { default: normalizeCredentials(parsed as Record<string, unknown>) } };
  }
  const s = parsed as Record<string, unknown> | null;
  if (!s || typeof s !== 'object' || typeof s.active !== 'string' || !s.accounts || typeof s.accounts !== 'object') {
    return null;
  }
  const accounts: Record<string, SmtpCredentials> = {};
  for (const [key, value] of Object.entries(s.accounts as Record<string, unknown>)) {
    if (validateCredentials(value).length > 0) return null;
    accounts[key] = normalizeCredentials(value as Record<string, unknown>);
  }
  if (Object.keys(accounts).length === 0 || !accounts[s.active]) return null;
  return { active: s.active, accounts };
}

/** 读取凭据容器；文件不存在或格式非法返回 null（不抛错，调用方诚实提示） */
export function loadCredentialsStore(path = defaultCredentialsPath()): CredentialsStore | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  return parseStoredCredentials(raw);
}

/** 读取当前 active 账号凭据；无配置或格式非法返回 null */
export function loadCredentials(path = defaultCredentialsPath()): SmtpCredentials | null {
  const store = loadCredentialsStore(path);
  const creds = store?.accounts[store.active];
  return creds ?? null;
}

/** 保存凭据容器（mkdir 递归）；校验全部账号与 active 指向，密码字段不参与任何打印 */
export function saveCredentialsStore(store: CredentialsStore, path = defaultCredentialsPath()): void {
  if (typeof store.active !== 'string' || !store.active.trim() || !store.accounts || typeof store.accounts !== 'object') {
    throw new Error('凭据容器缺少 active/accounts');
  }
  const keys = Object.keys(store.accounts);
  if (keys.length === 0) throw new Error('凭据容器没有账号');
  if (!store.accounts[store.active]) throw new Error(`凭据容器 active 指向不存在的账号：${store.active}`);
  for (const [key, creds] of Object.entries(store.accounts)) {
    const missing = validateCredentials(creds);
    if (missing.length > 0) {
      throw new Error(`账号「${key}」凭据缺少字段：${missing.join(', ')}`);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ active: store.active, accounts: store.accounts }, null, 2)}\n`, {
    encoding: 'utf-8',
  });
}

/**
 * 保存凭据（mkdir 递归）。accountKey 缺省沿用既有 active（无容器时 default）；
 * 写入后置为该账号 active，兼容旧版单账号调用方。
 */
export function saveCredentials(
  creds: SmtpCredentials,
  path = defaultCredentialsPath(),
  accountKey?: string,
): void {
  const missing = validateCredentials(creds);
  if (missing.length > 0) {
    throw new Error(`SMTP 凭据缺少字段：${missing.join(', ')}`);
  }
  const store: CredentialsStore = loadCredentialsStore(path) ?? { active: 'default', accounts: {} };
  const key = accountKey?.trim() || store.active || 'default';
  store.accounts[key] = { ...creds, pass: String(creds.pass) };
  store.active = key;
  saveCredentialsStore(store, path);
}

/** 切换 active 账号；容器或账号不存在返回 false */
export function setActiveAccount(accountKey: string, path = defaultCredentialsPath()): boolean {
  const store = loadCredentialsStore(path);
  if (!store || !store.accounts[accountKey]) return false;
  store.active = accountKey;
  saveCredentialsStore(store, path);
  return true;
}

/** 账号摘要（key / from / 是否 active），用于切换失败时诚实提示 */
export function listAccountSummaries(
  path = defaultCredentialsPath(),
): { key: string; from: string; active: boolean }[] {
  const store = loadCredentialsStore(path);
  if (!store) return [];
  return Object.entries(store.accounts).map(([key, creds]) => ({
    key,
    from: creds.from,
    active: key === store.active,
  }));
}
