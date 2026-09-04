import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadCredentialsStore, saveCredentialsStore, type SmtpCredentials } from './credentials.js';
import {
  OUTLOOK_MAIL_SCOPE,
  loadXoauthCredentials,
  pollDeviceToken,
  refreshAccessToken,
  requestDeviceCode,
  xoauthExpirySeconds,
  type OauthFetcher,
} from './oauth.js';

interface FakeReply {
  ok: boolean;
  status: number;
  json: unknown;
}

/** 记录 URL 与表单体，返回可编程应答 */
function fakeFetcher(
  seen: { url: string; body: string }[],
  replies: FakeReply[] | FakeReply | ((url: string, body: string) => FakeReply),
): OauthFetcher {
  return async (url, init) => {
    seen.push({ url, body: init.body });
    const reply =
      typeof replies === 'function'
        ? replies(url, init.body)
        : Array.isArray(replies)
          ? replies.shift() ?? { ok: false, status: 500, json: {} }
          : replies;
    return { ok: reply.ok, status: reply.status, json: async () => reply.json };
  };
}

test('oauth: requestDeviceCode 正确端点与表单，解析验证信息', async () => {
  const seen: { url: string; body: string }[] = [];
  const fetcher = fakeFetcher(seen, {
    ok: true,
    status: 200,
    json: {
      device_code: 'DEV-1',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://microsoft.com/devicelogin',
      expires_in: 900,
      interval: 5,
      message: 'To sign in, use a web browser to open https://microsoft.com/devicelogin and enter the code ABCD-EFGH',
    },
  });
  const info = await requestDeviceCode({ clientId: 'cid-1', fetcher });
  assert.equal(info.deviceCode, 'DEV-1');
  assert.equal(info.userCode, 'ABCD-EFGH');
  assert.equal(info.verificationUri, 'https://microsoft.com/devicelogin');
  assert.equal(info.expiresIn, 900);
  assert.equal(info.interval, 5);
  assert.ok(seen[0].url.endsWith('/consumers/oauth2/v2.0/devicecode'), seen[0].url);
  assert.ok(seen[0].body.includes('client_id=cid-1'));
  assert.ok(seen[0].body.includes('scope=' + encodeURIComponent(OUTLOOK_MAIL_SCOPE)));
});

test('oauth: OUTLOOK_MAIL_SCOPE 缺省授权同时覆盖 IMAP 读信与 SMTP 发信（E322）', () => {
  assert.ok(OUTLOOK_MAIL_SCOPE.includes('https://outlook.office.com/IMAP.AccessAsUser.All'));
  assert.ok(OUTLOOK_MAIL_SCOPE.includes('https://outlook.office.com/SMTP.Send'));
  assert.ok(OUTLOOK_MAIL_SCOPE.includes('offline_access'));
});

test('oauth: requestDeviceCode 应用不存在等 HTTP 4xx → 报错含 error_description（AADSTS 可读）', async () => {
  const seen: { url: string; body: string }[] = [];
  const fetcher = fakeFetcher(seen, {
    ok: false,
    status: 400,
    json: { error: 'invalid_client', error_description: 'AADSTS700016 - Application not found.' },
  });
  await assert.rejects(
    requestDeviceCode({ clientId: 'bad', fetcher }),
    (err: Error) => err.message.includes('AADSTS700016'),
  );
});

test('oauth: pollDeviceToken 成功 → 映射 token 字段（含 refresh token）', async () => {
  const seen: { url: string; body: string }[] = [];
  const fetcher = fakeFetcher(seen, {
    ok: true,
    status: 200,
    json: {
      token_type: 'Bearer',
      scope: OUTLOOK_MAIL_SCOPE,
      expires_in: 3600,
      access_token: 'AT-1',
      refresh_token: 'RT-1',
    },
  });
  const result = await pollDeviceToken({ clientId: 'cid-1', deviceCode: 'DEV-1', interval: 5, fetcher });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.tokens.accessToken, 'AT-1');
  assert.equal(result.tokens.refreshToken, 'RT-1');
  assert.equal(result.tokens.expiresIn, 3600);
  assert.ok(seen[0].url.endsWith('/consumers/oauth2/v2.0/token'));
  assert.ok(seen[0].body.includes('grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')));
  assert.ok(seen[0].body.includes('device_code=DEV-1'));
});

test('oauth: pollDeviceToken authorization_pending → 可重试；slow_down → 间隔 +5s', async () => {
  const seen: { url: string; body: string }[] = [];
  let call = 0;
  const fetcher = fakeFetcher(seen, () => {
    call += 1;
    return call === 1
      ? { ok: false, status: 400, json: { error: 'authorization_pending' } }
      : { ok: false, status: 400, json: { error: 'slow_down' } };
  });
  const first = await pollDeviceToken({ clientId: 'cid-1', deviceCode: 'DEV-1', interval: 5, fetcher });
  assert.deepEqual(first, { status: 'pending', interval: 5 });
  const second = await pollDeviceToken({ clientId: 'cid-1', deviceCode: 'DEV-1', interval: 5, fetcher });
  assert.deepEqual(second, { status: 'slow_down', interval: 10 });
});

test('oauth: pollDeviceToken authorization_declined / expired_token → 终态明确报错', async () => {
  const fetcher = fakeFetcher([], {
    ok: false,
    status: 400,
    json: { error: 'authorization_declined' },
  });
  await assert.rejects(
    pollDeviceToken({ clientId: 'cid-1', deviceCode: 'DEV-1', interval: 5, fetcher }),
    (err: Error) => err.message.includes('拒绝'),
  );
  const fetcher2 = fakeFetcher([], {
    ok: false,
    status: 400,
    json: { error: 'expired_token' },
  });
  await assert.rejects(
    pollDeviceToken({ clientId: 'cid-1', deviceCode: 'DEV-1', interval: 5, fetcher: fetcher2 }),
    (err: Error) => err.message.includes('已过期'),
  );
});

