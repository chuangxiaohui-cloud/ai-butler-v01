/**
 * 生成打分用种子 route cases（source=seed，可安全覆盖 data/route-cases.jsonl）。
 * 用法：npm run seed:route-cases && npm run route:calibrate
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { routeV2 } from '../src/agent/router-v2.js';
import type { RouteCaseRecord } from '../src/agent/route-case-store.js';

const SEED: Array<{
  query: string;
  feedback: 'reject' | 'correct';
  correctedRoute: { primaryLens: string; intent: string };
}> = [
  {
    query: '帮我检查一下这个PCB的安全性',
    feedback: 'reject',
    correctedRoute: { primaryLens: 'owner', intent: 'risk_review' },
  },
  {
    query: '帮我安排明天上午十点的会议',
    feedback: 'reject',
    correctedRoute: { primaryLens: 'secretary', intent: 'create_calendar' },
  },
  {
    query: '帮我做一次供应商报价对比',
    feedback: 'reject',
    correctedRoute: { primaryLens: 'owner', intent: 'compare_vendor_quotes' },
  },
];

const file = join(process.cwd(), 'data', 'route-cases.jsonl');
mkdirSync(dirname(file), { recursive: true });

const records: RouteCaseRecord[] = SEED.map((seed, index) => ({
  id: `seed-${index + 1}`,
  timestamp: Date.now() + index,
  query: seed.query,
  userId: 'seed-review',
  source: 'seed',
  result: routeV2(seed.query),
  feedback: seed.feedback,
  correctedRoute: seed.correctedRoute,
}));

writeFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf-8');
console.log(`seeded ${records.length} route cases -> ${file}`);
