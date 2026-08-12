#!/usr/bin/env node
/**
 * v0.1 验收脚本（WP11）
 * 读取 bench/v01-queries.json，逐条调用 pipeline，生成 bench/v01-report.md。
 * [P-07] 相关性评分由老张按附录 C.2 人工复核后回填。
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { AnswerResult } from '../src/search/pipeline.js';
import { pipeline } from '../src/search/pipeline.js';
import { readSearchMetrics } from '../src/search/metrics.js';

interface V01Query {
  id: string;
  query: string;
  intent: string;
  verify?: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const queriesPath = join(root, 'bench', 'v01-queries.json');
const reportPath = join(root, 'bench', 'v01-report.md');
const queries = (JSON.parse(readFileSync(queriesPath, 'utf-8')) as { queries: V01Query[] })
  .queries;

async function main(): Promise<void> {
  console.log(`WP11 验收：${queries.length} 条基准 query 全量跑管道\n`);
  const metricsStart = readSearchMetrics().length;
  const results: AnswerResult[] = [];
  for (const item of queries) {
    const r = await pipeline(item.query);
    results.push(r);
    console.log(
      `${item.id} gate=${r.gate_triggered} conf=${r.confidence.toFixed(2)} ` +
        `evidence=${r.evidence.length} elapsed=${r.elapsed_ms}ms`,
    );
  }

  const gates = new Map<string, number>();
  for (const r of results) {
    gates.set(r.gate_triggered, (gates.get(r.gate_triggered) ?? 0) + 1);
  }
  const confidenceSorted = [...results.map((r) => r.confidence)].sort((a, b) => a - b);
  const median = confidenceSorted[Math.floor(confidenceSorted.length / 2)];
  const runMetrics = readSearchMetrics().slice(metricsStart);

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
  }

  const latencyRows = (['bocha', 'anysearch'] as const)
    .map((provider) => {
      const samples = runMetrics
        .filter((m) => (provider === 'bocha' ? m.bocha_ok : m.anysearch_ok))
        .map((m) => (provider === 'bocha' ? m.bocha_ms : m.anysearch_ms))
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      if (samples.length === 0) return `| ${provider} | 0 | - | - | - | - |`;
      return `| ${provider} | ${samples.length} | ${samples[0]} | ${
        samples[Math.floor(samples.length / 2)]
      } | ${samples[samples.length - 1]} | ${percentile(samples, 0.95)} |`;
    })
    .join('\n');

  const rows = results
    .map((r, i) => {
      const item = queries[i];
      const evidence = r.evidence
        .slice(0, 3)
        .map((e) => `[${e.type}] ${e.title} (${e.url})`)
        .join('；');
      return [
        `| ${item.id} | ${item.query} | ${r.gate_triggered} | ${r.confidence.toFixed(2)} | ${r.evidence.length} |  | ${r.answer.slice(0, 120)} |`,
      ].join('\n');
    })
    .join('\n');

  const report = `# v0.1 验收报告

> 日期：2026-08-12 | bench:B-20260812-02 | 数据源：bench/v01-queries.json
> [P-07] 判定：10 条中 ≥8 条相关性 ≥2 分且无 0 分硬答；相关性由老张按附录 C.2 评分细则人工复核后回填。

## 聚合

| 项 | 值 |
|---|---|
| 总条数 | ${results.length} |
| gate 分布 | ${[...gates.entries()].map(([k, v]) => `${k}=${v}`).join('，')} |
| confidence 中位数 | ${median.toFixed(2)} |
| 总证据条数 | ${results.reduce((s, r) => s + r.evidence.length, 0)} |
| 平均耗时 | ${Math.round(results.reduce((s, r) => s + r.elapsed_ms, 0) / results.length)}ms |

## 分引擎时延（本次运行）

| 引擎 | 样本 | min(ms) | median(ms) | max(ms) | p95(ms) |
|------|------|---------|------------|---------|---------|
${latencyRows}

## 逐条

| ID | Query | gate | confidence | evidence | 相关性(0-3, 人工) | answer 摘要 |
|---|-------|------|------------|----------|-------------------|-------------|
${rows}

## 遗留问题

- [ ] 人工回填相关性评分后做 [P-07] 最终判定。
- [ ] 低置信/严肃通道条目确认无 0 分硬答（E16 诚实边界）。
- [ ] WP11 bench 冷调用累积 n≥30 次后按附录 A 复验门推进 P-04 定稿。
`;

  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n报告已生成: ${reportPath}`);
  console.log(`[P-07] 自动判定待人工评分；无 0 分硬答需人工复核 low_confidence 条目。`);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
