/**
 * 导入打分 CSV，汇总 accept/reject/skip，输出路由表补丁与阈值确认单。
 * 用法：npm run route:import-review
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { ROUTING_TABLE } from '../src/agent/routing-table.js';
import { calibrateThresholds } from '../src/agent/confidence-calibration.js';
import { RouteCaseStore } from '../src/agent/route-case-store.js';
import type { RuleCandidate } from '../src/agent/rule-candidate.js';

const dataDir = join(process.cwd(), 'data');

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(current);
      current = '';
    } else if (ch === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else if (ch !== '\r') {
      current += ch;
    }
  }
  if (current !== '' || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

function loadCandidates(): RuleCandidate[] {
  const file = join(dataDir, 'rule-candidates.jsonl');
  return readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as RuleCandidate);
}

const scoredCsv = process.argv[2] ?? join(dataDir, 'rule-candidates.review.scored.csv');
const rows = parseCsv(readFileSync(scoredCsv, 'utf-8'));
const header = rows[0].map((h) => h.trim());
const idIndex = header.indexOf('id');
const scoreIndex = header.findIndex((h) => h.startsWith('score'));
const verdictIndex = header.findIndex((h) => h.startsWith('verdict'));
const commentIndex = header.indexOf('comment');

const reviews = rows.slice(1).map((row) => ({
  id: row[idIndex]?.trim() ?? '',
  score: Number(row[scoreIndex]),
  verdict: (row[verdictIndex]?.trim() ?? '').toLowerCase(),
  comment: row[commentIndex]?.trim() ?? '',
}));

const candidates = loadCandidates();
const byId = new Map(candidates.map((c) => [c.id, c]));
const accepted: Array<{ candidate: RuleCandidate; review: (typeof reviews)[number] }> = [];
const rejected: typeof reviews = [];
const skipped: typeof reviews = [];

for (const review of reviews) {
  const candidate = byId.get(review.id);
  if (!candidate) continue;
  if (review.verdict === 'accept') accepted.push({ candidate, review });
  else if (review.verdict === 'reject') rejected.push(review);
  else if (review.verdict === 'skip') skipped.push(review);
}

const caseStore = new RouteCaseStore(join(dataDir, 'route-cases.jsonl'));
const caseRecords = caseStore.list();

// 把评审结论回写到 route-cases，供阈值校准与经验闭环使用
for (const { candidate } of accepted) {
  if (candidate.sourceCaseId) caseStore.recordFeedback(candidate.sourceCaseId, 'accept');
}
for (const review of rejected) {
  const candidate = byId.get(review.id);
  if (candidate?.sourceCaseId) caseStore.recordFeedback(candidate.sourceCaseId, 'reject');
}

const confidenceByCandidate = new Map(
  candidates.map((c) => [
    c.id,
    caseRecords.find((r) => r.id === c.sourceCaseId)?.result.confidence ?? 0,
  ]),
);
const calibrationRecords = reviews
  .filter((r) => r.verdict === 'accept' || r.verdict === 'reject')
  .map((r) => ({
    id: r.id,
    result: { confidence: confidenceByCandidate.get(r.id) ?? 0 },
    feedback: r.verdict as 'accept' | 'reject',
  }));
const calibration = calibrateThresholds(calibrationRecords as never);

const numericIds = ROUTING_TABLE.map((r) => /^R(\d+)$/.exec(r.id)?.[1]).filter(
  (x): x is string => Boolean(x),
);
const nextId = `R${Math.max(0, ...numericIds.map(Number)) + 1}`;

const acceptedBlocks = accepted.map(({ candidate, review }) => {
  const patch = `{
  id: '${nextId}',
  match: ${JSON.stringify(candidate.match, null, 2).replace(/"([A-Za-z_]+)":/g, '$1:')},
  primaryLens: '${candidate.primaryLens}',
  intent: '${candidate.intent}',
  tags: [],
  searchNeed: ${candidate.searchNeed},
  confidenceBoost: ${candidate.confidenceBoost},
}`;
  return {
    id: nextId,
    candidate,
    review,
    patch,
  };
});

const lines = [
  '# 规则审核结果',
  '',
  `- accept ${accepted.length} / reject ${rejected.length} / skip ${skipped.length}`,
  '',
  '## 接受（可入库）',
  '',
];
for (const block of acceptedBlocks) {
  lines.push(
    `### ${block.id}：${block.candidate.primaryLens}/${block.candidate.intent}`,
    '',
    `- 来源 case：${block.candidate.sourceCaseId}（${block.candidate.query}）`,
    `- match：\`${JSON.stringify(block.candidate.match)}\``,
    `- 你的备注：${block.review.comment || '无'}`,
    '',
    '```ts',
    block.patch,
    '```',
    '',
  );
}
if (accepted.length === 0) lines.push('（本次没有接受项）', '');

lines.push('## 拒绝', '');
for (const review of rejected) {
  lines.push(`- ${review.id}（score ${review.score}）：${review.comment || '无'}`);
}
lines.push('', '## 跳过', '');
for (const review of skipped) {
  lines.push(`- ${review.id}（score ${review.score}）：${review.comment || '无'}`);
}
lines.push(
  '',
  '## 阈值建议',
  '',
  `- routeConfidenceLow：${calibration.suggestedLow.toFixed(2)}`,
  `- routeConfidenceHigh：${calibration.suggestedHigh.toFixed(2)}`,
  `- 说明：${calibration.note}`,
  '',
);

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'rule-review-summary.md'), lines.join('\n'), 'utf-8');
writeFileSync(
  join(dataDir, 'rule-accepted.json'),
  `${JSON.stringify(acceptedBlocks.map((b) => b.candidate), null, 2)}\n`,
  'utf-8',
);

console.log(
  JSON.stringify(
    {
      summary: { accept: accepted.length, reject: rejected.length, skip: skipped.length },
      nextRuleId: accepted.length > 0 ? nextId : null,
      calibration,
      files: {
        summary: 'data/rule-review-summary.md',
        accepted: 'data/rule-accepted.json',
      },
    },
    null,
    2,
  ),
);
