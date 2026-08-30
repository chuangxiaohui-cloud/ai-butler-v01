/**
 * E293：最小 IMAP 只读客户端（收邮件）
 * 仅用 node:net/node:tls，无外部依赖：
 *   - imapSecure=true：TLS 直连（默认 993）
 *   - imapSecure=false：明文连接，仅当服务器支持 STARTTLS 时升级后再 LOGIN
 * 凭据（LOGIN）只在加密通道（TLS 直连或 STARTTLS 升级后）发送；
 * 服务器不支持加密时拒绝发送凭据（H4，与 smtp.ts 一致）。
 * 只读：SELECT INBOX / SEARCH ALL / FETCH BODY.PEEK（不置 \Seen，不改服务器状态）。
 * 支持 {n} 字面量响应解析与超时；正文用协议级部分抓取（BODY.PEEK[TEXT]<0.N>）限长。
 * 注意：IMAP 字面量按字节计数，缓冲区用 Buffer（字节级）而非字符串，中文正文/主题才不错位。
 */

import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

export interface ImapMessageSummary {
  seq: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

export interface ImapFetchOptions {
  timeoutMs?: number;
  /** 测试用：TLS 证书校验失败时允许放行（仅测试环境） */
  allowInsecureTls?: boolean;
  /** 正文最大抓取字节（协议级 BODY.PEEK[TEXT]<0.N> 部分抓取） */
  maxBodyBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BODY_BYTES = 200_000;
const CRLF = '\r\n';

/** E293：smtp.qq.com → imap.qq.com（Gmail/163 同理）；无 smtp. 前缀原样返回 */
export function deriveImapHost(smtpHost: string): string {
  return smtpHost.replace(/^smtp\./i, 'imap.');
}

export interface ResolvedImapConfig {
  host: string;
  port: number;
  secure: boolean;
}

/** E293：解析 IMAP 连接参数；缺省由 SMTP 主机推导（smtp.xxx → imap.xxx，默认 993 TLS） */
export function resolveImapConfig(creds: {
  host: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
}): ResolvedImapConfig {
  const host = (creds.imapHost?.trim() || deriveImapHost(creds.host)).trim();
  const secure = creds.imapSecure ?? true;
  return { host, port: creds.imapPort ?? (secure ? 993 : 143), secure };
}

interface ResponsePart {
  kind: 'line' | 'literal';
  text: string;
}

interface CommandResult {
  parts: ResponsePart[];
  tagged: string;
}

interface PendingCommand {
  tag: string;
  parts: ResponsePart[];
  timer: NodeJS.Timeout;
  resolve: (r: CommandResult) => void;
  reject: (e: Error) => void;
}

/** 一个「发命令 → 按 tag 收响应（含 {n} 字面量）」的 IMAP 会话 */
class ImapSession {
  private socket: Socket | TLSSocket;
  private buffer = Buffer.alloc(0);
  private literalRemaining = 0;
  private pending: PendingCommand[] = [];
  private closed = false;
  private sessionError: Error | null = null;
  private tagCounter = 0;
  private timeoutMs: number;
  private greetingResolve: (() => void) | null = null;
  private greetingReject: ((e: Error) => void) | null = null;
  private greetingTimer: NodeJS.Timeout | null = null;

  constructor(socket: Socket | TLSSocket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.attach(socket);
  }

  private attach(socket: Socket | TLSSocket): void {
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.checkGreeting();
      this.pump();
    });
    socket.on('error', (err) => {
      this.sessionError = err;
      this.failAll(err);
      const reject = this.greetingReject;
      this.clearGreeting();
      reject?.(err);
    });
    socket.on('close', () => {
      this.closed = true;
      if (this.pending.length > 0) this.failAll(new Error('IMAP 连接已关闭'));
      const reject = this.greetingReject;
      this.clearGreeting();
      reject?.(new Error('IMAP 连接已关闭'));
    });
  }

  private detach(socket: Socket | TLSSocket): void {
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
  }

