/**
 * Bocha 余额探测与告警（§D.3 资源包健康检查落地，E192）
 * 端点：GET /v1/fund/remaining（主 api.bocha.cn，备 api.bochaai.com），Bearer 鉴权。
 * [P-75] 体验包单价折算剩余次数；[P-67] 余量告警阈值——Bocha 余额接口只返回账户总余额、
 * 无资源包总量字段，代码侧落地为固定告警线：剩余次数 <= 10（E192 登记语义）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { loadEnvFile } from '../config/env.js';

export const BOCHA_PER_CALL_YUAN = 0.0036; // [P-75] Bocha 体验包单价（元/次）
export const BOCHA_LOW_BALANCE_CALLS = 10; // [P-67] 余量告警落地线（剩余次数）
export const BOCHA_BALANCE_COOLDOWN_MS = 30 * 60 * 1000; // 探测冷却：30 分钟内复用缓存，防高频请求余额接口

const PRIMARY_ENDPOINT = 'https://api.bocha.cn/v1/fund/remaining';
const FALLBACK_ENDPOINT = 'https://api.bochaai.com/v1/fund/remaining';
const PROBE_TIMEOUT_MS = 3000;

export interface BochaBalanceSnapshot {
  remainingYuan: number;
  remainingCalls: number;
  fetchedAt: string;
}

interface CacheFile extends BochaBalanceSnapshot {}

let memoryCache: { at: number; snapshot: BochaBalanceSnapshot | null } | null = null;

function cacheFilePath(): string {
  // 测试可通过 BOCHA_BALANCE_CACHE 覆盖，避免写入仓库 data/
  return process.env.BOCHA_BALANCE_CACHE ?? join(process.cwd(), 'data', 'bocha-balance.json');
}

function readPersistedCache(): BochaBalanceSnapshot | null {
  try {
    const parsed = JSON.parse(readFileSync(cacheFilePath(), 'utf-8')) as CacheFile;
    if (
      typeof parsed.remainingYuan === 'number' &&
      typeof parsed.remainingCalls === 'number' &&
      typeof parsed.fetchedAt === 'string'
    ) {
      return parsed;
    }
  } catch {
    // 缓存缺失或损坏：忽略
  }
  return null;
}

function writePersistedCache(snapshot: BochaBalanceSnapshot): void {
  try {
    const file = cacheFilePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch {
    // 缓存写失败不阻塞探测
  }
}

function isFresh(snapshot: BochaBalanceSnapshot | null, now: number): boolean {
  if (!snapshot) return false;
  const at = Date.parse(snapshot.fetchedAt);
  return Number.isFinite(at) && now - at < BOCHA_BALANCE_COOLDOWN_MS;
}

export interface BalanceQueryOptions {
  timeoutMs?: number;
  force?: boolean;
}

/**
 * 查询 Bocha 账户余额；失败或未配置 key 时返回 null（静默降级，不阻塞搜索）。
 * 顺序：内存缓存（冷却内）→ 持久缓存（冷却内）→ 网络探测（主/备 host）。
 */
export async function queryBochaBalance(opts: BalanceQueryOptions = {}): Promise<BochaBalanceSnapshot | null> {
  const now = Date.now();
  if (!opts.force && memoryCache && now - memoryCache.at < BOCHA_BALANCE_COOLDOWN_MS) {
    return memoryCache.snapshot;
  }
  if (!opts.force) {
    const persisted = readPersistedCache();
    if (isFresh(persisted, now)) {
      memoryCache = { at: now, snapshot: persisted };
      return persisted;
    }
  }
  loadEnvFile();
  const apiKey = process.env.BOCHA_API_KEY?.trim();
  if (!apiKey) {
    memoryCache = { at: now, snapshot: null };
    return null;
  }
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  const snapshot =
    (await probeHost(apiKey, PRIMARY_ENDPOINT, timeoutMs)) ??
    (await probeHost(apiKey, FALLBACK_ENDPOINT, timeoutMs));
  memoryCache = { at: now, snapshot };
  if (snapshot) writePersistedCache(snapshot);
  return snapshot;
}

async function probeHost(
  apiKey: string,
  endpoint: string,
  timeoutMs: number,
): Promise<BochaBalanceSnapshot | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { data?: { remaining?: number } };
    const remainingYuan = data.data?.remaining;
    if (typeof remainingYuan !== 'number' || !Number.isFinite(remainingYuan) || remainingYuan < 0) {
      return null;
    }
    return {
      remainingYuan,
      remainingCalls: Math.floor(remainingYuan / BOCHA_PER_CALL_YUAN),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 余额概况文案（启动/网关日志展示用） */
export function describeBochaBalance(snapshot: BochaBalanceSnapshot): string {
  return `Bocha 余额 ¥${snapshot.remainingYuan.toFixed(2)}（约 ${snapshot.remainingCalls} 次可用，[P-75] ${BOCHA_PER_CALL_YUAN} 元/次）`;
}

/** 余额告警文案：耗尽强告警 / 低余量 [P-67] 软告警；健康返回 null */
export function bochaBalanceWarning(snapshot: BochaBalanceSnapshot): string | null {
  if (snapshot.remainingCalls <= 0) {
    return 'Bocha 余额已耗尽，搜索将由 AnySearch/浏览器独立兜底；请购买体验包（防 [P-76] 按量 10 倍成本）';
  }
  if (snapshot.remainingCalls <= BOCHA_LOW_BALANCE_CALLS) {
    return `Bocha 余额告警（[P-67] 余量阈值）：仅剩约 ${snapshot.remainingCalls} 次（¥${snapshot.remainingYuan.toFixed(2)}），请及时购买体验包`;
  }
  return null;
}

/** 测试用：清空内存缓存 */
export function resetBochaBalanceCache(): void {
  memoryCache = null;
}
