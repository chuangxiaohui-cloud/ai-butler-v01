/**
 * 从 rule-accepted.json 生成可粘贴的路由表补丁。
 * 用法：npm run route:apply-rules
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { ROUTING_TABLE } from '../src/agent/routing-table.js';
import type { RuleCandidate } from '../src/agent/rule-candidate.js';

const dataDir = join(process.cwd(), 'data');

function loadAccepted(): RuleCandidate[] {
  try {
    return JSON.parse(readFileSync(join(dataDir, 'rule-accepted.json'), 'utf-8')) as RuleCandidate[];
  } catch {
    return [];
  }
}

const accepted = loadAccepted();
if (accepted.length === 0) {
  console.log('没有已接受规则。先跑 npm run route:import-review 生成 rule-accepted.json。');
  process.exit(0);
}

function coveredByExisting(candidate: RuleCandidate): boolean {
  return ROUTING_TABLE.some(
    (rule) =>
      rule.primaryLens === candidate.primaryLens &&
      rule.intent === candidate.intent &&
      Object.keys(rule.match).every(
        (key) => rule.match[key as keyof typeof rule.match] === candidate.match[key as keyof typeof candidate.match],
      ),
  );
}

const pending = accepted.filter((candidate) => !coveredByExisting(candidate));
const skipped = accepted.length - pending.length;
if (pending.length === 0) {
  console.log(`全部 ${accepted.length} 条已被现有规则覆盖（跳过 ${skipped} 条），无需生成补丁。`);
  process.exit(0);
}

const numericIds = ROUTING_TABLE.map((r) => /^R(\d+)$/.exec(r.id)?.[1]).filter(
  (x): x is string => Boolean(x),
);
let nextId = Math.max(0, ...numericIds.map(Number));

const patches = pending.map((candidate) => {
  nextId += 1;
  const id = `R${nextId}`;
  const matchText = JSON.stringify(candidate.match, null, 2).replace(/"([A-Za-z_]+)":/g, '$1:');
  return `{
  id: '${id}',
  match: ${matchText},
  primaryLens: '${candidate.primaryLens}',
  intent: '${candidate.intent}',
  tags: [],
  searchNeed: ${candidate.searchNeed},
  confidenceBoost: ${candidate.confidenceBoost},
}`;
});

const output = `/**
 * 路由表补丁（由 rule-accepted.json 生成，需人工确认后写入 routing-table.ts）
 * 生成时间：${new Date().toISOString()}
 */

${patches.join('\n\n')}
`;

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'routing-patch.ts'), `${output}\n`, 'utf-8');
console.log(output);
console.log(`\n已写入 data/routing-patch.ts（${patches.length} 条，跳过已覆盖 ${skipped} 条）`);
