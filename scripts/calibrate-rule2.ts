#!/usr/bin/env node
/**
 * v0.2a WP2：规则② 置信度阈值测算（§6.6）
 * 用历史基准 465 个 raw JSON（31×5×3）跑 v0.1 融合分，
 * 与 93 条人工打分对照，输出分领域阈值建议。
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { fuseResults } from '../src/search/fusion.js';
import type { FusionItem } from '../src/search/fusion.js';
import type { SearchResultItem } from '../src/search/providers/types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'Tavily+AnySearch+Bocha', 'results', 'raw');

interface LabelRow {
  id: string;
  query: string;
  byEngine: Map<string, number>;
}

function parseCsv(text: string): LabelRow[] {
  const byId = new Map<string, LabelRow>();
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
    const row = byId.get(parts[0]) ?? { id: parts[0], query: parts[1], byEngine: new Map() };
    row.byEngine.set(parts[2].toLowerCase(), +parts[3]);
    byId.set(parts[0], row);
  }
  return [...byId.values()];
}

function extractResults(data: unknown): Array<{ title: string; url: string; content: string }> {
  const d = (data as { data?: unknown })?.data ?? data;
  const webPages = (d as { webPages?: { value?: unknown[] }; data?: { webPages?: { value?: unknown[] } } })
    ?.webPages?.value ?? (d as { data?: { webPages?: { value?: unknown[] } } })?.data?.webPages?.value;
  const results = (d as { results?: unknown[] })?.results ?? (d as { data?: { results?: unknown[] } })?.data?.results;
  const arr = webPages ?? results ?? [];
  return arr.map((r) => {
    const obj = r as { title?: string; name?: string; url?: string; snippet?: string; summary?: string; content?: string };
    return {
      title: obj.title ?? obj.name ?? '',
      url: obj.url ?? '',
      content: (obj.summary ?? obj.snippet ?? obj.content ?? '').slice(0, 300),
    };
  });
}

const labels = parseCsv(readFileSync(join(root, 'bench', 'raw_scores.csv'), 'utf-8'));
const labelById = new Map(labels.map((l) => [l.id, l]));
const intentById = new Map<string, string>();
const queryById = new Map<string, string>();
for (const l of labels) {
  queryById.set(l.id, l.query);
  intentById.set(l.id, 'factual');
}

const files = readdirSync(rawDir).filter((f) => f.endsWith('.json'));
const groups = new Map<string, Array<{ intent: string; items: SearchResultItem[] }>>();
for (const file of files) {
  const match = file.match(/^([A-Z0-9]+)_([a-z_]+)_rep\d+_(\w+)\.json$/);
  if (!match) continue;
  const id = match[1];
  const intent = match[2];
  const key = `${id}_${match[2]}_${match[3]}`;
  intentById.set(id, intent);
  queryById.set(id, labelById.get(id)?.query ?? id);
  const data = JSON.parse(readFileSync(join(rawDir, file), 'utf-8'));
  const items = extractResults(data).map((r) => ({
    ...r,
    provider: match[3] as SearchResultItem['provider'],
  }));
  const reps = groups.get(key) ?? [];
  reps.push({ intent, items });
  groups.set(key, reps);
}

const samples: Array<{
  id: string;
  query: string;
  group: string;
  intent: string;
  engine: string;
  label: number;
  positive: boolean;
  topScore: number;
  bestScore: number;
  topResult: FusionItem | null;
}> = [];
for (const [id, label] of labelById) {
  const intent = intentById.get(id) ?? 'factual';
  const query = label.query;
  const group = id.startsWith('S') ? '严肃' : id.startsWith('L') ? '生活' : id.startsWith('X') ? '黑话' : '工程';
  for (const engine of ['bocha', 'anysearch', 'tavily']) {
    const reps = groups.get(`${id}_${intent}_${engine}`) ?? [];
    if (reps.length === 0) continue;
    const repResults = reps.map((g) => {
      const fused = fuseResults(query, g.items, g.intent as never);
      return { score: fused.items[0]?.finalScore ?? 0, item: fused.items[0] ?? null };
    });
    const sorted = [...repResults].sort((a, b) => a.score - b.score);
    const rel = label.byEngine.get(engine) ?? 0;
    samples.push({
      id,
      query,
      group,
      intent,
      engine,
      label: rel,
      positive: rel >= 2,
      topScore: sorted[Math.floor(sorted.length / 2)]?.score ?? 0,
      bestScore: sorted[sorted.length - 1]?.score ?? 0,
      topResult: sorted[Math.floor(sorted.length / 2)]?.item ?? null,
    });
  }
}

function summarize(rows: Sample[]): { n: number; min: number; median: number; max: number; p90: number } {
  const scores = rows.map((r) => r.topScore).sort((a, b) => a - b);
  const best = rows.map((r) => r.bestScore).sort((a, b) => a - b);
  if (scores.length === 0) return { n: 0, min: 0, median: 0, max: 0, p90: 0, bestMedian: 0, bestMax: 0 };
  const p = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  return {
    n: scores.length,
    min: scores[0],
    median: p(scores, 0.5),
    max: scores[scores.length - 1],
    p90: p(scores, 0.9),
    bestMedian: p(best, 0.5),
    bestMax: p(best, best.length - 1),
  };
}

console.log('规则②校准（历史 31×5 raw + 93 人工分）\n');
for (const group of ['工程', '生活', '严肃', '黑话', '全部']) {
  const rows = group === '全部' ? samples : samples.filter((s) => s.group === group);
  const pos = rows.filter((r) => r.positive);
  const neg = rows.filter((r) => !r.positive);
  console.log(`[${group}] 样本 ${rows.length}（正例 ${pos.length} / 负例 ${neg.length}）`);
  console.log(`  正例 topScore: ${JSON.stringify(summarize(pos))}`);
  console.log(`  负例 topScore: ${JSON.stringify(summarize(neg))}`);
  for (const threshold of [0.4, 0.5, 0.6, 0.7]) {
    const tp = pos.filter((r) => r.topScore >= threshold).length;
    const tn = neg.filter((r) => r.topScore < threshold).length;
    console.log(`  阈值 ${threshold}: 正例保留 ${tp}/${pos.length}，负例拦截 ${tn}/${neg.length}`);
  }
}

if (process.argv.includes('--debug')) {
  const risky = samples
    .filter((s) => !s.positive && s.topScore >= 0.6)
    .sort((a, b) => b.topScore - a.topScore);
  console.log(`\n负例 topScore≥0.6：${risky.length} 条`);
  for (const s of risky) {
    const r = s.topResult;
    console.log(`  ${s.id}/${s.engine} rel=${s.label} top=${s.topScore.toFixed(3)} best=${s.bestScore.toFixed(3)} ${s.query}`);
    if (r) {
      console.log(
        `    title=${r.result.title.slice(0, 60)} | rel=${r.relevance.toFixed(2)} time=${r.timeliness.toFixed(2)} use=${r.usability.toFixed(2)} fact=${r.factConsistency.toFixed(2)} official=${r.official} seo=${r.seoNoise} score=${r.finalScore}`,
      );
    }
  }
}
