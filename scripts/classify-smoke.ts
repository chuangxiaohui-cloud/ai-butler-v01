#!/usr/bin/env node
/**
 * WP3 冒烟验收：10 条基准 query 真实调用轻模型分类
 *
 * 用法:
 *   npx tsx classify-smoke.ts
 *
 * 环境:
 *   LLM_CLASSIFY_TIMEOUT_MS  单次超时，默认 2000ms（遵循 [P-04]；网络波动可临时调大）
 */
import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { createLightClient } from '../src/search/llm.js';
import { classifyQuery } from '../src/search/stages/s2_classify.js';

interface V01Query {
  id: string;
  query: string;
  intent: string;
  rule3?: boolean;
}

const queriesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bench',
  'v01-queries.json',
);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const metricsPath = join(root, 'bench', 'classify-metrics.jsonl');
const queries = (JSON.parse(readFileSync(queriesPath, 'utf-8')) as { queries: V01Query[] })
  .queries;

async function main(): Promise<void> {
  const llm = createLightClient();
  const rounds = Number(process.argv.find((a) => a.startsWith('--rounds='))?.split('=')[1] ?? '1');
  console.log(`WP3 冒烟：${queries.length} 条基准 query，轻模型=${process.env.LLM_LIGHT_MODEL ?? 'deepseek-chat'}`);
  console.log(`超时=${process.env.LLM_CLASSIFY_TIMEOUT_MS ?? '2000'}ms，rounds=${rounds}\n`);

  let correct = 0;
  const rows: string[] = [];
  const latencies: number[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    if (rounds > 1) console.log(`--- round ${round}/${rounds} ---`);
    for (const item of queries) {
      const start = Date.now();
      const r = await classifyQuery(item.query, llm);
      const latencyMs = Date.now() - start;
      latencies.push(latencyMs);
      const expected = item.intent;
      const ok = r.intent === expected;
      if (ok) correct += 1;
      rows.push(
        `${ok ? '✅' : '❌'} ${item.id} 期望=${expected} 实际=${r.intent} (${r.source}) ${latencyMs}ms`,
      );
      try {
        mkdirSync(dirname(metricsPath), { recursive: true });
        appendFileSync(
          metricsPath,
          `${JSON.stringify({
            ts: new Date().toISOString(),
            id: item.id,
            query: item.query,
            expected,
            intent: r.intent,
            source: r.source,
            timedOut: r.timedOut ?? false,
            latencyMs,
          })}\n`,
          'utf-8',
        );
      } catch {
        // 分类时延日志失败不阻塞冒烟
      }
    }
  }
  console.log(rows.join('\n'));
  const sorted = [...latencies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(
    `耗时: min=${sorted[0]}ms median=${median}ms max=${sorted[sorted.length - 1]}ms`,
  );
  const totalQueries = queries.length * rounds;
  const rate = correct / totalQueries;
  console.log(`\n准确率: ${correct}/${totalQueries} = ${Math.round(rate * 100)}%`);
  console.log(`验收线: ≥80%（WP3）`);
  process.exitCode = rate >= 0.8 ? 0 : 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
