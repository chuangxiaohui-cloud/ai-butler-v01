/**
 * E321：微软邮箱 OAuth2（设备码流）——Outlook.com / Microsoft 365 IMAP XOAUTH2 授权
 * 无需重定向服务器（公共客户端）；只依赖 node 原生 fetch，不新增外部依赖。
 * 流程：POST /devicecode 拿验证地址+码 → 老板在浏览器授权 → 轮询 /token 换 access/refresh token。
 * token 只写入 data/mail/mail-credentials.json（git 忽略），本模块不打印、不写日志、不进轨迹。
 */

import type { SmtpCredentials } from './credentials.js';
import { defaultCredentialsPath, loadCredentialsStore, saveCredentialsStore } from './credentials.js';

const LOGIN_BASE = 'https://login.microsoftonline.com';

/** 默认 scope：IMAP 读信（outlook.office.com 前缀，graph 前缀的 token 在 IMAP 不工作）+ offline_access 换 refresh token */
export const OUTLOOK_IMAP_SCOPE = 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access';

/** E322：SMTP 发信权限（Outlook 发信同样走 XOAUTH2，token 需含 SMTP.Send） */
export const OUTLOOK_SMTP_SCOPE = 'https://outlook.office.com/SMTP.Send';

/** E322：读信 + 发信统一授权 scope——xoauth2 账号同时支持收件与发件；IMAP/SMTP 前缀都必须是 outlook.office.com */
export const OUTLOOK_MAIL_SCOPE = `${'https://outlook.office.com/IMAP.AccessAsUser.All'} ${OUTLOOK_SMTP_SCOPE} offline_access`;

/** E322：XOAUTH2 SASL 初始响应（RFC 4959，微软 IMAP/POP/SMTP OAuth2）——base64("user="+user+"\x01auth=Bearer "+token+"\x01\x01") */
export function buildXoauth2Initial(user: string, accessToken: string): string {
  return Buffer.from(`user=${user}\x01auth=Bearer ${accessToken}\x01\x01`, 'utf8').toString('base64');
}

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** 设备码有效期（秒） */
  expiresIn: number;
  /** 轮询间隔（秒） */
  interval: number;
  /** 服务器提供的展示文案 */
  message: string;
}

export interface OauthTokenPair {
  accessToken: string;
  refreshToken: string;
  /** access token 有效期（秒），约 1 小时后需用 refreshToken 换取 */
  expiresIn: number;
  tokenType: string;
  scope: string;
}

/** 轮询结果：可重试（pending/slow_down）与成功；终态错误（拒绝/过期/失败）直接 throw */
export type PollResult =
  | { status: 'success'; tokens: OauthTokenPair }
  | { status: 'pending'; interval?: number }
  | { status: 'slow_down'; interval: number };

/** 最小 HTTP 响应形状（fetch Response 结构兼容；测试可注入普通对象） */
export interface OauthHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type OauthFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<OauthHttpResponse>;

export interface OauthRequestOptions {
  clientId: string;
  /** 租户：'consumers'（个人微软账户，默认）/ 'common' */
  tenant?: string;
  scope?: string;
  /** 测试注入用；缺省 node 原生 fetch */
  fetcher?: OauthFetcher;
  /** 单次请求超时（毫秒），默认 60s */
  timeoutMs?: number;
}

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

interface JsonResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

/** POST application/x-www-form-urlencoded 到 {tenant}/oauth2/v2.0/{path}，返回 JSON（含 HTTP 错误体的 OAuth error 字段） */
async function postForm(
  opts: OauthRequestOptions & { path: string; body: Record<string, string> },
): Promise<JsonResponse> {
  const fetcher: OauthFetcher =
    opts.fetcher ??
    ((url, init) =>
      fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: init.signal,
      }));
  const tenant = encodeURIComponent((opts.tenant ?? 'consumers').trim() || 'consumers');
  const url = `${LOGIN_BASE}/${tenant}/oauth2/v2.0/${opts.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res: OauthHttpResponse;
  try {
    res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncode({ client_id: opts.clientId, ...opts.body }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`OAuth2 请求失败（${url}）：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // 设备码/令牌端点失败通常是 HTTP 400 + OAuth error JSON；无 error 字段的其它错误如实报状态码
  if (!res.ok && typeof data.error !== 'string') {
    throw new Error(`OAuth2 端点错误（${opts.path}）：HTTP ${res.status}`);
  }
  return { ok: res.ok, status: res.status, data };
}

/** 第一步：申请设备码，返回验证地址与码（有效期与轮询间隔） */
export async function requestDeviceCode(opts: OauthRequestOptions): Promise<DeviceCodeInfo> {
  const { ok, data } = await postForm({
    ...opts,
    path: 'devicecode',
    body: { scope: opts.scope ?? OUTLOOK_MAIL_SCOPE },
  });
  if (!ok) {
    const err = typeof data.error === 'string' ? data.error : `HTTP ${''}`;
    const desc = typeof data.error_description === 'string' ? `：${data.error_description}` : '';
    throw new Error(`设备码申请失败：${err}${desc}`);
  }
  const pick = (key: string): string => {
    const v = data[key];
    if (typeof v !== 'string' || !v) throw new Error(`OAuth2 设备码响应缺少字段：${key}`);
    return v;
  };
  return {
    deviceCode: pick('device_code'),
    userCode: pick('user_code'),
    verificationUri: pick('verification_uri'),
    expiresIn: Number(data.expires_in ?? 900),
    interval: Number(data.interval ?? 5),
    message: typeof data.message === 'string' ? data.message : '',
  };
}

