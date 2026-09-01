#!/usr/bin/env node
/**
 * E170：SMTP 邮件凭据配置（ADR-0002 阶段 1）
 * 用法：
 *   npm run mail:config -- --host smtp.qq.com --port 465 --secure 1 \
 *     --user you@qq.com --pass <授权码> --from you@qq.com
 *   npm run mail:config -- --account outlook --host smtp.office365.com --port 587 --secure 0 \
 *     --user you@outlook.com --pass <授权码> --from you@outlook.com   （E302：按账号保存）
 *   npm run mail:config -- --set-active outlook                         （E302：切换 active）
 *   npm run mail:config -- --list                                       （E302：列出账号）
 *   npm run mail:config -- --help
 * 凭据写入 data/mail/mail-credentials.json（git 忽略），密码不打印。
 * E302：该文件为容器 { active, accounts }，多账号并存、active 为当前生效账号。
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  defaultCredentialsPath,
  listAccountSummaries,
  loadCredentialsStore,
  saveCredentials,
  setActiveAccount,
} from '../src/mail/credentials.js';

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
  npm run mail:config -- --account <账号名> --host ... --from ...   （保存到指定账号并切换为 active）
  npm run mail:config -- --set-active <账号名>                       （仅切换当前生效账号）
  npm run mail:config -- --list                                      （列出已配置账号）
说明：
  - secure=1 走 TLS 直连（如 QQ/163 的 465），secure=0 走明文/STARTTLS（587）。
  - 建议使用邮箱服务商提供的“授权码”，而不是登录密码。
  - 凭据保存在 data/mail/mail-credentials.json（git 忽略），发送前会先展示草稿预览。
  - E302 多账号：--account 指定账号名（缺省沿用当前 active），保存后即为 active。`);
  process.exit(0);
}

const target = defaultCredentialsPath();

if (args.includes('--list')) {
  const accounts = listAccountSummaries(target);
  if (accounts.length === 0) {
    console.log('还没有配置任何邮箱账号。用 --host/--port/--secure/--user/--pass/--from 配置第一个账号。');
    process.exit(0);
  }
  console.log('已配置邮箱账号：');
  for (const a of accounts) {
    console.log(`- ${a.key}（${a.from}）${a.active ? ' ← active' : ''}`);
  }
  process.exit(0);
}

const setActiveRaw = argValue('--set-active');
if (setActiveRaw) {
  if (!setActiveAccount(setActiveRaw, target)) {
    console.error(`切换失败：账号「${setActiveRaw}」不存在（用 --list 查看已配置账号）。`);
    process.exit(1);
  }
  console.log(`已切换 active 账号：${setActiveRaw}。`);
  process.exit(0);
}

const host = argValue('--host');
const portRaw = argValue('--port');
const secureRaw = argValue('--secure');
const user = argValue('--user');
const pass = argValue('--pass');
const from = argValue('--from');
const accountKey = argValue('--account');

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
  saveCredentials(creds, target, accountKey);
  const key = loadCredentialsStore(target)?.active ?? 'default';
  console.log(`已保存 SMTP 凭据：${target}`);
  console.log(`账号：${key}（active）· 发件人：${creds.from} · 服务器：${creds.host}:${creds.port}${creds.secure ? '（TLS）' : '（明文/STARTTLS）'}`);
  console.log('注意：密码/授权码不会打印。现在可以对我说“查收件箱”收信，或“发送邮件给 xxx@example.com，主题…，正文…”来发信。');
  void root;
} catch (err) {
  console.error(`保存凭据失败：${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
