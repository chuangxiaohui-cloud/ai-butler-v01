import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:tls';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  deriveImapHost,
  decodeMimeHeader,
  extractPlainText,
  htmlToText,
  fetchEmailAttachments,
  fetchEmailText,
  fetchRecentEmails,
  parseAttachments,
  resolveImapConfig,
} from './imap.js';

function pythonHasCryptography(): boolean {
  try {
    const out = execFileSync(
      process.env.OFFICE_PYTHON ??
        'C:\\Users\\zhxh\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
      ['-c', "import importlib.util as u; print('1' if u.find_spec('cryptography') else '0')"],
      { encoding: 'utf8' },
    ).trim();
    return out === '1';
  } catch {
    return false;
  }
}

const HAS_CRYPTOGRAPHY = pythonHasCryptography();

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'imap-test-'));
}

const IMAP_CREDS = {
  host: 'smtp.example.com',
  user: 'you@example.com',
  pass: 'secret',
};

interface FakeImapMessage {
  from: string;
  subject: string;
  date: string;
  seen: boolean;
  body: string;
  /** E298：整封原始 MIME 消息（BODY.PEEK[] 响应用；缺省回退 body） */
  raw?: string;
}

const SAMPLE_MESSAGES: FakeImapMessage[] = [
  { from: 'alice@example.com', subject: '周报', date: 'Mon, 31 Aug 2026 09:00:00 +0800', seen: false, body: '本周完成收件功能。' },
  { from: 'bob@example.com', subject: 'Re: 方案', date: 'Fri, 28 Aug 2026 18:30:00 +0800', seen: true, body: '方案收到，下周细聊。' },
  { from: 'carol@example.com', subject: '会议邀请', date: 'Wed, 26 Aug 2026 10:00:00 +0800', seen: true, body: '明天下午 3 点周会，请准时参加。' },
];

function handleImapSocket(
  socket: Socket,
  messages: FakeImapMessage[],
  opts: { advertiseStartTls?: boolean },
  transcript: string[],
): void {
  let socketBuffer = '';
  socket.write('* OK fake IMAP ready\r\n');
  socket.on('data', (chunk: string) => {
    socketBuffer += chunk;
    const lines = socketBuffer.split('\n');
    socketBuffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      if (!line.trim()) continue;
      const tag = line.split(' ')[0];
      transcript.push(line);
      const cmd = line.slice(tag.length + 1).trim().toUpperCase();
      if (cmd.startsWith('CAPABILITY')) {
        const caps = opts.advertiseStartTls ? ' IMAP4rev1 STARTTLS' : ' IMAP4rev1 LOGIN-REFERRALS';
        socket.write(`* CAPABILITY${caps}\r\n${tag} OK CAPABILITY completed\r\n`);
      } else if (cmd.startsWith('STARTTLS')) {
        socket.write(`* OK Begin TLS negotiation now\r\n${tag} OK Begin TLS negotiation\r\n`);
      } else if (cmd.startsWith('LOGIN')) {
        socket.write(`${tag} OK LOGIN completed\r\n`);
      } else if (cmd.startsWith('SELECT')) {
        socket.write(`* ${messages.length} EXISTS\r\n* 0 RECENT\r\n${tag} OK [READ-WRITE] SELECT completed\r\n`);
      } else if (cmd.startsWith('SEARCH')) {
        const seqs = messages.map((_, i) => i + 1).join(' ');
        socket.write(`* SEARCH${seqs ? ' ' + seqs : ''}\r\n${tag} OK SEARCH completed\r\n`);
      } else if (cmd.startsWith('FETCH')) {
        const targetSpec = cmd.slice('FETCH '.length).split(' ')[0];
        for (const t of targetSpec.split(',')) {
          const seq = Number(t);
          const msg = messages[seq - 1];
          if (!msg) continue;
          const flags = msg.seen ? '\\Seen' : '\\Unseen';
          if (/HEADER\.FIELDS/.test(cmd)) {
            const header = `From: ${msg.from}\r\nSubject: ${msg.subject}\r\nDate: ${msg.date}\r\n\r\n`;
            socket.write(`* ${seq} FETCH (FLAGS (${flags}) BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {${Buffer.byteLength(header)}}\r\n`);
            socket.write(`${header}\r\n`);
            socket.write(')\r\n');
          } else {
            const partial = cmd.match(/<0\.(\d+)>/);
            const maxBytes = partial ? Number(partial[1]) : Number.POSITIVE_INFINITY;
            const body = Buffer.from(msg.raw ?? msg.body, 'utf8').subarray(0, maxBytes).toString('utf8');
            socket.write(`* ${seq} FETCH (BODY[TEXT] {${Buffer.byteLength(body)}}\r\n`);
            socket.write(`${body}\r\n`);
            socket.write(')\r\n');
          }
        }
        socket.write(`${tag} OK FETCH completed\r\n`);
      } else if (cmd.startsWith('LOGOUT')) {
        socket.write(`* BYE Logging out\r\n${tag} OK LOGOUT completed\r\n`);
        socket.end();
      } else {
        socket.write(`${tag} BAD Unknown command\r\n`);
      }
    }
  });
}

