#!/usr/bin/env node
/**
 * E1/E2 gate recheck (v0.2b leftover)
 * E2: engine timeout rates from bench/search-metrics.jsonl.
 * E1: classify timeout rate from bench/classify-metrics.jsonl (accumulated by classify:smoke).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { readSearchMetrics } from '../src/search/metrics.js';

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

function isCacheHit(m: {
  bocha_ms: number | null;
  bocha_ok: boolean;
  anysearch_ms: number | null;
  anysearch_ok: boolean;
  timeout: boolean;
  degraded: boolean;
}): boolean {
  return (
    m.bocha_ms === null &&
    !m.bocha_ok &&
    m.anysearch_ms === null &&
    !m.anysearch_ok &&
    !m.timeout &&
    !m.degraded
  );
}

function engineStats(
  recent: ReturnType<typeof readSearchMetrics>,
  kind: 'bocha' | 'anysearch',
): { n: number; fail: number } {
  const skipKey = kind === 'bocha' ? 'bocha_quota_skipped' : 'anysearch_quota_skipped';
  const msKey = kind === 'bocha' ? 'bocha_ms' : 'anysearch_ms';
  const okKey = kind === 'bocha' ? 'bocha_ok' : 'anysearch_ok';
  const otherOkKey = kind === 'bocha' ? 'anysearch_ok' : 'bocha_ok';
  const stats = { n: 0, fail: 0 };
  for (const m of recent) {
    if (isCacheHit(m)) continue;
    const inferredSkip =
      !m.timeout &&
      !m.degraded &&
      m[msKey as keyof typeof m] === null &&
      !m[okKey as keyof typeof m] &&
      m[otherOkKey as keyof typeof m];
    if (m[skipKey as keyof typeof m] || inferredSkip) continue;
    const hasAttempt = m[msKey as keyof typeof m] !== null || !m[okKey as keyof typeof m];
    if (!hasAttempt) continue;
    stats.n += 1;
    if (!m[okKey as keyof typeof m]) stats.fail += 1;
  }
  return stats;
}

function main(): void {
  const fromArg = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1];
  const from = fromArg ?? CUTOFF;
  const all = readSearchMetrics();
  const recent = all.filter((m) => m.ts >= from);

  console.log(`E2 samples: total=${all.length} window>=${from}=${recent.length}`);
  const stats = {
    bocha: engineStats(recent, 'bocha'),
    anysearch: engineStats(recent, 'anysearch'),
  };
  for (const key of ['bocha', 'anysearch'] as const) {
    const s = stats[key];
    const rate = s.n > 0 ? s.fail / s.n : 0;
    console.log(`${key}: n=${s.n} fail=${s.fail} timeoutRate=${(rate * 100).toFixed(1)}%`);
  }

  const any = stats.anysearch;
  const bocha = stats.bocha;
  const ready = any.n >= 30 && bocha.n >= 30;
  if (!ready) {
    console.log('\nE2 recheck: insufficient samples (need AnySearch/Bocha n>=30), keep provisional');
  } else {
    const anyRate = any.fail / any.n;
    const bochaRate = bocha.fail / bocha.n;
    const reopen = anyRate > 0.3 || bochaRate > 0.1;
    console.log(
      `\nE2 gate (AnySearch@5s >30% or Bocha >10% -> reopen P-02): ` +
        (reopen ? 'TRIGGERED, reopen P-02 decision' : 'NOT triggered, P-02 may proceed to finalization review'),
    );
  }

  const classifyAll = readClassifyMetrics();
  const classifyRecent = classifyAll.filter((m) => m.ts >= from);
  const timedOut = classifyRecent.filter((m) => m.timedOut).length;
  const correct = classifyRecent.filter((m) => m.intent === m.expected).length;
  const timeoutRate = classifyRecent.length > 0 ? timedOut / classifyRecent.length : 0;
  const accuracy = classifyRecent.length > 0 ? correct / classifyRecent.length : 0;
  console.log(`\nE1 samples: total=${classifyAll.length} window=${classifyRecent.length}`);
  console.log(
    `classify timeoutRate=${(timeoutRate * 100).toFixed(1)}% (${timedOut}/${classifyRecent.length}), accuracy=${(accuracy * 100).toFixed(1)}% (${correct}/${classifyRecent.length})`,
  );
  if (classifyRecent.length >= 30) {
    const reopen = timeoutRate > 0.1 || accuracy < 0.8;
    console.log(
      `E1 gate (timeoutRate <=10% and accuracy >=80% -> keep): ` +
        (reopen ? 'TRIGGERED, reopen P-04 decision' : 'NOT triggered, P-04 may proceed to finalization review'),
    );
  } else {
    console.log('E1 recheck: insufficient samples (need n>=30), keep accumulating');
  }
}

main();
