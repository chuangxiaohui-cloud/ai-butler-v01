/**
 * E170：最小 SMTP 客户端（ADR-0002 阶段 1，适配层）
 * 仅用 node:net/node:tls，无外部依赖：
 *   - secure=true：TLS 直连（465）
 *   - secure=false：明文连接，服务器支持且选项开启时 STARTTLS 升级（587）
 * 认证 AUTH LOGIN 仅在加密通道（TLS 直连或 STARTTLS 升级后）发送；
 * 服务器要求认证但连接为明文时拒绝发送凭据（H4，架构审计 2026-08-23）。
 * 正文 base64 UTF-8，头部 UTF-8 编码。
 */

import { randomUUID } from 'node:crypto';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

import type { SmtpCredentials } from './credentials.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SendMailOptions {
  timeoutMs?: number;
  /** 测试用：TLS 证书校验失败时允许放行（仅测试环境） */
  allowInsecureTls?: boolean;
}

export interface SendResult {
  accepted: string;
  messageId?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const CRLF = '\r\n';

function base64Utf8(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64');
}

/** RFC 2047 编码头部词：仅非 ASCII 才编码 */
export function encodeHeaderWord(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${base64Utf8(value)}?=`;
}

function wrapBase64(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

function rfc2822Date(ms: number): string {
  const d = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

/** 一个“发命令 → 按谓词收响应行”的 SMTP 会话（支持多行响应与超时） */
class SmtpSession {
  private socket: Socket | TLSSocket;
  private buffer = '';
  private pending: Array<{
    resolve: (line: string) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    predicate?: (line: string) => boolean;
    collect?: (line: string) => void;
  }> = [];
  private closed = false;
  private sessionError: Error | null = null;
  private timeoutMs: number;

  constructor(socket: Socket | TLSSocket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.attach(socket);
  }

  /** 挂接当前 socket 的事件监听（TLS 升级时重挂到新 socket） */
  private attach(socket: Socket | TLSSocket): void {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.pump();
    });
    socket.on('error', (err) => {
      this.sessionError = err;
      this.failAll(err);
    });
    socket.on('close', () => {
      this.closed = true;
      if (this.pending.length > 0) this.failAll(new Error('SMTP 连接已关闭'));
    });
  }

  private detach(socket: Socket | TLSSocket): void {
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
  }

  private pump(): void {
    while (this.pending.length > 0) {
      const next = this.pending[0];
      const idx = this.buffer.indexOf('\n');
      if (idx < 0) break;
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      line = line.replace(/\r$/, '');
      if (next.predicate && !next.predicate(line)) {
        // 多行响应中间行：收集后继续等终止行
        next.collect?.(line);
        continue;
      }
      this.pending.shift();
      clearTimeout(next.timer);
      next.resolve(line);
    }
  }

  private failAll(err: Error): void {
    for (const p of this.pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(err);
    }
  }

  /** 等一行响应；predicate 未命中则收集该行并继续（多行响应） */
  expect(
    predicate: (line: string) => boolean,
    collect?: (line: string) => void,
  ): Promise<string> {
    if (this.sessionError) return Promise.reject(this.sessionError);
    if (this.closed) return Promise.reject(new Error('SMTP 连接已关闭'));
    return new Promise<string>((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.pending.indexOf(entry);
          if (i >= 0) this.pending.splice(i, 1);
          reject(new Error('SMTP 响应超时'));
        }, this.timeoutMs),
        predicate,
        collect,
      };
      this.pending.push(entry);
      this.pump();
    });
  }

  write(line: string): void {
    this.socket.write(`${line}${CRLF}`);
  }

  writeRaw(data: string): void {
    this.socket.write(data);
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
}

/** 发一条命令并按状态码收尾（250/235/221 等）；多行响应合并返回 */
async function command(
  session: SmtpSession,
  line: string,
  okCodes: string[],
): Promise<string> {
  session.write(line);
  const collected: string[] = [];
  const reply = await session.expect(
    (l) => okCodes.some((code) => l === code || l.startsWith(`${code} `)),
    (l) => collected.push(l),
  );
  return [...collected, reply].join(CRLF);
}

/** 解析 250 多行响应中的 EHLO 能力行（如 STARTTLS、AUTH LOGIN） */
function ehloCapabilities(reply: string): string[] {
  return reply
    .split(CRLF)
    .map((l) => l.replace(/^250[- ]/, ''))
    .filter(Boolean);
}

function buildMessageData(creds: SmtpCredentials, msg: MailMessage): string {
  const headers = [
    `From: ${encodeHeaderWord(creds.from.split('@')[0] || creds.from)} <${creds.from}>`,
    `To: <${msg.to}>`,
    `Subject: ${encodeHeaderWord(msg.subject)}`,
    `Date: ${rfc2822Date(Date.now())}`,
    `Message-ID: <${randomUUID()}@ai-butler.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(base64Utf8(msg.text)),
    '',
  ];
  return headers.join(CRLF);
}

/**
 * 发送一封纯文本邮件；失败抛错（错误信息不含密码）。
 * 示例：sendMail({host, port, secure, user, pass, from}, {to, subject, text})
 */
export async function sendMail(
  creds: SmtpCredentials,
  msg: MailMessage,
  options: SendMailOptions = {},
): Promise<SendResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = creds.secure
    ? tlsConnect({
        host: creds.host,
        port: creds.port,
        servername: creds.host,
        rejectUnauthorized: !(options.allowInsecureTls ?? false),
      })
    : netConnect({ host: creds.host, port: creds.port });
  const session = new SmtpSession(raw, timeoutMs);
  try {
    await session.expect((l) => /^220( |$)/.test(l));
    const ehlo = await command(session, 'EHLO ai-butler.local', ['250']);
    const caps = ehloCapabilities(ehlo).join(' ');
    const didStartTls = !creds.secure && /STARTTLS/i.test(caps);
    if (didStartTls) {
      await command(session, 'STARTTLS', ['220']);
      await session.upgradeToTls(creds.host, options.allowInsecureTls ?? false);
      await command(session, 'EHLO ai-butler.local', ['250']);
    }
    if (creds.secure || didStartTls) {
      session.write('AUTH LOGIN');
      await session.expect((l) => /^334( |$)/.test(l));
      session.write(base64Utf8(creds.user));
      await session.expect((l) => /^334( |$)/.test(l));
      session.write(base64Utf8(creds.pass));
      const authReply = await session.expect((l) => /^2\d\d( |$)/.test(l));
      if (!authReply.startsWith('235')) {
        throw new Error(`SMTP 认证失败：${authReply}`);
      }
    } else if (/AUTH\s+LOGIN/i.test(caps)) {
      // H4：服务器要求 AUTH 但不支持 STARTTLS——明文发送 base64 凭据可被窃听，拒绝
      throw new Error(
        'SMTP 服务器要求认证但不支持 STARTTLS，拒绝在明文连接上发送凭据。' +
          '请改用 secure=true（465 TLS 直连）或支持 STARTTLS 的服务器（587）。',
      );
    }
    await command(session, `MAIL FROM:<${creds.from}>`, ['250']);
    await command(session, `RCPT TO:<${msg.to}>`, ['250', '251']);
    await command(session, 'DATA', ['354']);
    session.writeRaw(`${buildMessageData(creds, msg)}${CRLF}.${CRLF}`);
    const dataReply = await session.expect((l) => /^250( |$)/.test(l));
    const messageIdMatch = dataReply.match(/<([^>]+)>/);
    await command(session, 'QUIT', ['221']);
    return {
      accepted: msg.to,
      messageId: messageIdMatch?.[1],
    };
  } finally {
    session.close();
  }
}