function startFakeImapServer(
  messages: FakeImapMessage[],
  opts: { advertiseStartTls?: boolean } = {},
): Promise<{ port: number; transcript: string[]; close(): Promise<void> }> {
  const transcript: string[] = [];
  const server: NetServer = createNetServer((socket: Socket) => {
    socket.setEncoding('utf8');
    handleImapSocket(socket, messages, opts, transcript);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        transcript,
        close: async () => {
          server.close();
        },
      });
    });
  });
}

function genCert(dir: string): { certPath: string; keyPath: string } {
  const certPath = join(dir, 'cert.pem');
  const keyPath = join(dir, 'key.pem');
  const python =
    process.env.OFFICE_PYTHON ??
    'C:\\Users\\zhxh\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
  const genScript = `
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime, sys
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30))
        .sign(key, hashes.SHA256()))
open(sys.argv[1], 'wb').write(cert.public_bytes(serialization.Encoding.PEM))
open(sys.argv[2], 'wb').write(key.private_bytes(serialization.Encoding.PEM,
    serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
`;
  execFileSync(python, ['-c', genScript, certPath, keyPath], { encoding: 'utf8' });
  return { certPath, keyPath };
}

function startFakeTlsImapServer(
  messages: FakeImapMessage[],
  certPath: string,
  keyPath: string,
): Promise<{ port: number; transcript: string[]; close(): Promise<void> }> {
  const transcript: string[] = [];
  const server: TlsServer = createTlsServer(
    { cert: readFileSync(certPath), key: readFileSync(keyPath) },
    (socket) => {
      socket.setEncoding('utf8');
      handleImapSocket(socket, messages, {}, transcript);
    },
  );
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        transcript,
        close: async () => {
          server.close();
        },
      });
    });
  });
}

test('imap: deriveImapHost / resolveImapConfig 缺省推导与覆盖', () => {
  assert.equal(deriveImapHost('smtp.qq.com'), 'imap.qq.com');
  assert.equal(deriveImapHost('smtp.gmail.com'), 'imap.gmail.com');
  assert.equal(deriveImapHost('mail.example.com'), 'mail.example.com');
  assert.deepEqual(resolveImapConfig({ host: 'smtp.qq.com' }), {
    host: 'imap.qq.com',
    port: 993,
    secure: true,
  });
  assert.deepEqual(
    resolveImapConfig({ host: 'smtp.qq.com', imapHost: 'imap.custom.com', imapPort: 143, imapSecure: false }),
    { host: 'imap.custom.com', port: 143, secure: false },
  );
});

test('imap: extractPlainText 简单正文直返 / multipart 只取第一个部件', () => {
  assert.equal(extractPlainText('你好\n请查收。\r\n'), '你好\n请查收。');
  const multipart =
    '--boundary123\r\n' +
    'Content-Type: text/plain; charset="utf-8"\r\n' +
    '\r\n' +
    '正文第一段\r\n' +
    '--boundary123\r\n' +
    'Content-Type: text/html; charset="utf-8"\r\n' +
    '\r\n' +
    '<p>html</p>\r\n' +
    '--boundary123--\r\n';
  assert.equal(extractPlainText(multipart), '正文第一段');
});

test('imap: htmlToText 清洗 HTML（去 script/style、块级换行、实体解码）', () => {
  assert.equal(htmlToText('<div>第一行</div><p>第二<b>行</b></p><br/>第三行'), '第一行\n第二行\n第三行');
  assert.equal(htmlToText('<html><body>你好&nbsp;世界 &amp; 更多</body></html>'), '你好 世界 & 更多');
  assert.equal(htmlToText('<style>p{color:red}</style><script>alert(1)</script><p>内容</p>'), '内容');
});

