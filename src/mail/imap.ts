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

/** E298：解析出的邮件附件（内容已解码，可直接落盘） */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** 解码后字节数 */
  size: number;
  content: Buffer;
}

export interface ImapFetchOptions {
  timeoutMs?: number;
  /** 测试用：TLS 证书校验失败时允许放行（仅测试环境） */
  allowInsecureTls?: boolean;
  /** 正文最大抓取字节（协议级 BODY.PEEK[TEXT]<0.N> 部分抓取） */
  maxBodyBytes?: number;
  /** E298：整封原始邮件最大抓取字节（附件下载 BODY.PEEK[]） */
  maxMessageBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BODY_BYTES = 200_000;
const DEFAULT_MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
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

/** E293：RFC 2047 Q 编码解码（_→空格、=XX→字节） */
function decodeQuotedPrintable(text: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '_') {
      bytes.push(0x20);
    } else if (ch === '=' && i + 2 < text.length) {
      const hex = text.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
      } else {
        bytes.push(ch.charCodeAt(0));
      }
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return Buffer.from(bytes);
}

/** E293：RFC 2047 MIME 编码词解码（主题/发件人显示名）。B=base64、Q=quoted-printable；相邻编码词之间空白按规范丢弃；charset 交给 TextDecoder（utf-8/gbk/gb18030/gb2312/big5 等），未知字符集回退 utf-8，再失败原样保留。 */
export function decodeMimeHeader(raw: string): string {
  if (!raw.includes('=?')) return raw;
  const wordRe = /=\?([^?\s]+)\?([BbQq])\?([^?]*)\?=/g;
  const joined = raw.replace(
    /(=\?[^?\s]+\?[BbQq]\?[^?]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?[^?]*\?=)/g,
    '$1',
  );
  return joined.replace(wordRe, (whole, charset: string, encoding: string, text: string) => {
    const bytes =
      encoding.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64')
        : decodeQuotedPrintable(text);
    for (const cs of [charset, 'utf-8']) {
      try {
        return new TextDecoder(cs).decode(bytes);
      } catch {
        // 未知字符集标签，尝试下一候选
      }
    }
    return whole;
  });
}

