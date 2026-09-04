import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:tls';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { SmtpCredentials } from './credentials.js';
import { encodeHeaderWord, sendMail } from './smtp.js';
import { buildXoauth2Initial } from './oauth.js';

/** 生成自签证书（Python cryptography，不可用时跳过 TLS 用例） */
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
  return mkdtempSync(join(tmpdir(), 'mail-test-'));
}

/** 用 Python cryptography 生成自签证书（仅 TLS 用例使用；缺依赖时相关用例会 skip） */
function genSelfSignedCert(dir: string): { certPath: string; keyPath: string } {
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

const CREDS: SmtpCredentials = {
  host: '127.0.0.1',
  port: 0,
  secure: false,
  user: 'test@example.com',
  pass: 'secret',
  from: 'sender@example.com',
};

interface FakeSmtpServer {
  server: NetServer;
  port: number;
  transcript: string[];
  dataReceived: { value: string };
  waitForPort(): Promise<number>;
  close(): Promise<void>;
}

function startFakeSmtpServer(opts: { advertiseAuth?: boolean } = {}): Promise<FakeSmtpServer> {
  const transcript: string[] = [];
  const dataReceived = { value: '' };
  let socketBuffer = '';
  const server: NetServer = createNetServer((socket: Socket) => {
    socket.setEncoding('utf8');
    socket.write('220 test.local ESMTP ready\r\n');
    let inData = false;
    socket.on('data', (chunk: string) => {
      socketBuffer += chunk;
      const lines = socketBuffer.split('\n');
      socketBuffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 2.0.0 Ok: queued as <test-message-id>\r\n');
            continue;
          }
          dataReceived.value += line + '\n';
          continue;
        }
        transcript.push(line);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO')) {
          socket.write(
            opts.advertiseAuth
              ? '250-test.local\r\n250-SIZE 10485760\r\n250 AUTH LOGIN\r\n'
              : '250-test.local\r\n250-SIZE 10485760\r\n250 OK\r\n',
          );
        } else if (cmd === 'AUTH LOGIN') {
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (line === Buffer.from('test@example.com').toString('base64')) {
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (line === Buffer.from('secret').toString('base64')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (cmd.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 Ok\r\n');
        } else if (cmd.startsWith('RCPT TO')) {
          socket.write('250 2.1.5 Ok\r\n');
        } else if (cmd === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 Ok\r\n');
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        server,
        port,
        transcript,
        dataReceived,
        waitForPort: async () => port,
        close: async () => {
          server.close();
        },
      });
    });
  });
}