test('imap: extractPlainText HTML-only 正文 → 清洗文本', () => {
  assert.equal(extractPlainText('<html><body><p>你好，世界</p></body></html>'), '你好，世界');
});

test('imap: extractPlainText 单部件 base64 正文（无消息头）→ 解码', () => {
  const html = '<p>第一段</p>';
  assert.equal(extractPlainText(Buffer.from(html, 'utf8').toString('base64')), '第一段');
});

test('imap: extractPlainText multipart base64 优先 text/plain', () => {
  const mp =
    '--b\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    Buffer.from('周报内容', 'utf8').toString('base64') +
    '\r\n--b\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    Buffer.from('<p>周报内容</p>', 'utf8').toString('base64') +
    '\r\n--b--\r\n';
  assert.equal(extractPlainText(mp), '周报内容');
});

test('imap: extractPlainText multipart 仅 html（base64）→ 清洗', () => {
  const mp =
    '--b\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    Buffer.from('<p>活动报名</p>', 'utf8').toString('base64') +
    '\r\n--b--\r\n';
  assert.equal(extractPlainText(mp), '活动报名');
});

test('imap: extractPlainText multipart quoted-printable gb2312 → 解码', () => {
  const mp =
    '--b\r\nContent-Type: text/plain; charset="gb2312"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' +
    '=B2=E2=CA=D4=D6=F7=CC=E2\r\n--b--\r\n';
  assert.equal(extractPlainText(mp), '测试主题');
});

test('imap: extractPlainText 还原正文中的 markdown 链接', () => {
  const body =
    'Your email client cannot read this email.\n' +
    'To view it online, please go here:\n' +
    '[http://sub.elecfans.top/display.php?M=1&C=2](http://sub.elecfans.top/display.php?M=1&C=2)\n' +
    'To stop: [退订](http://api.elecfans.net/u?code=x)';
  assert.equal(
    extractPlainText(body),
    'Your email client cannot read this email.\n' +
      'To view it online, please go here:\n' +
      'http://sub.elecfans.top/display.php?M=1&C=2\n' +
      'To stop: 退订（http://api.elecfans.net/u?code=x）',
  );
});

test('imap: extractPlainText URL 前冒号补空格', () => {
  assert.equal(
    extractPlainText('To stop receiving these\nemails:http://api.elecfans.net/u?code=x'),
    'To stop receiving these\nemails: http://api.elecfans.net/u?code=x',
  );
});

test('imap: parseAttachments 提取 base64 附件（filename=）', () => {
  const raw =
    'From: sender@example.com\r\n' +
    'Subject: 带附件\r\n' +
    'Content-Type: multipart/mixed; boundary="b"\r\n' +
    '\r\n' +
    '--b\r\n' +
    'Content-Type: text/plain; charset="utf-8"\r\n' +
    '\r\n' +
    '正文\r\n' +
    '--b\r\n' +
    'Content-Type: application/pdf\r\n' +
    'Content-Disposition: attachment; filename="report.pdf"\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n' +
    Buffer.from('%PDF-1.4 测试', 'utf8').toString('base64') +
    '\r\n--b--\r\n';
  const atts = parseAttachments(raw);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].filename, 'report.pdf');
  assert.equal(atts[0].contentType, 'application/pdf');
  assert.equal(atts[0].size, Buffer.byteLength('%PDF-1.4 测试', 'utf8'));
  assert.equal(atts[0].content.toString('utf8'), '%PDF-1.4 测试');
});

test('imap: parseAttachments RFC 2231 filename*= 优先解码', () => {
  const raw =
    'Content-Type: multipart/mixed; boundary="b"\r\n' +
    '\r\n' +
    '--b\r\n' +
    'Content-Type: application/octet-stream\r\n' +
    'Content-Disposition: attachment; filename*=UTF-8\x27\x27%E6%B5%8B%E8%AF%95%E6%8A%A5%E5%91%8A.pdf\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n' +
    Buffer.from('hello', 'utf8').toString('base64') +
    '\r\n--b--\r\n';
  const atts = parseAttachments(raw);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].filename, '测试报告.pdf');
  assert.equal(atts[0].content.toString('utf8'), 'hello');
});