/** 构造带 exp 的假 JWT（仅 payload 被解析，签名不限） */
function fakeJwt(exp: number): string {
  const enc = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ exp })}.sig`;
}

function writeCreds(path: string, creds: SmtpCredentials): void {
  saveCredentialsStore({ active: 'outlook', accounts: { outlook: creds } }, path);
}

test('oauth: xoauthExpirySeconds 解析 JWT exp / 非 JWT 返回 null', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(xoauthExpirySeconds(fakeJwt(now + 3600)), now + 3600);
  assert.equal(xoauthExpirySeconds('not-a-jwt'), null);
});

test('oauth: refreshAccessToken 成功——refresh_token grant 表单 + refresh token 轮换', async () => {
  const seen: { url: string; body: string }[] = [];
  const fetcher = fakeFetcher(seen, {
    ok: true,
    status: 200,
    json: {
      token_type: 'Bearer',
      scope: OUTLOOK_MAIL_SCOPE,
      expires_in: 3600,
      access_token: 'AT-2',
      refresh_token: 'RT-2',
    },
  });
  const result = await refreshAccessToken({ clientId: 'cid-1', refreshToken: 'RT-1', fetcher });
  assert.equal(result.accessToken, 'AT-2');
  assert.equal(result.refreshToken, 'RT-2');
  assert.ok(seen[0].url.endsWith('/consumers/oauth2/v2.0/token'), seen[0].url);
  assert.ok(seen[0].body.includes('grant_type=refresh_token'));
  assert.ok(seen[0].body.includes('refresh_token=RT-1'));
});

test('oauth: refreshAccessToken invalid_grant → 报错提示重新授权', async () => {
  const fetcher = fakeFetcher([], {
    ok: false,
    status: 400,
    json: { error: 'invalid_grant', error_description: 'AADSTS70008 - Refresh token expired.' },
  });
  await assert.rejects(
    refreshAccessToken({ clientId: 'cid-1', refreshToken: 'RT-1', fetcher }),
    (err: Error) => err.message.includes('重新运行') && err.message.includes('AADSTS70008'),
  );
});

test('oauth: loadXoauthCredentials 过期 token → 自动刷新并回写文件（含 refresh 轮换）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oauth-cred-test-'));
  try {
    const path = join(dir, 'mail-credentials.json');
    const seen: { url: string; body: string }[] = [];
    const now = Math.floor(Date.now() / 1000);
    writeCreds(path, {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      user: 'me@outlook.com',
      pass: '',
      from: 'me@outlook.com',
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      imapSecure: true,
      auth: 'xoauth2',
      clientId: 'cid-1',
      tenant: 'consumers',
      accessToken: fakeJwt(now - 600),
      refreshToken: 'RT-1',
    });
    const fetcher = fakeFetcher(seen, {
      ok: true,
      status: 200,
      json: { access_token: 'AT-NEW', refresh_token: 'RT-2', expires_in: 3600, scope: OUTLOOK_MAIL_SCOPE },
    });
    const got = await loadXoauthCredentials(path, 'outlook', fetcher);
    assert.equal(got?.accessToken, 'AT-NEW');
    assert.ok(
      seen[0].body.includes('scope=' + encodeURIComponent(OUTLOOK_MAIL_SCOPE)),
      '续期请求 scope 应含 IMAP+SMTP（E322）',
    );
    const stored = loadCredentialsStore(path);
    assert.equal(stored?.accounts.outlook.accessToken, 'AT-NEW');
    assert.equal(stored?.accounts.outlook.refreshToken, 'RT-2', 'refresh 轮换应回写');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('oauth: loadXoauthCredentials 有效 token 不触发刷新（零网络）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oauth-cred-test-'));
  try {
    const path = join(dir, 'mail-credentials.json');
    const now = Math.floor(Date.now() / 1000);
    const accessToken = fakeJwt(now + 3600);
    writeCreds(path, {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      user: 'me@outlook.com',
      pass: '',
      from: 'me@outlook.com',
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      imapSecure: true,
      auth: 'xoauth2',
      clientId: 'cid-1',
      tenant: 'consumers',
      accessToken,
      refreshToken: 'RT-1',
    });
    const boom = async (): Promise<never> => {
      throw new Error('不应发起刷新请求');
    };
    const got = await loadXoauthCredentials(path, 'outlook', boom);
    assert.equal(got?.accessToken, accessToken);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('oauth: loadXoauthCredentials password 账号与缺 clientId 原样返回，不联网', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oauth-cred-test-'));
  try {
    const path = join(dir, 'mail-credentials.json');
    writeCreds(path, {
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      user: 'you@qq.com',
      pass: '授权码',
      from: 'you@qq.com',
    });
    const boom = async (): Promise<never> => {
      throw new Error('不应发起刷新请求');
    };
    const got = await loadXoauthCredentials(path, 'outlook', boom);
    assert.equal(got?.pass, '授权码');
    // xoauth2 但缺续期条件（clientId/refreshToken）：原样返回，由 IMAP 层给「请重新授权」指引
    writeCreds(path, {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      user: 'me@outlook.com',
      pass: '',
      from: 'me@outlook.com',
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      imapSecure: true,
      auth: 'xoauth2',
      clientId: 'cid-1',
      accessToken: fakeJwt(Math.floor(Date.now() / 1000) - 600),
    });
    const got2 = await loadXoauthCredentials(path, 'outlook', boom);
    assert.ok(got2, '缺 refreshToken 不应抛错');
    assert.equal(got2?.accessToken?.startsWith('ey'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