test('smtp: 明文免认证服务器全命令序列（EHLO/MAIL/RCPT/DATA/QUIT，无 AUTH）', async () => {
  const fake = await startFakeSmtpServer();
  const dir = tempDir();
  try {
    const port = await fake.waitForPort();
    const sent = await sendMail(
      { ...CREDS, port },
      { to: 'rcpt@example.com', subject: '测试主题', text: '你好，这是正文。\n第二行。' },
      { timeoutMs: 5000 },
    );
    assert.equal(sent.accepted, 'rcpt@example.com');
    assert.equal(sent.messageId, 'test-message-id');
    const commands = fake.transcript;
    assert.ok(commands[0].startsWith('EHLO '));
    assert.equal(commands.includes('AUTH LOGIN'), false, '明文连接不得发送 AUTH（H4）');
    assert.equal(commands.includes(`MAIL FROM:<sender@example.com>`), true);
    assert.equal(commands.includes(`RCPT TO:<rcpt@example.com>`), true);
    assert.equal(commands.includes('DATA'), true);
    assert.equal(commands.includes('QUIT'), true);
    assert.ok(fake.dataReceived.value.includes('To: <rcpt@example.com>'));
    assert.ok(fake.dataReceived.value.includes('Subject: =?UTF-8?B?'));
    const decoded = Buffer.from(
      fake.dataReceived.value.match(/^([A-Za-z0-9+/=\s]+)$/m)?.[1] ?? '',
      'base64',
    ).toString('utf8');
    assert.ok(decoded.includes('你好，这是正文。'));
    assert.ok(decoded.includes('第二行。'));
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('smtp: 明文服务器要求 AUTH 时拒绝发送凭据（H4）', async () => {
  const fake = await startFakeSmtpServer({ advertiseAuth: true });
  try {
    const port = await fake.waitForPort();
    await assert.rejects(
      sendMail(
        { ...CREDS, port },
        { to: 'rcpt@example.com', subject: 'x', text: 'y' },
        { timeoutMs: 5000 },
      ),
      (err: Error) => err.message.includes('明文') && !err.message.includes('secret'),
    );
    assert.equal(fake.transcript.includes('AUTH LOGIN'), false, '不得发出 AUTH LOGIN');
    assert.equal(
      fake.transcript.some((l) => l.includes(Buffer.from('secret').toString('base64'))),
      false,
      '不得在明文连接上出现 base64 凭据',
    );
  } finally {
    await fake.close();
  }
});

test('smtp: encodeHeaderWord 仅非 ASCII 编码', () => {
  assert.equal(encodeHeaderWord('plain subject'), 'plain subject');
  const encoded = encodeHeaderWord('测试主题');
  assert.ok(encoded.startsWith('=?UTF-8?B?'));
  assert.ok(encoded.endsWith('?='));
});

function startFakeTlsSmtpServer(certPath: string, keyPath: string): Promise<{
  port: number;
  transcript: string[];
  close(): Promise<void>;
}> {
  const transcript: string[] = [];
  const tlsServer: TlsServer = createTlsServer(
    { cert: readFileSync(certPath), key: readFileSync(keyPath) },
    (socket) => {
      socket.setEncoding('utf8');
      socket.write('220 test.local ESMTP ready\r\n');
      let inData = false;
      let xoauth334 = false;
      let buffer = '';
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.replace(/\r$/, '');
          if (inData) {
            if (line === '.') {
              inData = false;
              socket.write('250 2.0.0 Ok: queued as <tls-message-id>\r\n');
            }
            continue;
          }
          transcript.push(line);
          const cmd = line.toUpperCase();
          if (cmd.startsWith('EHLO')) {
            socket.write('250-test.local\r\n250 AUTH LOGIN XOAUTH2\r\n');
          } else if (cmd === 'AUTH LOGIN') {
            socket.write('334 VXNlcm5hbWU6\r\n');
          } else if (cmd.startsWith('AUTH XOAUTH2')) {
            const payload = Buffer.from(line.slice('AUTH XOAUTH2 '.length), 'base64').toString('utf8');
            if (payload.includes('auth=Bearer tok-x')) {
              // RFC 4959：先回 334 空挑战，客户端须回空行后才给 235（覆盖 334 握手路径）
              xoauth334 = true;
              socket.write('334 \r\n');
            } else {
              socket.write('535 5.7.8 Authentication credentials invalid\r\n');
            }
          } else if (line === '' && xoauth334) {
            xoauth334 = false;
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else if (line === Buffer.from('test@example.com').toString('base64')) {
            socket.write('334 UGFzc3dvcmQ6\r\n');
          } else if (line === Buffer.from('secret').toString('base64')) {
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else if (cmd.startsWith('MAIL FROM')) {
            socket.write('250 2.1.0 Ok\r\n');
          } else if (cmd.startsWith('RCPT TO')) {
            socket.write('250 2.1.5 Ok\r\n');
          } else if (cmd === 'DATA') {
            inData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (cmd === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 Ok\r\n');
          }
        }
      });
    },
  );
  return new Promise((resolve) => {
    tlsServer.listen(0, '127.0.0.1', () => {
      const address = tlsServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        transcript,
        close: async () => {
          tlsServer.close();
        },
      });
    });
  });
}

test('smtp: TLS 直连 xoauth2 → AUTH XOAUTH2 初始响应成功（334 挑战回空行，无 AUTH LOGIN/明文密码）', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  try {
    const { certPath, keyPath } = genSelfSignedCert(dir);
    const fake = await startFakeTlsSmtpServer(certPath, keyPath);
    try {
      const port = fake.port;
      const sent = await sendMail(
        {
          ...CREDS,
          port,
          secure: true,
          pass: '',
          auth: 'xoauth2',
          accessToken: 'tok-x',
        },
        { to: 'rcpt@example.com', subject: 'xoauth2', text: 'secure body' },
        { timeoutMs: 8000, allowInsecureTls: true },
      );
      assert.equal(sent.accepted, 'rcpt@example.com');
      assert.equal(sent.messageId, 'tls-message-id');
      const initial = buildXoauth2Initial('test@example.com', 'tok-x');
      assert.ok(fake.transcript.includes(`AUTH XOAUTH2 ${initial}`), JSON.stringify(fake.transcript));
      assert.equal(fake.transcript.includes('AUTH LOGIN'), false, 'xoauth2 不得走 AUTH LOGIN');
      assert.equal(
        fake.transcript.some((l) => l.includes(Buffer.from('secret').toString('base64'))),
        false,
        '不得出现明文密码 base64',
      );
    } finally {
      await fake.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('smtp: TLS xoauth2 token 无效 → 明确报错（含 SMTP 权限提示，不含 token）', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  try {
    const { certPath, keyPath } = genSelfSignedCert(dir);
    const fake = await startFakeTlsSmtpServer(certPath, keyPath);
    try {
      await assert.rejects(
        sendMail(
          {
            ...CREDS,
            port: fake.port,
            secure: true,
            pass: '',
            auth: 'xoauth2',
            accessToken: 'tok-bad',
          },
          { to: 'rcpt@example.com', subject: 'x', text: 'y' },
          { timeoutMs: 8000, allowInsecureTls: true },
        ),
        (err: Error) =>
          err.message.includes('SMTP XOAUTH2 认证失败') &&
          err.message.includes('SMTP 发信权限') &&
          !err.message.includes('tok-bad'),
      );
    } finally {
      await fake.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('smtp: xoauth2 缺 accessToken → 报错指引重新授权', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
  try {
    const { certPath, keyPath } = genSelfSignedCert(dir);
    const fake = await startFakeTlsSmtpServer(certPath, keyPath);
    try {
      await assert.rejects(
        sendMail(
          { ...CREDS, port: fake.port, secure: true, pass: '', auth: 'xoauth2' },
          { to: 'rcpt@example.com', subject: 'x', text: 'y' },
          { timeoutMs: 8000, allowInsecureTls: true },
        ),
        (err: Error) => err.message.includes('缺少 accessToken') && err.message.includes('mail:oauth'),
      );
    } finally {
      await fake.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('smtp: TLS 直连（secure=true，自签证书）', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
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
  const tlsFake = await startFakeTlsSmtpServer(certPath, keyPath);
  try {
    const port = tlsFake.port;
    const sent = await sendMail(
      { ...CREDS, port, secure: true },
      { to: 'rcpt@example.com', subject: 'tls', text: 'secure body' },
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.equal(sent.accepted, 'rcpt@example.com');
    assert.equal(sent.messageId, 'tls-message-id');
    assert.equal(tlsFake.transcript.includes('AUTH LOGIN'), true);
  } finally {
    await tlsFake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('smtp: TLS 通道认证失败抛错且不含密码', { skip: !HAS_CRYPTOGRAPHY }, async () => {
  const dir = tempDir();
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
  const tlsFake = await startFakeTlsSmtpServer(certPath, keyPath);
  try {
    await assert.rejects(
      sendMail(
        { ...CREDS, port: tlsFake.port, secure: true, pass: 'wrong' },
        { to: 'rcpt@example.com', subject: 'x', text: 'y' },
        { timeoutMs: 8000, allowInsecureTls: true },
      ),
      (err: Error) => err.message.includes('认证失败') && !err.message.includes('wrong'),
    );
  } finally {
    await tlsFake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