/** 第二步：轮询令牌。pending/slow_down 返回可重试；authorization_declined 等终态直接 throw */
export async function pollDeviceToken(
  opts: OauthRequestOptions & { deviceCode: string; interval: number },
): Promise<PollResult> {
  const { data } = await postForm({
    ...opts,
    path: 'token',
    body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: opts.deviceCode },
  });
  const err = typeof data.error === 'string' ? data.error : undefined;
  if (err === 'authorization_pending') return { status: 'pending', interval: opts.interval };
  if (err === 'slow_down') return { status: 'slow_down', interval: opts.interval + 5 };
  if (err === 'authorization_declined') {
    throw new Error('OAuth2 授权被拒绝：未在浏览器完成同意，可重新运行重试。');
  }
  if (err === 'expired_token') {
    throw new Error('OAuth2 设备码已过期：未在有效期内完成授权，请重新运行获取新码。');
  }
  if (err === 'bad_verification_code') {
    throw new Error('OAuth2 设备码无效：请重新运行获取新码。');
  }
  if (err) {
    const desc = typeof data.error_description === 'string' ? `：${data.error_description}` : '';
    throw new Error(`OAuth2 token 换取失败：${err}${desc}`);
  }
  for (const key of ['access_token', 'refresh_token']) {
    if (typeof data[key] !== 'string' || !data[key]) {
      throw new Error(`OAuth2 token 响应缺少字段：${key}`);
    }
  }
  return {
    status: 'success',
    tokens: {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token),
      expiresIn: Number(data.expires_in ?? 3600),
      tokenType: String(data.token_type ?? 'Bearer'),
      scope: String(data.scope ?? ''),
    },
  };
}

/** 解码 access token 的 JWT exp（Unix 秒）；非 JWT / 解析失败返回 null（视为未知，不主动刷新） */
export function xoauthExpirySeconds(accessToken: string): number | null {
  const segment = accessToken.split('.')[1];
  if (!segment) return null;
  try {
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { exp?: unknown };
    const exp = typeof payload.exp === 'number' ? payload.exp : Number(payload.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

export interface RefreshTokenResult {
  accessToken: string;
  /** 服务端可能轮换 refresh token；未返回则沿用旧值 */
  refreshToken?: string;
  expiresIn: number;
  scope: string;
}

/** 用 refresh token 换新 access token（grant_type=refresh_token）；终态错误（invalid_grant 等）明确报错 */
export async function refreshAccessToken(
  opts: OauthRequestOptions & { refreshToken: string },
): Promise<RefreshTokenResult> {
  const { data } = await postForm({
    ...opts,
    path: 'token',
    body: {
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      scope: opts.scope ?? OUTLOOK_MAIL_SCOPE,
    },
  });
  const err = typeof data.error === 'string' ? data.error : undefined;
  if (err) {
    const desc = typeof data.error_description === 'string' ? `：${data.error_description}` : '';
    throw new Error(
      `刷新 Outlook access token 失败：${err}${desc}。refresh token 失效时请重新运行 npm run mail:oauth 授权。`,
    );
  }
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('OAuth2 刷新响应缺少字段：access_token');
  }
  return {
    accessToken: String(data.access_token),
    refreshToken:
      typeof data.refresh_token === 'string' && data.refresh_token ? String(data.refresh_token) : undefined,
    expiresIn: Number(data.expires_in ?? 3600),
    scope: String(data.scope ?? ''),
  };
}

/** 距过期提前刷新阈值（秒）：剩余 5 分钟内就换新，避免 IMAP 登录撞上过期 */
const REFRESH_AHEAD_SECONDS = 300;

/**
 * E321：加载邮箱账号凭据；xoauth2 且 access token 缺失或临期时，用 refresh token 自动换新并回写凭据文件。
 * password 账号与既有行为一致（不联网、不写文件）；缺续期条件（clientId/refreshToken）时原样返回，由 IMAP 层给「请重新授权」指引。
 */
export async function loadXoauthCredentials(
  path: string = defaultCredentialsPath(),
  accountKey?: string,
  fetcher?: OauthFetcher,
): Promise<SmtpCredentials | null> {
  const store = loadCredentialsStore(path);
  if (!store) return null;
  const key = accountKey?.trim() || store.active;
  const creds = store.accounts[key];
  if (!creds) return null;
  if (creds.auth !== 'xoauth2') return creds;
  const hasAccess = typeof creds.accessToken === 'string' && creds.accessToken.trim() !== '';
  const expiry = hasAccess ? xoauthExpirySeconds(creds.accessToken as string) : null;
  const fresh = hasAccess && (expiry === null || expiry > Math.floor(Date.now() / 1000) + REFRESH_AHEAD_SECONDS);
  if (fresh) return creds;
  if (!creds.clientId || !creds.refreshToken) return creds;
  const refreshed = await refreshAccessToken({
    clientId: creds.clientId,
    tenant: creds.tenant,
    scope: OUTLOOK_MAIL_SCOPE,
    refreshToken: creds.refreshToken,
    fetcher,
  });
  creds.accessToken = refreshed.accessToken;
  if (refreshed.refreshToken) creds.refreshToken = refreshed.refreshToken;
  store.accounts[key] = creds;
  saveCredentialsStore(store, path);
  return creds;
}
