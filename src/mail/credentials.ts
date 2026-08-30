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

/** 读取凭据；文件不存在或格式非法返回 null（不抛错，调用方诚实提示） */
export function loadCredentials(path = defaultCredentialsPath()): SmtpCredentials | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validateCredentials(parsed).length > 0) return null;
    const c = parsed as Record<string, unknown>;
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
  } catch {
    return null;
  }
}

/** 保存凭据（mkdir 递归）；密码字段不参与任何打印 */
export function saveCredentials(
  creds: SmtpCredentials,
  path = defaultCredentialsPath(),
): void {
  const missing = validateCredentials(creds);
  if (missing.length > 0) {
    throw new Error(`SMTP 凭据缺少字段：${missing.join(', ')}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ ...creds, pass: String(creds.pass) }, null, 2)}\n`,
    { encoding: 'utf-8' },
  );
}
