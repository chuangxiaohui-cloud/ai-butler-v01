#!/usr/bin/env node
/**
 * M6 纯读探针：只读 trajectory + search-metrics，输出知识问答耗时分布。
 * 不调用网络、不改任何参数。用法：
 *   npm exec tsx scripts/probe-search-latency.ts [--limit N] [--trajectory <path>] [--metrics <path>]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface AnyEvent {
  id?: string;
  timestamp?: number;
  type?: string;
  sessionId?: string;
  route?: { intent?: string };
  search?: {
    query?: string;
    latencyMs?: number;
    subQueries?: string[];
    degraded?: boolean;
  };
  synthesize?: { source?: string; error?: string };
  answer?: { elapsedMs?: number; gateTriggered?: string };
}

interface MetricLine {
  ts?: string;
  query?: string;
  bocha_ms?: number | null;
  anysearch_ms?: number | null;
  timeout?: boolean;
  degraded?: boolean;
  cacheEngines?: 'both' | 'single' | null;
}

function readLines(file: string): string[] {
  try {
    return readFileSync(file, 'utf-8').split(/\r?\n/);
  } catch {
    return [];
  }
}

function parseTrajectory(file: string): Map<string, AnyEvent[]> {
  const bySession = new Map<string, AnyEvent[]>();
  for (const line of readLines(file)) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line) as AnyEvent;
      if (typeof evt.sessionId !== 'string' || typeof evt.timestamp !== 'number') continue;
      const list = bySession.get(evt.sessionId) ?? [];
      list.push(evt);
      bySession.set(evt.sessionId, list);
    } catch {
      // 坏行忽略
    }
  }
  return bySession;
}

interface SessionBreakdown {
  sessionId: string;
  query: string;
  subQueries: number;
  day: string;
  totalMs: number;
  searchMs: number;
  preSearchMs: number;
  searchToSynthMs: number | null;
  postSearchMs: number;
  synthToAnswerMs: number | null;
  secondPassMs: number | null;
  contentFetchMs: number | null;
  supplementMs: number | null;
  synthesisMs: number | null;
  gate: string;
  synthSource: string | null;
}

function breakdown(events: AnyEvent[]): SessionBreakdown | null {
  const route = events.find((e) => e.type === 'route');
  const search = events.find((e) => e.type === 'search');
  const synth = events.find((e) => e.type === 'synthesize');
  const answer = events.find((e) => e.type === 'answer');
  if (!search?.timestamp || !search.search?.latencyMs || !answer?.timestamp || !answer.answer) {
    return null;
  }
  const searchMs = search.search.latencyMs;
  const preSearchMs = Math.max(0, search.timestamp - searchMs - (route?.timestamp ?? search.timestamp - searchMs));
  const searchToSynthMs = synth?.timestamp && search.timestamp ? synth.timestamp - search.timestamp : null;
  const synthToAnswerMs = synth?.timestamp && answer.timestamp ? answer.timestamp - synth.timestamp : null;
  const synthObj = synth?.synthesize;
  return {
    sessionId: events[0]?.sessionId ?? '',
    query: search.search.query ?? '',
    subQueries: search.search.subQueries?.length ?? 0,
    day: new Date(search.timestamp).toISOString().slice(0, 10),
    totalMs: answer.answer.elapsedMs ?? answer.timestamp - (route?.timestamp ?? answer.timestamp),
    searchMs,
    preSearchMs,
    searchToSynthMs,
    postSearchMs: answer.timestamp - search.timestamp,
    synthToAnswerMs,
    secondPassMs: synthObj?.secondPassMs ?? null,
    contentFetchMs: synthObj?.contentFetchMs ?? null,
    supplementMs: synthObj?.supplementMs ?? null,
    synthesisMs: synthObj?.synthesisMs ?? null,
    gate: answer.answer.gateTriggered ?? '',
    synthSource: synth?.synthesize?.source ?? null,
  };
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stats(values: number[]): string {
  if (values.length === 0) return 'n=0';
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return `n=${sorted.length} avg=${Math.round(sum / sorted.length)} p50=${pct(sorted, 50)} p95=${pct(sorted, 95)} max=${sorted[sorted.length - 1]}`;
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const limit = Number(argValue('--limit') ?? 0);
const recent = Number(argValue('--recent') ?? 20);
const sinceDays = Number(argValue('--sinceDays') ?? 7);
const summaryOnly = process.argv.includes('--summary');
const trajectoryFile = argValue('--trajectory') ?? join(process.cwd(), 'data', 'trajectory.jsonl');
const metricsFile = argValue('--metrics') ?? join(process.cwd(), 'bench', 'search-metrics.jsonl');

const rows: SessionBreakdown[] = [];
for (const events of parseTrajectory(trajectoryFile).values()) {
  const b = breakdown(events);
  if (b) rows.push(b);
}
rows.sort((a, b) => b.totalMs - a.totalMs);
const picked = limit > 0 ? rows.slice(0, limit) : rows;
const byTime = [...rows].sort((a, b) => b.day.localeCompare(a.day));
const recentRows = byTime.slice(0, recent);
const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
const recentStatsRows = rows.filter((r) => new Date(`${r.day}T00:00:00Z`).getTime() >= sinceMs);

console.log('== trajectory 会话耗时分布 ==');
console.log(`会话数（含 search+answer）: ${rows.length}；最近 ${recent} 条：`);
if (!summaryOnly) {
  for (const r of recentRows) {
    console.log(
      `${r.day} | ${r.totalMs}ms total | search=${r.searchMs}ms | preSearch=${r.preSearchMs}ms | search→synth=${r.searchToSynthMs ?? 'n/a'}ms | fetch=${r.secondPassMs ?? r.contentFetchMs ?? 'n/a'}ms | supplement=${r.supplementMs ?? 'n/a'}ms | synth=${r.synthesisMs ?? 'n/a'}ms | synth→answer=${r.synthToAnswerMs ?? 'n/a'}ms | sub=${r.subQueries} | gate=${r.gate} | ${r.query.slice(0, 40)}`,
    );
  }
  console.log(`\n最慢 ${picked.length} 条：`);
  for (const r of picked) {
    console.log(
      `${r.day} | ${r.totalMs}ms total | search=${r.searchMs}ms | preSearch=${r.preSearchMs}ms | search→synth=${r.searchToSynthMs ?? 'n/a'}ms | fetch=${r.secondPassMs ?? r.contentFetchMs ?? 'n/a'}ms | supplement=${r.supplementMs ?? 'n/a'}ms | synth=${r.synthesisMs ?? 'n/a'}ms | synth→answer=${r.synthToAnswerMs ?? 'n/a'}ms | sub=${r.subQueries} | gate=${r.gate} | ${r.query.slice(0, 40)}`,
    );
  }
}
console.log('-- total --', stats(rows.map((r) => r.totalMs)));
console.log(`-- total（近 ${sinceDays} 天） --`, stats(recentStatsRows.map((r) => r.totalMs)));
console.log('-- search --', stats(rows.map((r) => r.searchMs)));
console.log(`-- search（近 ${sinceDays} 天） --`, stats(recentStatsRows.map((r) => r.searchMs)));
console.log('-- preSearch --', stats(rows.map((r) => r.preSearchMs)));
console.log(`-- search→synth（近 ${sinceDays} 天） --`, stats(recentStatsRows.map((r) => r.searchToSynthMs ?? 0)));
console.log(
  `-- synthesisMs（近 ${sinceDays} 天，有埋点） --`,
  stats(recentStatsRows.filter((r) => r.synthesisMs !== null).map((r) => r.synthesisMs ?? 0)),
);
console.log(
  `-- contentFetchMs（近 ${sinceDays} 天，有埋点） --`,
  stats(recentStatsRows.filter((r) => r.contentFetchMs !== null).map((r) => r.contentFetchMs ?? 0)),
);
console.log(
  `-- supplementMs（近 ${sinceDays} 天，有埋点） --`,
  stats(recentStatsRows.filter((r) => r.supplementMs !== null).map((r) => r.supplementMs ?? 0)),
);
console.log('-- postSearch --', stats(rows.map((r) => r.postSearchMs)));
console.log(`-- synth→answer（近 ${sinceDays} 天） --`, stats(recentStatsRows.map((r) => r.synthToAnswerMs ?? 0)));

const metrics: MetricLine[] = [];
for (const line of readLines(metricsFile)) {
  if (!line.trim()) continue;
  try {
    const m = JSON.parse(line) as MetricLine;
    if (typeof m.bocha_ms !== 'number' && typeof m.anysearch_ms !== 'number') continue;
    metrics.push(m);
  } catch {
    // 坏行忽略
  }
}
const stageMs = metrics.map((m) => Math.max(m.bocha_ms ?? 0, m.anysearch_ms ?? 0));
const timeoutCount = metrics.filter((m) => m.timeout).length;
const degradedCount = metrics.filter((m) => m.degraded).length;
const cacheHits = metrics.filter((m) => m.cacheEngines !== undefined && m.cacheEngines !== null).length;
const recentMetrics = metrics.filter((m) => m.ts && Date.parse(m.ts) >= sinceMs);
const recentStageMs = recentMetrics.map((m) => Math.max(m.bocha_ms ?? 0, m.anysearch_ms ?? 0));
const recentBocha = recentMetrics.map((m) => m.bocha_ms ?? 0).filter((v) => v > 0);
const recentAny = recentMetrics.map((m) => m.anysearch_ms ?? 0).filter((v) => v > 0);
console.log('\n== search-metrics 分引擎时延 ==');
console.log(`请求数: ${metrics.length}`);
console.log('-- 单次 stage 时长 --', stats(stageMs));
console.log(`timeout=${timeoutCount} degraded=${degradedCount} cacheHit=${cacheHits}`);
console.log(`\n近 ${sinceDays} 天请求数: ${recentMetrics.length}`);
console.log('-- 近 7 天 stage 时长 --', stats(recentStageMs));
console.log('-- 近 7 天 bocha_ms --', stats(recentBocha));
console.log('-- 近 7 天 anysearch_ms --', stats(recentAny));
console.log(`timeout=${recentMetrics.filter((m) => m.timeout).length} degraded=${recentMetrics.filter((m) => m.degraded).length}`);
