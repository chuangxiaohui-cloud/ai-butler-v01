/**
 * 分引擎搜索时延日志（图1 对冲①，WP4 B 方案）
 * 每条请求一条 JSONL，字段含 bocha_ms / anysearch_ms / timeout 标志。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export interface SearchRequestMetric {
  ts: string;
  query: string;
  bocha_ms: number | null;
  bocha_ok: boolean;
  anysearch_ms: number | null;
  anysearch_ok: boolean;
  timeout: boolean;
  degraded: boolean;
  cacheEngines?: 'both' | 'single';
}

export function logSearchRequest(
  entry: SearchRequestMetric,
  logPath = process.env.SEARCH_METRICS_LOG ||
    join(process.cwd(), 'bench', 'search-metrics.jsonl'),
): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch {
    // 时延日志失败不阻塞搜索
  }
}

export function readSearchMetrics(
  logPath = process.env.SEARCH_METRICS_LOG ||
    join(process.cwd(), 'bench', 'search-metrics.jsonl'),
): SearchRequestMetric[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as SearchRequestMetric;
      } catch {
        return null;
      }
    })
    .filter((x): x is SearchRequestMetric => x !== null);
}
