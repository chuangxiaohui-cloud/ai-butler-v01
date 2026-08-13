#!/usr/bin/env node
/**
 * E1/E2 复验门定稿评估（WP11）
 * E1：输出 P-04 推荐值 = classify p95×1.2 取整到 250ms 档。
 * E2：输出 AnySearch/Bocha 超时率与尾延迟，核对 P-02=5s 是否仍成立。
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  readSearchMetrics,
  type SearchRequestMetric,
} from '../src/search/metrics.js';

const CUTOFF = '2026-08-12T16:00:00Z';
const CLASSIFY_PATH = join(process.cwd(), 'bench', 'classify-metrics.jsonl');

interface ClassifyMetric {
  ts: string;
  id: string;
  query: string;
  expected: string;
  intent: string;
  source: 'llm' | 'fallback';
  timedOut: boolean;
  latencyMs: number;
}

function readClassifyMetrics(path = CLASSIFY_PATH): ClassifyMetric[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ClassifyMetric;
      } catch {
        return null;
      }
    })
    .filter((x): x is ClassifyMetric => x !== null);
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function bucket250(ms: number): number {
  return Math.ceil(ms / 250) * 250;
}

function isCacheHit(m: SearchRequestMetric): boolean {
  return (
    m.bocha_ms === null &&
    !m.bocha_ok &&
    m.anysearch_ms === null &&
    !m.anysearch_ok &&
    !m.timeout &&
    !m.degraded
  );
}

interface EngineStats {
  n: number;
  fail: number;
  latencies: number[];
}

function engineStats(
  recent: SearchRequestMetric[],
  kind: 'bocha' | 'anysearch',
): EngineStats {
  const skipKey = kind === 'bocha' ? 'bocha_quota_skipped' : 'anysearch_quota_skipped';
  const msKey = kind === 'bocha' ? 'bocha_ms' : 'anysearch_ms';
  const okKey = kind === 'bocha' ? 'bocha_ok' : 'anysearch_ok';
  const otherOkKey = kind === 'bocha' ? 'anysearch_ok' : 'bocha_ok';
  const stats: EngineStats = { n: 0, fail: 0, latencies: [] };
  for (const m of recent) {
    if (isCacheHit(m)) continue;
    const inferredSkip =
      !m.timeout &&
      !m.degraded &&
      m[msKey] === null &&
      !m[okKey] &&
      m[otherOkKey];
    if (m[skipKey] || inferredSkip) continue;
    const hasAttempt = m[msKey] !== null || !m[okKey];
    if (!hasAttempt) continue;
    stats.n += 1;
    if (m[msKey] !== null) stats.latencies.push(m[msKey]);
    if (!m[okKey]) stats.fail += 1;
  }
  return stats;
}

function main(): void {
  const fromArg = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1];
  const from = fromArg ?? CUTOFF;

  const classify = readClassifyMetrics().filter((m) => m.ts >= from);
  const timedOut = classify.filter((m) => m.timedOut).length;
  const correct = classify.filter((m) => m.intent === m.expected).length;
  const timeoutRate = classify.length > 0 ? timedOut / classify.length : 0;
  const accuracy = classify.length > 0 ? correct / classify.length : 0;
  const sorted = classify.map((m) => m.latencyMs).sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  const proposed = bucket250(p95 * 1.2);

  console.log(`E1 finalization (P-04): n=${classify.length} window>=${from}`);
  console.log(
    `  timeoutRate=${(timeoutRate * 100).toFixed(1)}% (${timedOut}/${classify.length}), accuracy=${(accuracy * 100).toFixed(1)}% (${correct}/${classify.length})`,
  );
  console.log(
    `  latency min=${sorted[0] ?? 0}ms median=${percentile(sorted, 0.5)}ms p95=${p95}ms max=${sorted[sorted.length - 1] ?? 0}ms`,
  );
  console.log(`  proposed P-04 = ${proposed}ms (ceil(p95*1.2/250)*250)`);
  const e1Pass =
    classify.length >= 30 &&
    timeoutRate <= 0.1 &&
    accuracy >= 0.8 &&
    proposed <= 2000;
  console.log(
    `  E1 gate: ${e1Pass ? 'PASS, ready for finalization review' : 'NOT PASS, keep provisional'}`,
  );

  const recentSearch = readSearchMetrics().filter((m) => m.ts >= from);
  const bocha = engineStats(recentSearch, 'bocha');
  const anysearch = engineStats(recentSearch, 'anysearch');
  const bochaP95 = percentile([...bocha.latencies].sort((a, b) => a - b), 0.95);
  const anyP95 = percentile([...anysearch.latencies].sort((a, b) => a - b), 0.95);
  const bochaMax = bocha.latencies.length > 0 ? Math.max(...bocha.latencies) : 0;
  const anyMax = anysearch.latencies.length > 0 ? Math.max(...anysearch.latencies) : 0;
  const bochaRate = bocha.n > 0 ? bocha.fail / bocha.n : 0;
  const anyRate = anysearch.n > 0 ? anysearch.fail / anysearch.n : 0;

  console.log(`\nE2 finalization (P-02): window>=${from}`);
  console.log(
    `  bocha: n=${bocha.n} fail=${bocha.fail} timeoutRate=${(bochaRate * 100).toFixed(1)}% p95=${bochaP95}ms max=${bochaMax}ms`,
  );
  console.log(
    `  anysearch: n=${anysearch.n} fail=${anysearch.fail} timeoutRate=${(anyRate * 100).toFixed(1)}% p95=${anyP95}ms max=${anyMax}ms`,
  );
  const e2Pass =
    bocha.n >= 30 &&
    anysearch.n >= 30 &&
    bochaRate <= 0.1 &&
    anyRate <= 0.3 &&
    anyP95 <= 5000;
  console.log(`  E2 gate: ${e2Pass ? 'PASS, P-02=5s ready for finalization review' : 'NOT PASS, keep provisional'}`);
}

main();
