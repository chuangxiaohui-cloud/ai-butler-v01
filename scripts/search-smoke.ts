#!/usr/bin/env node
/**
 * WP4 冒烟验收：10 条基准 query 真实调用 Bocha + AnySearch
 *
 * 用法:
 *   npx tsx search-smoke.ts
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { runSearchStage } from '../src/search/stages/s3_search.js';
import type { IntentKey } from '../src/search/stages/s2_classify.js';

interface V01Query {
  id: string;
  query: string;
  intent: IntentKey;
}

const queriesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bench',
  'v01-queries.json',
);
const queries = (JSON.parse(readFileSync(queriesPath, 'utf-8')) as { queries: V01Query[] })
  .queries;

async function main(): Promise<void> {
  console.log(`WP4 冒烟：${queries.length} 条基准 query，Bocha + AnySearch 并行\n`);

  let bothOk = 0;
  const rows: string[] = [];
  for (const item of queries) {
    const r = await runSearchStage(item.query, {
      intent: item.intent,
      cacheKey: `smoke:${item.id}`,
    });
    const bocha = r.attempts.find((a) => a.provider === 'bocha');
    const any = r.attempts.find((a) => a.provider === 'anysearch');
    const both = bocha?.ok === true && any?.ok === true;
    if (both) bothOk += 1;
    rows.push(
      `${both ? '✅' : '❌'} ${item.id} 结果=${r.results.length}` +
        ` bocha=${bocha?.ok ? 'ok' : bocha?.quotaSkipped ? 'quota' : 'fail'}(${bocha?.latencyMs ?? '-'}ms)` +
        ` any=${any?.ok ? 'ok' : any?.quotaSkipped ? 'quota' : 'fail'}(${any?.latencyMs ?? '-'}ms)` +
        `${r.cacheHit ? ' [cache]' : ''}${r.degraded ? ' [degraded]' : ''}`,
    );
  }
  console.log(rows.join('\n'));
  console.log(`\n双引擎均返回: ${bothOk}/${queries.length}`);
  console.log('验收线: 10 条双引擎均返回结果（WP4）');
  process.exitCode = bothOk === queries.length ? 0 : 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
