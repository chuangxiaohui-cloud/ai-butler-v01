#!/usr/bin/env node
/**
 * E321：Outlook 等微软邮箱 OAuth2 设备码授权（无需重定向服务器）
 * 用法：
 *   npm run mail:oauth -- --client-id <应用ID> --user you@outlook.com [--account outlook] [--tenant consumers] [--scope ...] [--open]
 * 流程：申请设备码 → 老板在浏览器打开验证地址并输入码 → 轮询换 token → 自动写入 data/mail/mail-credentials.json。
 * token 不打印、不进日志；access token 过期后由收件流程自动用 refreshToken 续期并回写凭据。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  defaultCredentialsPath,
  loadCredentialsStore,
  saveCredentialsStore,
} from '../src/mail/credentials.js';
import {
  OUTLOOK_MAIL_SCOPE,
  pollDeviceToken,
  requestDeviceCode,
} from '../src/mail/oauth.js';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);

function argValue(key) {
  const inline = args.find((a) => a.startsWith(`${key}=`))?.split('=').slice(1).join('=');
  if (inline !== undefined) return inline;
  const index = args.indexOf(key);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`用法：
  npm run mail:oauth -- --client-id <应用ID> --user you@outlook.com [--account outlook] [--tenant consumers] [--scope <scopes>] [--open]
说明：
  - 设备码流（公共客户端），无需在 Azure 配置重定向服务器；应用须在 Entra 认证页开启「允许公共客户端流」。
  - 授权 scope 默认 IMAP 读信 + SMTP 发信：https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access（scope 前缀必须是 outlook.office.com）。
  - --account 缺省 outlook；--tenant 个人微软账户用 consumers（缺省），多租户应用可换 common。
  - 授权成功后 access token / refresh token 自动写入 data/mail/mail-credentials.json（git 忽略），不打印；临期自动续期。
  - 建议加 --open 自动打开验证地址；授权完成后可对 AI-Butler 说「查 outlook 邮箱收件箱」收信或「发送邮件给 …」发信。`);
  process.exit(0);
}

const clientId = argValue('--client-id');
const user = argValue('--user');
const accountKey = argValue('--account') ?? 'outlook';
const tenant = argValue('--tenant') ?? 'consumers';
const scope = argValue('--scope') ?? OUTLOOK_MAIL_SCOPE;
const openBrowser = args.includes('--open');

if (!clientId) {
  console.error('缺少参数：--client-id（Entra 应用注册的“应用程序(客户端) ID”，见 docs/plans/2026-09-03-outlook-oauth2.md 附录 A）');
  process.exit(1);
}
if (!user) {
  console.error('缺少参数：--user（你的 Outlook 完整邮箱地址，如 you@outlook.com）');
  process.exit(1);
}
async function main() {
  console.log('正在申请设备码…（租户：' + tenant + '）');
  const device = await requestDeviceCode({ clientId, tenant, scope });
  console.log('');
  console.log('════════ Outlook OAuth2 授权 ════════');
  console.log('1. 浏览器打开：' + device.verificationUri);
  console.log('2. 输入代码：' + device.userCode);
  if (device.message) console.log(device.message);
  console.log('（授权窗口约 ' + device.expiresIn + ' 秒，未完成需重新运行）');
  console.log('══════════════════════════════════════');

  if (openBrowser) {
    try {
      await execFileAsync('cmd.exe', ['/c', 'start', '', device.verificationUri]);
    } catch {
      console.log('（自动打开浏览器失败，请手动复制上面的地址）');
    }
  }

  const deadline = Date.now() + device.expiresIn * 1000;
  let interval = device.interval;
  let tokens;
  for (;;) {
    const result = await pollDeviceToken({ clientId, tenant, deviceCode: device.deviceCode, interval });
    if (result.status === 'success') {
      tokens = result.tokens;
      break;
    }
    if (result.status === 'slow_down') interval = result.interval;
    else if (result.status === 'pending' && result.interval !== undefined) interval = result.interval;
    if (Date.now() >= deadline) {
      throw new Error('授权超时：请在设备码有效期内完成浏览器授权，重新运行重试。');
    }
    await sleep(interval * 1000);
  }

  const target = defaultCredentialsPath();
  const store = loadCredentialsStore(target) ?? { active: 'default', accounts: {} };
  const existing = store.accounts[accountKey];
  const creds = {
    host: existing?.host ?? 'smtp.office365.com',
    port: existing?.port ?? 587,
    secure: existing?.secure ?? false,
    user,
    pass: '',
    from: user,
    imapHost: existing?.imapHost ?? 'outlook.office365.com',
    imapPort: existing?.imapPort ?? 993,
    imapSecure: existing?.imapSecure ?? true,
    auth: 'xoauth2',
    clientId,
    tenant,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
  store.accounts[accountKey] = creds;
  store.active = accountKey;
  saveCredentialsStore(store, target);

  console.log('');
  console.log(`已保存 xoauth2 账号：${accountKey}（${user}）→ ${target}`);
  console.log(`服务器：${creds.host}:${creds.port}（SMTP）/ ${creds.imapHost}:${creds.imapPort}（IMAP TLS）`);
  console.log(`access token 有效期约 ${tokens.expiresIn} 秒；refresh token 已保存用于续期（均不打印）。`);
  console.log('现在可以对 AI-Butler 说「查 outlook 邮箱收件箱」收信，或「发送邮件给 xxx@example.com，主题：…，正文：…」发信。');
}

main().catch((err) => {
  console.error('OAuth2 授权失败：' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
