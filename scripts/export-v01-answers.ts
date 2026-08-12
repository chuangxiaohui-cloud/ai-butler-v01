#!/usr/bin/env node
/**
 * 从 data/memory.db 导出 10 条基准 query 的最新完整答案，
 * 生成 bench/v01-scoring-worksheet.md 供 [P-07] 人工评分。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface V01Query {
  id: string;
  query: string;
}

interface ScoreRow {
  id: string;
  query: string;
  engine: string;
  relevance: number;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const queries = (JSON.parse(readFileSync(join(root, 'bench', 'v01-queries.json'), 'utf-8')) as {
  queries: V01Query[];
}).queries;

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
    rows.push({ id: parts[0], query: parts[1], engine: parts[2], relevance: +parts[3] });
  }
  return rows;
}

const scoreRows = parseCsv(readFileSync(join(root, 'bench', 'raw_scores.csv'), 'utf-8'));
const relByQuery = new Map<string, Record<string, number>>();
for (const s of scoreRows) {
  const entry = relByQuery.get(s.query) ?? {};
  entry[s.engine] = s.relevance;
  relByQuery.set(s.query, entry);
}

const dbPath = join(root, 'data', 'memory.db');
if (!existsSync(dbPath)) {
  console.error('未找到 data/memory.db，请先运行 npm run bench:v01');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const rows: Array<{ id: string; query: string; answer: string; confidence: number }> = [];
for (const q of queries) {
  const row = db
    .prepare(
      'SELECT query, answer, confidence FROM l0_memory WHERE query = ? ORDER BY timestamp DESC LIMIT 1',
    )
    .get(q.query) as { query: string; answer: string; confidence: number } | undefined;
  rows.push({
    id: q.id,
    query: q.query,
    answer: row?.answer ?? '（无记录，请重新运行 bench）',
    confidence: row?.confidence ?? 0,
  });
}
db.close();

const sections = rows
  .map((r) => {
    const rel = relByQuery.get(r.query) ?? {};
    const relText =
      `Bocha=${rel.Bocha ?? '-'} / AnySearch=${rel.AnySearch ?? '-'} / ` +
      `Tavily=${rel.Tavily ?? '-'}`;
    return `## ${r.id}

- query：${r.query}
- confidence：${r.confidence.toFixed(2)}
- 引擎相关性参考（附录 C.3）：${relText}
- 相关性(0-3)：____

${r.answer}
`;
  })
  .join('\n');

const md = `# v0.1 评分工作表（[P-07]）

> C.2 标尺：0=完全无用 / 1=部分可用 / 2=可用但有缺 / 3=完全满足；相关性=是否切题。
> **判定基准：bench/v01-scores.json（你的 [P-07] 人工打分）**；引擎相关性参考仅作辅助，不参与判定。
> 判定：10 条中 ≥8 条相关性 ≥2 分，且无 0 分硬答。评完请将分数填入 bench/v01-scores.json 后运行 npm run score:v01。

${sections}
`;

const outPath = join(root, 'bench', 'v01-scoring-worksheet.md');
writeFileSync(outPath, md, 'utf-8');
console.log(`已生成: ${outPath}`);