  private clearGreeting(): void {
    if (this.greetingTimer) clearTimeout(this.greetingTimer);
    this.greetingTimer = null;
    this.greetingResolve = null;
    this.greetingReject = null;
  }

  private checkGreeting(): void {
    if (!this.greetingResolve) return;
    const nl = this.buffer.indexOf(0x0a);
    if (nl < 0) return;
    const line = this.buffer.subarray(0, nl).toString('utf8').replace(/\r$/, '');
    this.buffer = this.buffer.subarray(nl + 1);
    const resolve = this.greetingResolve;
    const reject = this.greetingReject;
    this.clearGreeting();
    if (/^\* OK/i.test(line)) resolve?.();
    else reject?.(new Error(`IMAP 服务器未就绪：${line.slice(0, 120)}`));
  }

  /** 等服务端问候（* OK ...） */
  expectGreeting(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.greetingResolve = resolve;
      this.greetingReject = reject;
      this.greetingTimer = setTimeout(() => {
        this.clearGreeting();
        reject(new Error('IMAP 连接超时（未收到问候）'));
      }, this.timeoutMs);
      this.checkGreeting();
    });
  }

  private pump(): void {
    while (this.pending.length > 0) {
      const p = this.pending[0];
      const token = this.takeToken();
      if (token === undefined) break;
      if (token.kind === 'literal') {
        p.parts.push(token);
        continue;
      }
      if (token.text.startsWith(`${p.tag} `) || token.text === p.tag) {
        this.pending.shift();
        clearTimeout(p.timer);
        p.resolve({ parts: p.parts, tagged: token.text });
      } else {
        p.parts.push(token);
      }
    }
  }

  /** 从缓冲区取一个「行」或「字面量」响应块；数据不足返回 undefined */
  private takeToken(): ResponsePart | undefined {
    if (this.literalRemaining > 0) {
      if (this.buffer.length < this.literalRemaining + 2) return undefined;
      const content = this.buffer.subarray(0, this.literalRemaining);
      this.buffer = this.buffer.subarray(this.literalRemaining);
      // 吃掉字面量后的 CRLF（兼容仅 LF）
      if (this.buffer[0] === 0x0d) this.buffer = this.buffer.subarray(1);
      if (this.buffer[0] === 0x0a) this.buffer = this.buffer.subarray(1);
      this.literalRemaining = 0;
      return { kind: 'literal', text: content.toString('utf8') };
    }
    const nl = this.buffer.indexOf(0x0a);
    if (nl < 0) return undefined;
    let line = this.buffer.subarray(0, nl);
    this.buffer = this.buffer.subarray(nl + 1);
    if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, line.length - 1);
    const lineText = line.toString('utf8');
    const lit = lineText.match(/\{(\d+)\}$/);
    if (lit) this.literalRemaining = Number(lit[1]);
    return { kind: 'line', text: lineText };
  }

  /** 发一条带 tag 的命令并等到对应 tagged 响应；非 tagged 行与字面量收集进 parts */
  command(cmd: string, ok: string): Promise<CommandResult> {
    if (this.sessionError) return Promise.reject(this.sessionError);
    if (this.closed) return Promise.reject(new Error('IMAP 连接已关闭'));
    this.tagCounter += 1;
    const tag = `A${String(this.tagCounter).padStart(3, '0')}`;
    this.socket.write(`${tag} ${cmd}${CRLF}`);
    return new Promise<CommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.pending.findIndex((p) => p.tag === tag);
        if (i >= 0) this.pending.splice(i, 1);
        reject(new Error('IMAP 响应超时'));
      }, this.timeoutMs);
      this.pending.push({
        tag,
        parts: [],
        timer,
        resolve: (r) => {
          const status = r.tagged.slice(tag.length + 1);
          if (!status.startsWith(ok)) {
            reject(new Error(`IMAP 命令失败：${status || r.tagged}`));
            return;
          }
          resolve(r);
        },
        reject,
      });
      this.pump();
    });
  }

  upgradeToTls(host: string, allowInsecureTls: boolean): Promise<void> {
    const old = this.socket;
    this.detach(old);
    return new Promise((resolve, reject) => {
      const tlsSocket = tlsConnect({
        socket: old,
        servername: host,
        rejectUnauthorized: !allowInsecureTls,
      });
      let settled = false;
      tlsSocket.once('secureConnect', () => {
        if (settled) return;
        settled = true;
        this.socket = tlsSocket;
        this.attach(tlsSocket);
        resolve();
      });
      tlsSocket.once('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }

  close(): void {
    this.socket.destroy();
  }

  private failAll(err: Error): void {
    for (const p of this.pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(err);
    }
  }
}

function quoteString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function openSession(
  creds: {
    host: string;
    user: string;
    pass: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
  },
  options: ImapFetchOptions,
): Promise<ImapSession> {
  const cfg = resolveImapConfig(creds);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = cfg.secure
    ? tlsConnect({
        host: cfg.host,
        port: cfg.port,
        servername: cfg.host,
        rejectUnauthorized: !(options.allowInsecureTls ?? false),
      })
    : netConnect({ host: cfg.host, port: cfg.port });
  const session = new ImapSession(raw, timeoutMs);
  try {
    await session.expectGreeting();
    if (!cfg.secure) {
      const caps = await session.command('CAPABILITY', 'OK');
      const capText = caps.parts.map((p) => p.text).join(' ');
      if (!/STARTTLS/i.test(capText)) {
        throw new Error(
          'IMAP 服务器不支持 STARTTLS，拒绝在明文连接上发送凭据。' +
            '请配置 imapSecure=1（993 TLS 直连）或支持 STARTTLS 的服务器（143）。',
        );
      }
      await session.command('STARTTLS', 'OK');
      await session.upgradeToTls(cfg.host, options.allowInsecureTls ?? false);
    }
    await session.command(`LOGIN ${quoteString(creds.user)} ${quoteString(creds.pass)}`, 'OK');
    return session;
  } catch (err) {
    session.close();
    throw err;
  }
}

/** 从 * SEARCH 响应解析消息序号（可多行；空收件箱返回空数组） */
function parseSearchSeqs(parts: ResponsePart[]): number[] {
  const seqs: number[] = [];
  for (const p of parts) {
    if (p.kind !== 'line') continue;
    const m = p.text.match(/^\* SEARCH(?: (.*))?$/);
    if (!m) continue;
    const nums = (m[1] ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    seqs.push(...nums);
  }
  return seqs.filter((n) => Number.isInteger(n) && n > 0);
}

interface FetchUnit {
  seq: number;
  flags: string[];
  literals: string[];
}

/** 解析 FETCH 响应：每个 * N FETCH (…) 一行 + 紧随的字面量（BODY[...] 内容） */
function parseFetchUnits(parts: ResponsePart[]): FetchUnit[] {
  const units: FetchUnit[] = [];
  let current: FetchUnit | null = null;
  for (const p of parts) {
    if (p.kind === 'line') {
      const m = p.text.match(/^\* (\d+) FETCH/);
      if (m) {
        current = { seq: Number(m[1]), flags: [], literals: [] };
        const flagsMatch = p.text.match(/FLAGS \(([^)]*)\)/);
        if (flagsMatch) current.flags = flagsMatch[1].trim().split(/\s+/).filter(Boolean);
        units.push(current);
      } else if (current && /^\s*FLAGS \(/.test(p.text)) {
        const flagsMatch = p.text.match(/FLAGS \(([^)]*)\)/);
        if (flagsMatch) current.flags = flagsMatch[1].trim().split(/\s+/).filter(Boolean);
      } else if (current && /^\)\s*$/.test(p.text)) {
        current = null;
      }
    } else if (current) {
      current.literals.push(p.text);
    }
  }
  return units;
}

/** 解析 RFC 2822 头部字面量（含折叠续行） */
function parseHeaderLiteral(raw: string): { from: string; subject: string; date: string } {
  const headers = new Map<string, string>();
  let current: string | null = null;
  for (const rawLine of raw.replace(/\r\n/g, '\n').split('\n')) {
    if (/^[\t ]/.test(rawLine) && current) {
      headers.set(current, `${headers.get(current) ?? ''} ${rawLine.trim()}`);
      continue;
    }
    const m = rawLine.match(/^([^:\s]+):\s*(.*)$/);
    if (m) {
      current = m[1].toLowerCase();
      headers.set(current, m[2].trim());
    } else {
      current = null;
    }
  }
  return {
    from: headers.get('from') ?? '',
    subject: headers.get('subject') ?? '',
    date: headers.get('date') ?? '',
  };
}

/** E293：从 FETCH BODY[TEXT] 原始正文提取可读文本——text/plain 直返；multipart 只取第一个部件正文（去部件头与 boundary）。不做 HTML 清洗/base64 解码（v2.6 候选）。 */
export function extractPlainText(raw: string): string {
  let text = raw.replace(/^\r?\n/, '').replace(/\r\n/g, '\n');
  const isMultipart = /boundary=|^Content-Type:/im.test(text);
  if (!isMultipart) return text.trim();
  const lines = text.split('\n');
  // 去掉首个空行前的 MIME 部件头
  const blank = lines.findIndex((l) => l.trim() === '');
  const bodyStart = blank > 0 && blank < lines.length ? blank + 1 : 0;
  const bodyLines = lines.slice(bodyStart);
  // 只取第一个部件：到下一个 boundary 行为止
  const boundaryIdx = bodyLines.findIndex((l) => l.trim().startsWith('--') && l.trim().length > 3);
  const content = boundaryIdx >= 0 ? bodyLines.slice(0, boundaryIdx) : bodyLines;
  return content.join('\n').trim();
}

async function quit(session: ImapSession): Promise<void> {
  try {
    await session.command('LOGOUT', 'OK');
  } catch {
    // 服务器可能直接断开；忽略
  }
  session.close();
}

/** E293：查收件箱最近 N 封（发件人/主题/日期/未读），按 seq 倒序（最新在前） */
export async function fetchRecentEmails(
  creds: {
    host: string;
    user: string;
    pass: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
  },
  options: ImapFetchOptions & { limit?: number } = {},
): Promise<ImapMessageSummary[]> {
  const limit = options.limit ?? 10;
  const session = await openSession(creds, options);
  try {
    await session.command('SELECT INBOX', 'OK');
    const search = await session.command('SEARCH ALL', 'OK');
    const seqs = parseSearchSeqs(search.parts).slice(-limit);
    if (seqs.length === 0) return [];
    const fetch = await session.command(
      `FETCH ${seqs.join(',')} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`,
      'OK',
    );
    return parseFetchUnits(fetch.parts)
      .map((u) => {
        const h = parseHeaderLiteral(u.literals.join('\n'));
        return {
          seq: u.seq,
          from: h.from,
          subject: h.subject,
          date: h.date,
          seen: u.flags.includes('\\Seen'),
        };
      })
      .sort((a, b) => b.seq - a.seq);
  } finally {
    await quit(session);
  }
}

/** E293：读指定封正文（BODY.PEEK[TEXT]<0.N> 部分抓取，不置已读） */
export async function fetchEmailText(
  creds: {
    host: string;
    user: string;
    pass: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
  },
  seq: number,
  options: ImapFetchOptions = {},
): Promise<{ text: string; truncated: boolean }> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const session = await openSession(creds, options);
  try {
    await session.command('SELECT INBOX', 'OK');
    const fetch = await session.command(`FETCH ${seq} BODY.PEEK[TEXT]<0.${maxBodyBytes}>`, 'OK');
    const units = parseFetchUnits(fetch.parts);
    const unit = units.find((u) => u.seq === seq) ?? units[0];
    const raw = unit?.literals.join('\n') ?? '';
    return { text: extractPlainText(raw), truncated: raw.length >= maxBodyBytes };
  } finally {
    await quit(session);
  }
}