test('imap: parseAttachments RFC 2047 MIME 词文件名解码', () => {
  const raw =
    'Content-Type: multipart/mixed; boundary="b"\r\n' +
    '\r\n' +
    '--b\r\n' +
    'Content-Type: text/plain\r\n' +
    'Content-Disposition: attachment; filename="=?utf-8?B?5rWL6K+V5Li76aKYLnR4dA==?="\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n' +
    Buffer.from('内容', 'utf8').toString('base64') +
    '\r\n--b--\r\n';
  const atts = parseAttachments(raw);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].filename, '测试主题.txt');
  assert.equal(atts[0].content.toString('utf8'), '内容');
});

test('imap: parseAttachments 嵌套 multipart 递归收集', () => {
  const raw =
    'Content-Type: multipart/mixed; boundary="outer"\r\n' +
    '\r\n' +
    '--outer\r\n' +
    'Content-Type: multipart/related; boundary="inner"\r\n' +
    '\r\n' +
    '--inner\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n' +
    '正文\r\n' +
    '--inner\r\n' +
    'Content-Type: image/png\r\n' +
    'Content-Disposition: attachment; filename="logo.png"\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n' +
    Buffer.from('PNGDATA', 'utf8').toString('base64') +
    '\r\n--inner--\r\n' +
    '--outer\r\n' +
    'Content-Type: text/plain\r\n' +
    'Content-Disposition: attachment; filename="note.txt"\r\n' +
    '\r\n' +
    'note\r\n' +
    '--outer--\r\n';
  const atts = parseAttachments(raw);
  assert.deepEqual(atts.map((a) => a.filename), ['logo.png', 'note.txt']);
});

test('imap: parseAttachments 无附件 / inline 图片排除', () => {
  assert.deepEqual(parseAttachments('From: a@b.c\r\nSubject: x\r\n\r\nplain body'), []);
  const raw =
    'Content-Type: multipart/mixed; boundary="b"\r\n' +
    '\r\n' +
    '--b\r\n' +
    'Content-Type: image/png; name="logo.png"\r\n' +
    'Content-Disposition: inline; filename="logo.png"\r\n' +
    'Content-Transfer-Encoding: base64\r\n' +
    '\r\n' +
    Buffer.from('PNGDATA', 'utf8').toString('base64') +
    '\r\n--b--\r\n';
  assert.deepEqual(parseAttachments(raw), []);
});

test('imap: decodeMimeHeader RFC 2047 解码（B/Q/拼接段/回退）', () => {
  // B 编码 utf-8 主题
  assert.equal(decodeMimeHeader('=?utf-8?B?5rWL6K+V5Li76aKY?='), '测试主题');
  // B 编码 gb2312 主题（TextDecoder 别名）
  assert.equal(decodeMimeHeader('=?gb2312?B?wLTX1HFxLmNvbbXEzcvQxQ==?='), '来自qq.com的退信');
  // Q 编码
  assert.equal(decodeMimeHeader('=?utf-8?Q?hello_world?='), 'hello world');
  assert.equal(decodeMimeHeader('=?gb2312?Q?=C0=B4=D7=D4qq=2Ecom=B5=C4=CD=CB=D0=C5?='), '来自qq.com的退信');
  // 拼接段：相邻编码词之间空白丢弃
  assert.equal(decodeMimeHeader('=?utf-8?B?W0FdIGFiYw==?= =?utf-8?B?ZGVm?='), '[A] abcdef');
  // 无编码词原样返回
  assert.equal(decodeMimeHeader('plain subject'), 'plain subject');
  // 发件人显示名：只解码编码词，地址保留
  assert.equal(decodeMimeHeader('"=?utf-8?B?5rWL6K+V5Li76aKY?=" a@b.com'), '"测试主题" a@b.com');
  // 未知字符集回退 utf-8
  assert.equal(decodeMimeHeader('=?x-unknown?B?5rWL6K+V5Li76aKY?='), '测试主题');
});

test('imap: 明文连接不支持 STARTTLS → 拒绝 LOGIN（H4，不发送凭据）', async () => {
  const fake = await startFakeImapServer(SAMPLE_MESSAGES);
  try {
    const port = fake.port;
    await assert.rejects(
      fetchRecentEmails(
        { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: false },
        { timeoutMs: 5000 },
      ),
      (err: Error) => err.message.includes('STARTTLS'),
    );
    assert.equal(fake.transcript.some((l) => l.includes(' LOGIN ')), false, '明文连接不得发送 LOGIN');
  } finally {
    await fake.close();
  }
});

