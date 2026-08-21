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

function startFakeSmtpServer(): Promise<FakeSmtpServer> {
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
          socket.write('250-test.local\r\n250-SIZE 10485760\r\n250 AUTH LOGIN\r\n');
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

test('smtp: 纯文本全命令序列（EHLO/AUTH LOGIN/MAIL/RCPT/DATA/QUIT）', async () => {
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
    assert.equal(commands.includes('AUTH LOGIN'), true);
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

test('smtp: 认证失败抛错且不含密码', async () => {
  const fake = await startFakeSmtpServer();
  try {
    const port = await fake.waitForPort();
    await assert.rejects(
      sendMail(
        { ...CREDS, port, pass: 'wrong' },
        { to: 'rcpt@example.com', subject: 'x', text: 'y' },
        { timeoutMs: 5000 },
      ),
      (err: Error) => err.message.includes('认证失败') && !err.message.includes('wrong'),
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
  const transcript: string[] = [];
  const tlsServer: TlsServer = createTlsServer(
    { cert: readFileSync(certPath), key: readFileSync(keyPath) },
    (socket) => {
      socket.setEncoding('utf8');
      socket.write('220 test.local ESMTP ready\r\n');
      let inData = false;
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
            socket.write('250-test.local\r\n250 AUTH LOGIN\r\n');
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
    },
  );
  try {
    await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', resolve));
    const address = tlsServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const sent = await sendMail(
      { ...CREDS, port, secure: true },
      { to: 'rcpt@example.com', subject: 'tls', text: 'secure body' },
      { timeoutMs: 8000, allowInsecureTls: true },
    );
    assert.equal(sent.accepted, 'rcpt@example.com');
    assert.equal(sent.messageId, 'tls-message-id');
    assert.equal(transcript.includes('AUTH LOGIN'), true);
  } finally {
    tlsServer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

