#!/usr/bin/env node
/**
 * [P-12] 评分判定（v0.2a WP6 收尾）
 * 读取 bench/v02a-scores.json：31 条中 ≥25 条相关性 ≥2 分，且无 0 分硬答。
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';

interface ScoreEntry {
  id: string;
  score: number | null;
  hardAnswer?: boolean;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scoresArg = process.argv[2];
const scoresPath = scoresArg
  ? isAbsolute(scoresArg)
    ? scoresArg
    : join(process.cwd(), scoresArg)
  : join(root, 'bench', 'v02a-scores.json');
const queriesPath = join(root, 'bench', 'v02a-queries.json');

function main(): void {
  if (!existsSync(scoresPath)) {
    console.error('缺少 bench/v02a-scores.json；请复制 bench/v02a-scores.example.json 并回填评分。');
    process.exit(1);
  }
  const scores = (JSON.parse(readFileSync(scoresPath, 'utf-8')) as { scores: ScoreEntry[] }).scores;
  const expectedIds = (
    JSON.parse(readFileSync(queriesPath, 'utf-8')) as { queries: Array<{ id: string }> }
  ).queries.map((q) => q.id);
  const byId = new Map(scores.map((s) => [s.id, s]));
  const missing = expectedIds.filter((id) => !byId.has(id));
  const unfilled = scores.filter(
    (s) => typeof s.score !== 'number' || !Number.isInteger(s.score) || s.score < 0 || s.score > 3,
  );
  if (missing.length > 0 || unfilled.length > 0) {
    console.error(
      `评分不完整：缺失 ${missing.join(',') || '无'}，未填/非法 ${unfilled.map((s) => s.id).join(',') || '无'}。`,
    );
    process.exit(1);
  }

  const qualified = scores.filter((s) => (s.score as number) >= 2).length;
  const zeroHard = scores.filter((s) => s.score === 0 && s.hardAnswer !== false);
  console.log(`已回填 ${scores.length}/${expectedIds.length} 条`);
  console.log(`相关性 ≥2 分：${qualified}/31`);
  console.log(`0 分硬答：${zeroHard.length} 条${zeroHard.length ? `（${zeroHard.map((s) => s.id).join(',')}）` : ''}`);

  const pass = qualified >= 25 && zeroHard.length === 0;
  console.log(pass ? '\n[P-12] 通过' : '\n[P-12] 未通过，请复核评分');
  process.exitCode = pass ? 0 : 1;
}

main();
