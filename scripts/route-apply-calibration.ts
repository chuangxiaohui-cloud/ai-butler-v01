/**
 * 阈值应用脚本：样本达标时生成可回写 PARAM 的校准提案。
 * 用法：npm run route:apply-calibration
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { RouteCaseStore } from '../src/agent/route-case-store.js';
import { applyCalibration } from '../src/agent/apply-calibration.js';

const dataDir = join(process.cwd(), 'data');
const store = new RouteCaseStore(join(dataDir, 'route-cases.jsonl'));
const result = applyCalibration(store.list());

if (result.ok) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, 'calibration-proposal.json'),
    `${JSON.stringify({ values: result.values, suggestion: result.suggestion }, null, 2)}\n`,
    'utf-8',
  );
}

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      reason: result.reason,
      values: result.values,
      suggestion: result.suggestion,
      proposalFile: result.ok ? 'data/calibration-proposal.json' : null,
    },
    null,
    2,
  ),
);
