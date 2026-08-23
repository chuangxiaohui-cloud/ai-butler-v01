/**
 * Tavily 远端用量快照（E228：[P-64] 口径复算）
 *
 * 背景：本地 FileMonthlyQuotaStore 在调用前预增计数（失败也计数），是「尝试次数」观察指标；
 * 远端 `GET /usage` 的 key.usage 才是权威用量（E195 实测 634/1000 时远端已 HTTP 432 超限）。
 * 本模块拉取远端快照供 smoke/告警复核；`limit:null` 时不做 `remaining = limit - usage`，
 * 超额判定统一以远端 usage>=1000 或 provider 的 HTTP 432 为准（见 tavily.ts）。
 */

import { loadEnvFile } from '../config/env.js';

export const TAVILY_USAGE_ENDPOINT = 'https://api.tavily.com/usage';
const DEFAULT_TIMEOUT_MS = 3000; // 与 [P-35] 搜索 provider 默认超时一致

export interface TavilyUsageSnapshot {
  ok: boolean;
  /** 远端权威用量（key.usage） */
  usage?: number;
  limit?: number | null;
  searchUsage?: number;
  crawlUsage?: number;
  extractUsage?: number;
  mapUsage?: number;
  researchUsage?: number;
  plan?: string;
  latencyMs: number;
  error?: string;
}

/** 可注入 fetch（便于单测）：仅用 ok/status/json() 三个成员 */
export interface UsageFetchLike {
  (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export interface FetchTavilyUsageOptions {
  timeoutMs?: number;
  fetchImpl?: UsageFetchLike;
  apiKey?: string;
}

export async function fetchTavilyUsage(
  opts: FetchTavilyUsageOptions = {},
): Promise<TavilyUsageSnapshot> {
  loadEnvFile();
  const start = Date.now();
  const apiKey = opts.apiKey ?? process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, latencyMs: Date.now() - start, error: '未配置 TAVILY_API_KEY' };
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchImpl(TAVILY_USAGE_ENDPOINT, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as {
      key?: {
        usage?: number;
        limit?: number | null;
        search_usage?: number;
        crawl_usage?: number;
        extract_usage?: number;
        map_usage?: number;
        research_usage?: number;
      };
      account?: { current_plan?: string };
    };
    const k = data.key ?? {};
    return {
      ok: true,
      usage: k.usage ?? 0,
      limit: k.limit ?? null,
      searchUsage: k.search_usage ?? 0,
      crawlUsage: k.crawl_usage ?? 0,
      extractUsage: k.extract_usage ?? 0,
      mapUsage: k.map_usage ?? 0,
      researchUsage: k.research_usage ?? 0,
      plan: data.account?.current_plan,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