test('imap: TLS 查收件箱 → 最新在前 + 未读标记 + 中文头部解析', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const fake = await startFakeTlsImapServer(SAMPLE_MESSAGES, certPath, keyPath);
  try {
    const port = fake.port;
    const list = await fetchRecentEmails(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.equal(list.length, 3);
    assert.deepEqual(list.map((m) => m.seq), [1, 2, 3], '按日期最新在前');
    assert.equal(list[0].subject, '周报');
    assert.equal(list[0].from, 'alice@example.com');
    assert.equal(list[0].seen, false);
    assert.equal(list[2].subject, '会议邀请');
    assert.equal(list[2].seen, true);
    assert.equal(fake.transcript.some((l) => l.includes(' LOGIN ')), true);
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('imap: TLS MIME 编码主题/发件人解码后返回', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const mimeMsg: FakeImapMessage = {
    from: '"=?utf-8?B?5rWL6K+V5Li76aKY?=" a@example.com',
    subject: '=?utf-8?B?W0FdIGFiYw==?= =?utf-8?B?ZGVm?=',
    date: 'Mon, 31 Aug 2026 09:00:00 +0800',
    seen: false,
    body: '正文',
  };
  const fake = await startFakeTlsImapServer([mimeMsg], certPath, keyPath);
  try {
    const port = fake.port;
    const list = await fetchRecentEmails(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].subject, '[A] abcdef');
    assert.equal(list[0].from, '"测试主题" a@example.com');
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('imap: TLS limit 只取最新 N 封', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const fake = await startFakeTlsImapServer(SAMPLE_MESSAGES, certPath, keyPath);
  try {
    const port = fake.port;
    const list = await fetchRecentEmails(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      { timeoutMs: 8000, allowInsecureTls: true, limit: 1 },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].seq, 1);
    assert.equal(fake.transcript.some((l) => l.startsWith('A') && l.includes('FETCH 1,2,3 (')), true);
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('imap: TLS 空收件箱 → 空数组', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const fake = await startFakeTlsImapServer([], certPath, keyPath);
  try {
    const port = fake.port;
    const list = await fetchRecentEmails(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.deepEqual(list, []);
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('imap: TLS 读指定封正文（中文，BODY.PEEK 不置已读）', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const fake = await startFakeTlsImapServer(SAMPLE_MESSAGES, certPath, keyPath);
  try {
    const port = fake.port;
    const { text, truncated } = await fetchEmailText(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      1,
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.equal(text, '本周完成收件功能。');
    assert.equal(truncated, false);
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('imap: TLS maxBodyBytes 部分抓取 → truncated 标记', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const longMessage: FakeImapMessage = {
    from: 'x@example.com',
    subject: '长文',
    date: 'Mon, 31 Aug 2026 09:00:00 +0800',
    seen: false,
    body: 'A'.repeat(200),
  };
  const fake = await startFakeTlsImapServer([longMessage], certPath, keyPath);
  try {
    const port = fake.port;
    const { text, truncated } = await fetchEmailText(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      1,
      { timeoutMs: 8000, allowInsecureTls: true, maxBodyBytes: 50 },
    );
    assert.equal(truncated, true);
    assert.equal(text, 'A'.repeat(50));
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('imap: TLS fetchEmailAttachments BODY.PEEK[] 整封解析不置已读', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  const { certPath, keyPath } = genCert(dir);
  const attachMsg: FakeImapMessage = {
    from: 'sender@example.com',
    subject: '带附件',
    date: 'Mon, 31 Aug 2026 09:00:00 +0800',
    seen: false,
    body: '正文',
    raw:
      'From: sender@example.com\r\nSubject: 带附件\r\nContent-Type: multipart/mixed; boundary="b"\r\n' +
      '\r\n' +
      '--b\r\nContent-Type: text/plain\r\n\r\n正文\r\n' +
      '--b\r\nContent-Type: application/zip\r\nContent-Disposition: attachment; filename="数据.zip"\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      Buffer.from('ZIPBYTES', 'utf8').toString('base64') +
      '\r\n--b--\r\n',
  };
  const fake = await startFakeTlsImapServer([attachMsg], certPath, keyPath);
  try {
    const port = fake.port;
    const atts = await fetchEmailAttachments(
      { ...IMAP_CREDS, imapHost: '127.0.0.1', imapPort: port, imapSecure: true },
      1,
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.equal(atts.length, 1);
    assert.equal(atts[0].filename, '数据.zip');
    assert.equal(atts[0].content.toString('utf8'), 'ZIPBYTES');
    assert.equal(fake.transcript.some((l) => l.includes('FETCH 1 BODY.PEEK[]')), true);
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
