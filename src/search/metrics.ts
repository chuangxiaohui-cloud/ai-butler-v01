/**
 * 分引擎搜索时延日志（图1 对冲①，WP4 B 方案）
 * 每条请求一条 JSONL，字段含 bocha_ms / anysearch_ms / timeout 标志。
 */

import { join } from 'path';
import { appendJsonl, readJsonlCached } from '../log/jsonl.js';

export interface SearchRequestMetric {
  ts: string;
  query: string;
  bocha_ms: number | null;
  bocha_ok: boolean;
  anysearch_ms: number | null;
  anysearch_ok: boolean;
  bocha_quota_skipped?: boolean;
  anysearch_quota_skipped?: boolean;
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
    appendJsonl(logPath, JSON.stringify(entry));
  } catch {
    // 时延日志失败不阻塞搜索
  }
}

function parseMetricLine(line: string): SearchRequestMetric | null {
  try {
    return JSON.parse(line) as SearchRequestMetric;
  } catch {
    return null;
  }
}

// P15：mtime+size 缓存读，避免每次全量解析整文件
export function readSearchMetrics(
  logPath = process.env.SEARCH_METRICS_LOG ||
    join(process.cwd(), 'bench', 'search-metrics.jsonl'),
): SearchRequestMetric[] {
  return readJsonlCached(logPath, parseMetricLine);
}
