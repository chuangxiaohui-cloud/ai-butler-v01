#!/usr/bin/env node
/**
 * v0.2a：从 data/memory.db 导出 31 条基准 query 的最新完整答案，
 * 生成 bench/v02a-scoring-worksheet.md + bench/v02a-scores.example.json。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface QueryItem {
  id: string;
  query: string;
  intent: string;
}

interface ScoreRow {
  id: string;
  query: string;
  engine: string;
  relevance: number;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const queries = (JSON.parse(readFileSync(join(root, 'bench', 'v02a-queries.json'), 'utf-8')) as {
  queries: QueryItem[];
}).queries;

function parseCsv(text: string): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const line of text.trim().split('\n').slice(1)) {
    const parts: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    rows.push({ id: parts[0], query: parts[1], engine: parts[2].toLowerCase(), relevance: +parts[3] });
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

const v01ScoresPath = join(root, 'bench', 'v01-scores.json');
const v01ById = new Map<string, { score: number | null; hardAnswer?: boolean }>();
if (existsSync(v01ScoresPath)) {
  const v01 = (JSON.parse(readFileSync(v01ScoresPath, 'utf-8')) as {
    scores: Array<{ id: string; score: number | null; hardAnswer?: boolean }>;
  }).scores;
  for (const s of v01) v01ById.set(s.id, s);
}

const dbPath = join(root, 'data', 'memory.db');
if (!existsSync(dbPath)) {
  console.error('未找到 data/memory.db，请先运行 npm run bench:v02a');
  process.exit(1);
}
const db = new DatabaseSync(dbPath);
const rows: Array<{ id: string; query: string; intent: string; answer: string; confidence: number }> = [];
for (const q of queries) {
  const row = db
    .prepare('SELECT query, answer, confidence FROM l0_memory WHERE query = ? ORDER BY timestamp DESC LIMIT 1')
    .get(q.query) as { query: string; answer: string; confidence: number } | undefined;
  rows.push({
    id: q.id,
    query: q.query,
    intent: q.intent,
    answer: row?.answer ?? '（无记录，请重新运行 bench）',
    confidence: row?.confidence ?? 0,
  });
}
db.close();

const sections = rows
  .map((r) => {
    const rel = relByQuery.get(r.query) ?? {};
    const v01 = v01ById.get(r.id);
    return `## ${r.id}（${r.intent}）

- query：${r.query}
- confidence：${r.confidence.toFixed(2)}
- 引擎相关性参考：Bocha=${rel.bocha ?? '-'} / AnySearch=${rel.anysearch ?? '-'} / Tavily=${rel.tavily ?? '-'}
- v0.1 复用分：${v01 ? `${v01.score ?? '未填'}（请复核 v0.2a 新答案）` : '无（新评）'}
- 相关性(0-3)：${v01 ? '____（复核后如需调整请改）' : '____'}

${r.answer}
`;
  })
  .join('\n');

const md = `# v0.2a 评分工作表（[P-12]）

> C.2 标尺：0=完全无用 / 1=部分可用 / 2=可用但有缺 / 3=完全满足；相关性=是否切题。
> **判定基准：bench/v02a-scores.json（你的 [P-12] 人工打分）**；引擎相关性参考仅作辅助，不参与判定。
> 判定：31 条中 ≥80%（≥25 条）相关性 ≥2 分，且无 0 分硬答。

${sections}
`;

writeFileSync(join(root, 'bench', 'v02a-scoring-worksheet.md'), md, 'utf-8');
const example = {
  note: '复制为 v02a-scores.json。前 10 条已带入 v0.1 复用分（请复核 v0.2a 新答案），其余 21 条按附录 C.2 新评（0-3 整数）。score=0 时必须确认 hardAnswer=false。',
  scores: rows.map((r) => {
    const v01 = v01ById.get(r.id);
    return v01
      ? { id: r.id, score: v01.score ?? null, hardAnswer: v01.hardAnswer ?? false }
      : { id: r.id, score: null, hardAnswer: false };
  }),
};
writeFileSync(
  join(root, 'bench', 'v02a-scores.example.json'),
  JSON.stringify(example, null, 2),
  'utf-8',
);
console.log('已生成: bench/v02a-scoring-worksheet.md + bench/v02a-scores.example.json');
