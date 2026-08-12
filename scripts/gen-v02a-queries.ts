#!/usr/bin/env node
/**
 * v0.2a WP1：从附录 C.3（raw_scores.csv）生成 31 条全量 query 集。
 * 意图标注复用历史基准脚本 results/raw 文件名（如 E01_factual_rep1_anysearch.json）。
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface ScoreRow {
  id: string;
  query: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseCsv(text: string): ScoreRow[] {
  const lines = text.trim().split('\n');
  const rows: ScoreRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    rows.push({ id: parts[0], query: parts[1] });
  }
  return rows;
}

const scoreRows = parseCsv(readFileSync(join(root, 'bench', 'raw_scores.csv'), 'utf-8'));
const ids: string[] = [];
const byId = new Map<string, string>();
for (const row of scoreRows) {
  if (!byId.has(row.id)) {
    byId.set(row.id, row.query);
    ids.push(row.id);
  }
}

const rawDir = join(root, 'Tavily+AnySearch+Bocha', 'results', 'raw');
const intentMap = new Map<string, string>();
if (existsSync(rawDir)) {
  for (const file of readdirSync(rawDir)) {
    const match = file.match(/^([A-Z0-9]+)_([a-z_]+)_rep\d+_/);
    if (match && !intentMap.has(match[1])) intentMap.set(match[1], match[2]);
  }
}

const queries = ids.map((id) => ({
  id,
  query: byId.get(id) ?? '',
  intent: intentMap.get(id) ?? 'factual',
}));

const payload = {
  meta: {
    version: 'v0.2a',
    created_at: '2026-08-12',
    source: '附录 C.3（bench/raw_scores.csv）+ 历史基准脚本意图标注',
    count: queries.length,
  },
  queries,
};

const outPath = join(root, 'bench', 'v02a-queries.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
const byIntent = new Map<string, number>();
for (const q of queries) byIntent.set(q.intent, (byIntent.get(q.intent) ?? 0) + 1);
console.log(`已生成: ${outPath}`);
console.log(`条数: ${queries.length}`);
console.log(
  `意图分布: ${[...byIntent.entries()].map(([k, v]) => `${k}=${v}`).join('，')}`,
);