/** E293-后：HTML → 可读文本（无外部依赖：去 script/style、块级标签换行、剥标签、常用与数字实体解码） */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*(script|style)\s*>/gi, '')
    .replace(/<\s*(br|p|div|li|tr|table|section|article|blockquote|ul|ol|pre|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** E293-后：按字符集把字节解码为文本（显式 charset 优先；否则 utf-8，出现替换符回退 gbk） */
function decodeBytes(bytes: Buffer, charset?: string): string {
  const tryDecode = (cs: string): string => new TextDecoder(cs).decode(bytes);
  if (charset) {
    try {
      return tryDecode(charset);
    } catch {
      // 未知字符集标签，走回退链
    }
  }
  for (const cs of ['utf-8', 'gbk']) {
    try {
      const s = tryDecode(cs);
      if (cs === 'utf-8' && s.includes('\uFFFD')) continue; // utf-8 出替换符 → 试 gbk
      return s;
    } catch {
      // 下一候选
    }
  }
  return bytes.toString('utf8');
}

/** E293-后：quoted-printable 正文 → 字节（行尾 = 为软换行续行；=XX → 字节；正文中 _ 原样，与头部 Q 编码不同） */
function decodeQuotedPrintableBody(encoded: string): Buffer {
  const t = encoded.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === '=' && i + 2 < t.length) {
      const hex = t.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
      } else {
        bytes.push(ch.charCodeAt(0));
      }
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return Buffer.from(bytes);
}

/** E293-后：解析 MIME 部件头（Content-Type/charset/boundary/Content-Transfer-Encoding） */
function parseMimePartHeader(raw: string): {
  contentType: string;
  charset?: string;
  boundary?: string;
  encoding?: string;
} {
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
  const ct = headers.get('content-type') ?? '';
  return {
    contentType: /^([^;\s]+)/.exec(ct)?.[1] ?? '',
    charset: /charset=["']?([^;"'\s]+)/i.exec(ct)?.[1],
    boundary: /boundary=["']?([^;"'\s]+)/i.exec(ct)?.[1],
    encoding: (headers.get('content-transfer-encoding') ?? '').trim().toLowerCase() || undefined,
  };
}

/** E293-后：按 boundary 拆分 multipart 部件（去分隔行与结束标记） */
function splitByBoundary(body: string, boundary: string): { header: string; content: string }[] {
  const parts: { header: string; content: string }[] = [];
  for (const chunk of body.split('--' + boundary)) {
    const t = chunk.replace(/^\r?\n/, '').replace(/\r\n/g, '\n');
    if (t.startsWith('--')) continue; // --boundary-- 结束标记
    const lines = t.split('\n');
    const blank = lines.findIndex((l) => l.trim() === '');
    const header = blank > 0 ? lines.slice(0, blank).join('\n') : '';
    const content = blank >= 0 ? lines.slice(blank + 1).join('\n') : t;
    if (header.trim() || content.trim()) parts.push({ header, content });
  }
  return parts;
}

/** E293-后：按部件头解码正文（base64/QP → 字节 → charset 解码；text/html 再清洗） */
function decodeAndRead(content: string, contentType: string, charset?: string, encoding?: string): string {
  let text = content;
  if (encoding === 'base64') {
    text = decodeBytes(Buffer.from(content.replace(/\s+/g, ''), 'base64'), charset);
  } else if (encoding === 'quoted-printable') {
    text = decodeBytes(decodeQuotedPrintableBody(content), charset);
  }
  if (/^text\/html/i.test(contentType)) return htmlToText(text);
  return text.trim();
}

/** E293-后：MIME 正文 → 可读文本（multipart 优先 text/plain，其次 html 清洗；无 boundary 按单部件头部解析） */
function extractMimeBody(raw: string): string {
  const lines = raw.replace(/^\r?\n/, '').split('\n');
  // 找首个真实分隔行：--X 且同款分隔符在后续再次出现（排除 --X-- 结束标记）
  const boundaryLineIdx = lines.findIndex((l, i) => {
    const t = l.trim();
    if (!t.startsWith('--') || t.length < 3) return false;
    return lines.slice(i + 1).join('\n').includes('--' + t.slice(2));
  });
  if (boundaryLineIdx >= 0) {
    const boundary = lines[boundaryLineIdx].trim().slice(2);
    const parsed = splitByBoundary(lines.slice(boundaryLineIdx).join('\n'), boundary).map((p) => {
      const h = parseMimePartHeader(p.header);
      return { ...h, content: p.content };
    });
    const target =
      parsed.find((p) => /^text\/plain/i.test(p.contentType)) ??
      parsed.find((p) => /^text\/html/i.test(p.contentType)) ??
      parsed.find((p) => p.content.trim()) ??
      parsed[0];
    if (!target) return '';
    return decodeAndRead(target.content, target.contentType, target.charset, target.encoding);
  }
  const blank = lines.findIndex((l) => l.trim() === '');
  const h = parseMimePartHeader(blank > 0 ? lines.slice(0, blank).join('\n') : '');
  const bodyStart = blank > 0 && blank < lines.length ? blank + 1 : 0;
  return decodeAndRead(lines.slice(bodyStart).join('\n'), h.contentType, h.charset, h.encoding);
}

/** E293-后：启发式识别 HTML 正文（含 <html/<body/<!doctype 或任意闭合标签） */
function looksLikeHtml(s: string): boolean {
  return /<!doctype html|<html[\s>]|<body[\s>]/i.test(s) || /<\/[a-z]/i.test(s);
}

/** E293-后：启发式识别 base64 正文（BODY[TEXT] 无消息头时只有编码文本） */
function looksLikeBase64(s: string): boolean {
  const t = s.replace(/\s+/g, '');
  return t.length >= 24 && t.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(t);
}

/** E293-后：文本含可读字符（ASCII 词/空白/CJK/全角）才算可读，排除纯控制字符乱码 */
function isReadableText(s: string): boolean {
  return /[\w\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(s);
}

/** E293-后：还原正文中的 markdown 链接 [label](url)——label 为 URL（或含 URL）时只留 label，否则保留为 label（url） */
function cleanMarkdownLinks(s: string): string {
  return s.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_m, label: string, url: string) => {
    const l = label.trim();
    const u = url.trim();
    if (!u) return l;
    if (/^https?:\/\//i.test(l) || l.includes(u)) return l || u;
    return `${l}（${u}）`;
  });
}

/** E293-后：正文收尾——还原 markdown 链接，并为 URL 前的冒号补空格（emails:http:// → emails: http://） */
function finalizeBodyText(s: string): string {
  return cleanMarkdownLinks(s).replace(/:(?=https?:\/\/)/g, ': ');
}

/** E293-后：从 FETCH BODY[TEXT] 原始正文提取可读文本——multipart 按 boundary 拆部件、优先 text/plain；base64/QP 按 charset 解码；text/html 清洗；单部件无消息头时启发式识别 HTML/base64。 */
export function extractPlainText(raw: string): string {
  const text = raw.replace(/^\r?\n/, '').replace(/\r\n/g, '\n');
  const firstLine = text.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';
  const isMultipart = /boundary=|^Content-Type:/im.test(text) || /^--[\w.-]+$/.test(firstLine);
  if (isMultipart) return finalizeBodyText(extractMimeBody(text));
  if (looksLikeHtml(text)) return finalizeBodyText(htmlToText(text));
  if (looksLikeBase64(text)) {
    const decoded = decodeBytes(Buffer.from(text.replace(/\s+/g, ''), 'base64'));
    if (!decoded.includes('\uFFFD') && isReadableText(decoded)) {
      if (looksLikeHtml(decoded)) return finalizeBodyText(htmlToText(decoded));
      return finalizeBodyText(decoded.trim());
    }
  }
  return finalizeBodyText(text.trim());
}

/** E298：从部件头提取附件文件名——filename*= 优先（RFC 2231），其次 filename=；无文件名但有 attachment 声明给占位名 */
function attachmentName(headerRaw: string): string | null {
  const disposition = headerRaw.match(/^content-disposition:[^\r\n]*/im)?.[0] ?? '';
  const dispositionType = /^content-disposition:\s*([^;\s]+)/i.exec(disposition)?.[1]?.toLowerCase() ?? '';
  const hasFilename = /filename\s*=/i.test(headerRaw);
  // 排除正文内嵌图片（inline + filename / content-id 场景）：仅显式 attachment 或 有 filename 且未声明 inline
  if (dispositionType !== 'attachment' && (!hasFilename || dispositionType === 'inline')) return null;
  const star = headerRaw.match(/filename\*\s*=\s*([^;\s]+)/i)?.[1];
  if (star) {
    const idx = star.indexOf("''");
    const value = idx >= 0 ? star.slice(idx + 2) : star;
    try {
      return decodeURIComponent(value);
    } catch {
      return star;
    }
  }
  const plain = headerRaw.match(/filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i);
  const name = (plain?.[1] ?? plain?.[2] ?? '').trim();
  if (name) return decodeMimeHeader(name);
  return dispositionType === 'attachment' ? '附件' : null;
}

/** E298：按传输编码把附件内容还原为字节 */
function decodeAttachment(content: string, encoding?: string): Buffer {
  if (encoding === 'base64') return Buffer.from(content.replace(/\s+/g, ''), 'base64');
  if (encoding === 'quoted-printable') return decodeQuotedPrintableBody(content);
  return Buffer.from(content, 'utf8');
}

/** E298：递归收集 multipart 部件中的附件（嵌套 multipart 继续下钻） */
function collectAttachments(body: string, boundary: string): EmailAttachment[] {
  const out: EmailAttachment[] = [];
  for (const part of splitByBoundary(body, boundary)) {
    const h = parseMimePartHeader(part.header);
    const name = attachmentName(part.header);
    if (name) {
      out.push({
        filename: name,
        contentType: h.contentType || 'application/octet-stream',
        size: 0,
        content: decodeAttachment(part.content, h.encoding),
      });
    } else if (h.boundary) {
      out.push(...collectAttachments(part.content, h.boundary));
    }
  }
  return out;
}

/** E298：从整封原始邮件（BODY.PEEK[]）解析附件列表；非 multipart 或无附件返回空数组 */
export function parseAttachments(raw: string): EmailAttachment[] {
  // 统一行尾：JS 正则 $ 锚点对行尾孤立 \r 不匹配（LineTerminator 语义），先去 \r 再按 \n 拆分
  const text = raw.replace(/\r/g, '');
  const lines = text.split('\n');
  const blank = lines.findIndex((l) => l.trim() === '');
  const top = parseMimePartHeader(blank > 0 ? lines.slice(0, blank).join('\n') : '');
  if (!top.boundary) return [];
  const bodyStart = blank >= 0 && blank < lines.length ? blank + 1 : 0;
  return collectAttachments(lines.slice(bodyStart).join('\n'), top.boundary).map((a) => ({
    ...a,
    size: a.content.length,
  }));
}

async function quit(session: ImapSession): Promise<void> {
  try {
    await session.command('LOGOUT', 'OK');
  } catch {
    // 服务器可能直接断开；忽略
  }
  session.close();
}

const IMAP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** E293 修复：按 INTERNALDATE 从近到远逐档搜索候选（SEARCH SINCE 窗口不足则放宽到 ~5 年封顶），避免依赖 QQ 不保证按时间的 seq 顺序 */
async function searchRecentSeqs(session: ImapSession, limit: number): Promise<number[]> {
  const MAX_DAYS = 5 * 366;
  let days = 7;
  let seqs: number[] = [];
  for (;;) {
    if (days > MAX_DAYS) break;
    const since = new Date(Date.now() - days * 86_400_000);
    const dateStr = `${String(since.getUTCDate()).padStart(2, '0')}-${IMAP_MONTHS[since.getUTCMonth()]}-${since.getUTCFullYear()}`;
    const search = await session.command(`SEARCH SINCE ${dateStr}`, 'OK');
    seqs = parseSearchSeqs(search.parts);
    if (seqs.length >= limit) break;
    days *= 4;
  }
  return seqs;
}

/** E293 修复：解析 Date 头为时间戳（去掉尾部时区注释如 (CST)/(GMT+08:00)）；解析失败按 0 处理 */
function parseHeaderTime(raw: string): number {
  const t = Date.parse(raw.replace(/\s*\([^)]*\)\s*$/, ''));
  return Number.isNaN(t) ? 0 : t;
}

/** E293：查收件箱最近 N 封（发件人/主题/日期/未读），按 Date 倒序（最新在前；QQ IMAP 的 seq 不保证按时间顺序） */
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
    const seqs = await searchRecentSeqs(session, limit);
    if (seqs.length === 0) return [];
    const cand = seqs.slice(-limit * 3);
    const fetch = await session.command(
      `FETCH ${cand.join(',')} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`,
      'OK',
    );
    const parsed = parseFetchUnits(fetch.parts).map((u) => {
      const h = parseHeaderLiteral(u.literals.join('\n'));
      return {
        seq: u.seq,
        from: decodeMimeHeader(h.from),
        subject: decodeMimeHeader(h.subject),
        date: h.date,
        seen: u.flags.includes('\\Seen'),
        time: parseHeaderTime(h.date),
      };
    });
    parsed.sort((a, b) => b.time - a.time || b.seq - a.seq);
    return parsed.slice(0, limit).map((m) => ({
      seq: m.seq,
      from: m.from,
      subject: m.subject,
      date: m.date,
      seen: m.seen,
    }));
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

/** E298：读指定封的附件（BODY.PEEK[] 整封原始邮件 → MIME 解析，不置已读） */
export async function fetchEmailAttachments(
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
): Promise<EmailAttachment[]> {
  const maxBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  const session = await openSession(creds, options);
  try {
    await session.command('SELECT INBOX', 'OK');
    const fetch = await session.command(`FETCH ${seq} BODY.PEEK[]<0.${maxBytes}>`, 'OK');
    const units = parseFetchUnits(fetch.parts);
    const unit = units.find((u) => u.seq === seq) ?? units[0];
    const raw = unit?.literals.join('\n') ?? '';
    return parseAttachments(raw);
  } finally {
    await quit(session);
  }
}
