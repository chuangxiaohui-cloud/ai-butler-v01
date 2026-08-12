#!/usr/bin/env node
/**
 * v0.2a WP6 验收脚本
 * 读取 bench/v02a-queries.json，逐条跑三引擎管道（Tavily 条件并联），
 * 生成 bench/v02a-report.md。[P-12] 相关性评分由人工按 C.2 回填。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { AnswerResult } from '../src/search/pipeline.js';
import { pipeline } from '../src/search/pipeline.js';
import { readSearchMetrics } from '../src/search/metrics.js';

interface V02aQuery {
  id: string;
  query: string;
  intent: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const queriesPath = join(root, 'bench', 'v02a-queries.json');
const reportPath = join(root, 'bench', 'v02a-report.md');
const queries = (JSON.parse(readFileSync(queriesPath, 'utf-8')) as { queries: V02aQuery[] })
  .queries;

async function main(): Promise<void> {
  console.log(`WP6 验收：${queries.length} 条基准 query 三引擎全量跑管道\n`);
  const metricsStart = readSearchMetrics().length;
  const results: AnswerResult[] = [];
  for (const item of queries) {
    const r = await pipeline(item.query, { tavily: { enabled: true } });
    results.push(r);
    console.log(
      `${item.id} intent=${item.intent} gate=${r.gate_triggered} conf=${r.confidence.toFixed(2)} ` +
        `evidence=${r.evidence.length} elapsed=${r.elapsed_ms}ms`,
    );
  }

  const gates = new Map<string, number>();
  for (const r of results) gates.set(r.gate_triggered, (gates.get(r.gate_triggered) ?? 0) + 1);
  const confSorted = [...results.map((r) => r.confidence)].sort((a, b) => a - b);
  const median = confSorted[Math.floor(confSorted.length / 2)];

  const runMetrics = readSearchMetrics().slice(metricsStart);
  const latencyRows = (['bocha', 'anysearch', 'tavily'] as const)
    .map((provider) => {
      const samples = runMetrics
        .filter((m) => (provider === 'bocha' ? m.bocha_ok : provider === 'anysearch' ? m.anysearch_ok : false))
        .map((m) => (provider === 'bocha' ? m.bocha_ms : m.anysearch_ms))
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      if (samples.length === 0) return `| ${provider} | 0 | - | - | - | - |`;
      const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
      return `| ${provider} | ${samples.length} | ${samples[0]} | ${
        samples[Math.floor(samples.length / 2)]
      } | ${samples[samples.length - 1]} | ${p95} |`;
    })
    .join('\n');

  const rows = results
    .map((r, i) => {
      const item = queries[i];
      return `| ${item.id} | ${item.intent} | ${item.query} | ${r.gate_triggered} | ${r.confidence.toFixed(2)} | ${r.evidence.length} |  | ${r.answer.slice(0, 100)} |`;
    })
    .join('\n');

  let verdict = '待人工评分';
  const scoresPath = join(root, 'bench', 'v02a-scores.json');
  if (existsSync(scoresPath)) {
    const scores = (JSON.parse(readFileSync(scoresPath, 'utf-8')) as {
      scores: Array<{ id: string; score: number; hardAnswer?: boolean }>;
    }).scores;
    const qualified = scores.filter((s) => s.score >= 2).length;
    const zeroHard = scores.filter((s) => s.score === 0 && s.hardAnswer !== false).length;
    verdict =
      qualified >= 25 && zeroHard === 0
        ? `[P-12] 通过（${qualified}/31 ≥2，0 硬答）`
        : `[P-12] 未通过（≥2=${qualified}/31，硬答=${zeroHard}）`;
  }

  const report = `# v0.2a 验收报告（31 条全量）

> 日期：2026-08-12 | 数据源：bench/v02a-queries.json
> [P-12] 判定：31 条中 ≥80% 相关性达标且无 0 分硬答；相关性按 C.2 由人工回填。
> **判定结果：${verdict}**

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

| ID | intent | query | gate | confidence | evidence | 相关性(0-3, 人工) | answer 摘要 |
|---|--------|-------|------|------------|----------|-------------------|-------------|
${rows}

## 遗留问题

- [ ] 人工回填 31 条相关性评分后做 [P-12] 判定。
- [ ] 规则② [P-16]/[P-17] 维持 provisional（修订校准报告见 bench/v02a-rule2-calibration.md）。
- [x] E1 复验门首轮：n=30，2000ms 超时率 0%、准确率 80%，未触发重开（详见 bench/v02b-report.md）。
- [x] E2 复验门首轮：n=62，AnySearch 8.1%、Bocha 0%，未触发重开（详见 bench/v02b-report.md）。
`;

  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n报告已生成: ${reportPath}`);
  console.log('[P-12] 相关性评分待人工回填。');
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
