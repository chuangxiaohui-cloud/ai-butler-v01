/**
 * 路由校准脚本：读取 route-cases.jsonl，给出阈值建议并生成规则候选。
 * 用法：npm run route:calibrate
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { RouteCaseStore } from '../src/agent/route-case-store.js';
import { calibrateThresholds } from '../src/agent/confidence-calibration.js';
import { generateRuleCandidates } from '../src/agent/rule-candidate.js';
import { proposeRuleWithLLM } from '../src/agent/llm-rule-proposer.js';
import { createHeavyClient } from '../src/search/llm.js';
import type { RuleCandidate } from '../src/agent/rule-candidate.js';

const dataDir = join(process.cwd(), 'data');
const store = new RouteCaseStore(join(dataDir, 'route-cases.jsonl'));
const records = store.list();
const stats = store.stats();
const calibration = calibrateThresholds(records);
const useLlm = process.argv.includes('--llm');

async function buildCandidates(): Promise<RuleCandidate[]> {
  if (!useLlm) return generateRuleCandidates(records);
  let llm;
  try {
    llm = createHeavyClient();
  } catch {
    llm = undefined;
  }
  if (!llm) return generateRuleCandidates(records);

  const out: RuleCandidate[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (record.feedback !== 'reject' && record.feedback !== 'correct') continue;
    if (!record.correctedRoute) continue;
    const candidate = await proposeRuleWithLLM(record, llm);
    if (!candidate) continue;
    const key = `${candidate.primaryLens}|${candidate.intent}|${JSON.stringify(candidate.match)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

const candidates = await buildCandidates();

if (candidates.length > 0) {
  mkdirSync(dataDir, { recursive: true });
  const candidateFile = join(dataDir, 'rule-candidates.jsonl');
  writeFileSync(
    candidateFile,
    `${candidates.map((c) => JSON.stringify(c)).join('\n')}\n`,
    'utf-8',
  );

  const csvHeaders = [
    'id',
    'source_case_id',
    'query',
    'match',
    'route',
    'current_decision',
    'confidence',
    'score(1-5)',
    'verdict(accept/reject/skip)',
    'comment',
  ];
  const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csvRows = candidates.map((c) => {
    const source = records.find((r) => r.id === c.sourceCaseId);
    return [
      csvCell(c.id),
      csvCell(c.sourceCaseId),
      csvCell(c.query),
      csvCell(JSON.stringify(c.match)),
      csvCell(`${c.primaryLens}/${c.intent}`),
      csvCell(source?.result.decision.type ?? ''),
      csvCell((source?.result.confidence ?? 0).toFixed(2)),
      csvCell(''),
      csvCell(''),
      csvCell(''),
    ].join(',');
  });
  writeFileSync(
    join(dataDir, 'rule-candidates.review.csv'),
    `${csvHeaders.join(',')}\n${csvRows.join('\n')}\n`,
    'utf-8',
  );
}

console.log(
  JSON.stringify(
    {
      cases: stats,
      mode: useLlm ? 'llm' : 'deterministic',
      calibration,
      proposedRules: candidates.map((c) => ({
        id: c.id,
        sourceCaseId: c.sourceCaseId,
        match: c.match,
        route: `${c.primaryLens}/${c.intent}`,
      })),
    },
    null,
    2,
  ),
);
