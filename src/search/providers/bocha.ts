/**
 * Bocha 适配器（§6.2，[P-63] 配额 + [P-03] 超时 + §D.3 余额告警）
 * 端点与解析与 v3 基准脚本一致：POST https://api.bochaai.com/v1/web-search
 */

import { loadEnvFile } from '../../config/env.js';
import { bochaBalanceWarning, queryBochaBalance } from '../balance.js';
import type {
  ProviderId,
  SearchOptions,
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from './types.js';

const ENDPOINT = 'https://api.bochaai.com/v1/web-search';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESULTS = 8;

interface BochaWebPage {
  name?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  datePublished?: string;
  siteName?: string;
}

export class BochaProvider implements SearchProvider {
  readonly id: ProviderId = 'bocha';

  async search(query: string, opts: SearchOptions = {}): Promise<SearchProviderResult> {
    loadEnvFile();
    const start = Date.now();
    const apiKey = process.env.BOCHA_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: this.id,
        ok: false,
        results: [],
        latencyMs: Date.now() - start,
        error: '未配置 BOCHA_API_KEY',
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
        body: JSON.stringify({
          query,
          freshness: 'noLimit',
          summary: true,
          count: MAX_RESULTS,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const httpLatencyMs = Date.now() - start;
        // HTTP 4xx（鉴权/欠费/限流）时探测一次余额并透出面向用户的告警；探测失败静默
        let notice: string | undefined;
        if (resp.status >= 400 && resp.status < 500) {
          const balance = await queryBochaBalance();
          const warning = balance ? bochaBalanceWarning(balance) : null;
          if (warning) notice = warning;
        }
        return {
          provider: this.id,
          ok: false,
          results: [],
          latencyMs: httpLatencyMs,
          error: `HTTP ${resp.status}`,
          notice,
        };
      }
      const data = (await resp.json()) as {
        data?: { webPages?: { value?: BochaWebPage[] } };
      };
      const pages = data.data?.webPages?.value ?? [];
      const results: SearchResultItem[] = pages.slice(0, MAX_RESULTS).map((p) => ({
        title: p.name ?? '',
        url: p.url ?? '',
        content: (p.summary ?? p.snippet ?? '').slice(0, 500),
        published: p.datePublished,
        provider: this.id,
      }));
      return {
        provider: this.id,
        ok: results.length > 0,
        results,
        latencyMs: Date.now() - start,
        error: results.length === 0 ? 'Bocha 无结果' : undefined,
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

export const bochaProvider = new BochaProvider();
