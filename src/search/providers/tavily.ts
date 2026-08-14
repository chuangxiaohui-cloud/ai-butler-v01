/**
 * Tavily 适配器（v0.2a WP0，§6.2.1）
 * 端点/请求体与历史基准脚本一致；AI Answer 提取自 data.answer。
 */

import { loadEnvFile } from '../../config/env.js';
import type {
  ProviderId,
  SearchOptions,
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from './types.js';

const ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_TIMEOUT_MS = 3000; // [P-35]
const MAX_RESULTS = 8;

interface TavilyHit {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
  score?: number;
}

interface TavilyResponse {
  results?: TavilyHit[];
  answer?: string;
}

export class TavilyProvider implements SearchProvider {
  readonly id: ProviderId = 'tavily';

  async search(query: string, opts: SearchOptions = {}): Promise<SearchProviderResult> {
    loadEnvFile();
    const start = Date.now();
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: this.id,
        ok: false,
        results: [],
        latencyMs: Date.now() - start,
        error: '未配置 TAVILY_API_KEY',
      };
    }
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: MAX_RESULTS,
          search_depth: opts.topic === 'news' ? 'advanced' : 'basic',
          include_answer: true,
          include_raw_content: false,
          ...(opts.topic === 'news'
            ? { topic: 'news', days: opts.days ?? 30 }
            : {}),
        }),
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
      const data = (await resp.json()) as TavilyResponse;
      const hits = data.results ?? [];
      const results: SearchResultItem[] = hits.slice(0, MAX_RESULTS).map((h) => ({
        title: h.title ?? '',
        url: h.url ?? '',
        content: (h.content ?? '').slice(0, 500),
        published: h.published_date,
        provider: this.id,
      }));
      return {
        provider: this.id,
        ok: results.length > 0,
        results,
        answer: data.answer,
        latencyMs: Date.now() - start,
        error: results.length === 0 ? 'Tavily 无结果' : undefined,
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

export const tavilyProvider = new TavilyProvider();
