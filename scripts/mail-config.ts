#!/usr/bin/env node
/**
 * E170：SMTP 邮件凭据配置（ADR-0002 阶段 1）
 * 用法：
 *   npm run mail:config -- --host smtp.qq.com --port 465 --secure 1 \
 *     --user you@qq.com --pass <授权码> --from you@qq.com
 *   npm run mail:config -- --help
 * 凭据写入 data/mail/mail-credentials.json（git 忽略），密码不打印。
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { defaultCredentialsPath, saveCredentials } from '../src/mail/credentials.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argValue(key: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${key}=`))?.split('=').slice(1).join('=');
  if (inline !== undefined) return inline;
  const index = args.indexOf(key);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`用法：
  npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人地址>
说明：
  - secure=1 走 TLS 直连（如 QQ/163 的 465），secure=0 走明文/STARTTLS（587）。
  - 建议使用邮箱服务商提供的“授权码”，而不是登录密码。
  - 凭据保存在 data/mail/mail-credentials.json（git 忽略），发送前会先展示草稿预览。`);
  process.exit(0);
}

const host = argValue('--host');
const portRaw = argValue('--port');
const secureRaw = argValue('--secure');
const user = argValue('--user');
const pass = argValue('--pass');
const from = argValue('--from');

const missing: string[] = [];
if (!host) missing.push('--host');
if (!portRaw) missing.push('--port');
if (!user) missing.push('--user');
if (!pass) missing.push('--pass');
if (!from) missing.push('--from');
if (missing.length > 0) {
  console.error(`缺少参数：${missing.join('、')}（用 --help 查看用法）`);
  process.exit(1);
}

const secure = secureRaw === '1' || secureRaw === 'true';
const creds = {
  host: host as string,
  port: Number(portRaw),
  secure,
  user: user as string,
  pass: pass as string,
  from: from as string,
};

try {
  const target = defaultCredentialsPath();
  saveCredentials(creds, target);
  console.log(`已保存 SMTP 凭据：${target}`);
  console.log(`发件人：${creds.from} · 服务器：${creds.host}:${creds.port}${creds.secure ? '（TLS）' : '（明文/STARTTLS）'}`);
  console.log('注意：密码/授权码不会打印。现在可以对我说“发送邮件给 xxx@example.com，主题…，正文…”来发信。');
  void root;
} catch (err) {
  console.error(`保存凭据失败：${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
