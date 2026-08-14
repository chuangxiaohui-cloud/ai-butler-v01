/**
 * AnySearch 适配器（§6.2，[P-65] 配额 + [P-03] 超时）
 * 端点与解析与 v3 基准脚本一致：POST https://api.anysearch.com/v1/search
 */

import { loadEnvFile } from '../../config/env.js';
import type {
  ProviderId,
  SearchOptions,
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from './types.js';

const ENDPOINT = 'https://api.anysearch.com/v1/search';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESULTS = 8;

interface AnysearchHit {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
  description?: string;
  published_date?: string;
  date?: string;
}

export class AnySearchProvider implements SearchProvider {
  readonly id: ProviderId = 'anysearch';

  async search(query: string, opts: SearchOptions = {}): Promise<SearchProviderResult> {
    loadEnvFile();
    const start = Date.now();
    const apiKey = process.env.ANYSEARCH_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: this.id,
        ok: false,
        results: [],
        latencyMs: Date.now() - start,
        error: '未配置 ANYSEARCH_API_KEY',
      };
    }
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, num: MAX_RESULTS }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        return {
          provider: this.id,
          ok: false,
          results: [],
          latencyMs: Date.now() - start,
          error: `HTTP ${resp.status}`,
        };
      }
      const data = (await resp.json()) as {
        results?: AnysearchHit[];
        data?: { results?: AnysearchHit[] };
      };
      const hits = data.results ?? data.data?.results ?? [];
      const results: SearchResultItem[] = hits.slice(0, MAX_RESULTS).map((h) => ({
        title: h.title ?? '',
        url: h.url ?? h.link ?? '',
        content: (h.snippet ?? h.description ?? '').slice(0, 500),
        published: h.published_date ?? h.date,
        provider: this.id,
      }));
      return {
        provider: this.id,
        ok: results.length > 0,
        results,
        latencyMs: Date.now() - start,
        error: results.length === 0 ? 'AnySearch 无结果' : undefined,
      };
    } catch (err) {
      return {
        provider: this.id,
        ok: false,
        results: [],
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const anysearchProvider = new AnySearchProvider();
