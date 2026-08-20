#!/usr/bin/env node
/**
 * low_confidence 复查脚本（E125 之后）
 * 从 bench/devil-v25/results.jsonl 汇总 low_confidence 条目，标记无证据与弱证据。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface BenchEntry {
  row: { id: string; query: string };
  result: {
    answer?: string;
    confidence?: number;
    evidence?: Array<{ score: number; type: string; domain: string; title: string; url: string }>;
    gate_triggered?: string;
  };
  autoScore?: number;
}

const resultsPath = join(process.cwd(), 'bench', 'devil-v25', 'results.jsonl');
const entries = readFileSync(resultsPath, 'utf-8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line) as BenchEntry);

const low = entries.filter((x) => x.result.gate_triggered === 'low_confidence');
const withEvidence = low.filter((x) => (x.result.evidence ?? []).length > 0);
const noEvidence = low.filter((x) => (x.result.evidence ?? []).length === 0);
const minBelow04 = withEvidence.filter((x) =>
  Math.min(...(x.result.evidence ?? []).map((e) => e.score)) < 0.4,
);
const avgBelow05 = withEvidence.filter(
  (x) =>
    (x.result.evidence ?? []).reduce((sum, e) => sum + e.score, 0) /
      (x.result.evidence ?? []).length <
    0.5,
);
const withHard = withEvidence.filter((x) =>
  (x.result.evidence ?? []).some((e) => e.type === '[hard]'),
);

console.log('low_confidence 复查摘要');
console.log('======================');
console.log(`总数=${low.length} 有证据=${withEvidence.length} 无证据=${noEvidence.length}`);
console.log(`含<0.4证据=${minBelow04.length} 平均<0.5=${avgBelow05.length} 含官方源=${withHard.length}`);
console.log(`无证据条目: ${noEvidence.map((x) => x.row.id).join(', ')}`);
console.log(`弱证据条目: ${minBelow04.map((x) => x.row.id).join(', ')}`);
console.log('');

for (const x of low) {
  const ev = x.result.evidence ?? [];
  const scores = ev.map((e) => e.score);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3) : '-';
  const unable = /暂时无法确认|我没把握/.test(x.result.answer ?? '') ? 'Y' : '';
  console.log(
    [
      x.row.id,
      String(x.result.confidence ?? '-'),
      String(ev.length),
      scores.length ? String(Math.min(...scores).toFixed(3)) : '-',
      scores.length ? String(Math.max(...scores).toFixed(3)) : '-',
      avg,
      ev.filter((e) => e.type === '[hard]').length,
      unable,
      String(x.autoScore ?? '-'),
    ].join('\t'),
  );
}
