/**
 * 交互式规则审核器：逐条展示候选，a/r/s 打分后写回 scored CSV。
 * 用法：npm run route:review
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { RuleCandidate } from '../src/agent/rule-candidate.js';
import type { RouteCaseRecord } from '../src/agent/route-case-store.js';

const dataDir = join(process.cwd(), 'data');

function readJsonl<T>(file: string): T[] {
  try {
    return readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

const candidates = readJsonl<RuleCandidate>(join(dataDir, 'rule-candidates.jsonl'));
const cases = readJsonl<RouteCaseRecord>(join(dataDir, 'route-cases.jsonl'));

if (candidates.length === 0) {
  console.log('没有待审核候选。先运行 npm run route:calibrate 生成候选。');
  process.exit(0);
}

const rl = createInterface({ input, output });
const rows: Array<{ id: string; score: string; verdict: string; comment: string }> = [];
let quit = false;

for (const candidate of candidates) {
  if (quit) break;
  const source = cases.find((r) => r.id === candidate.sourceCaseId);
  console.log('\n----------------------------------------');
  console.log(`${candidate.id} | ${candidate.query}`);
  console.log(`当前决策：${source?.result.decision.type ?? '-'}（confidence ${(source?.result.confidence ?? 0).toFixed(2)}）`);
  console.log(`建议 match：${JSON.stringify(candidate.match)}`);
  console.log(`建议路由：${candidate.primaryLens}/${candidate.intent}（searchNeed=${candidate.searchNeed}）`);
  console.log(`理由：${candidate.reason}`);

  const answer = (await rl.question('[a]ccept / [r]eject / [s]kip / [q]uit：')).trim().toLowerCase();
  if (answer === 'q') {
    quit = true;
    break;
  }
  let verdict = '';
  if (answer.startsWith('a')) verdict = 'accept';
  else if (answer.startsWith('r')) verdict = 'reject';
  else if (answer.startsWith('s')) verdict = 'skip';
  if (!verdict) {
    console.log('输入无效，按 skip 处理。');
    verdict = 'skip';
  }

  let score = '';
  if (verdict === 'accept') {
    score = (await rl.question('score(1-5)，回车默认 5：')).trim() || '5';
  }
  const comment = (await rl.question('comment（回车跳过）：')).trim();
  rows.push({ id: candidate.id, score, verdict, comment });
}

rl.close();

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csv = [
  ['id', 'score(1-5)', 'verdict', 'comment'].join(','),
  ...rows.map((r) =>
    [csvCell(r.id), csvCell(r.score), csvCell(r.verdict), csvCell(r.comment)].join(','),
  ),
].join('\n');

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'rule-candidates.review.scored.csv'), `${csv}\n`, 'utf-8');
console.log(`\n已写入 data/rule-candidates.review.scored.csv（${rows.length} 条）`);
console.log('下一步：npm run route:import-review');
