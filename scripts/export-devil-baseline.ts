/**
 * 导出魔鬼训练 v2.5 新基线（E126）
 * 从 results.jsonl 生成自动评分 CSV 与聚合摘要，供“重打分”作为当前行为基线。
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface Entry {
  row: {
    id: string;
    volume: string;
    query: string;
    expected: string;
    focus: string;
  };
  result?: {
    answer: string;
    gate_triggered: string;
    confidence: number;
    evidence: unknown[];
  };
  autoScore?: number;
  autoReason?: string;
  error?: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'bench', 'devil-v25');
const jsonlPath = join(outDir, 'results.jsonl');

const entries: Entry[] = [];
for (const line of readFileSync(jsonlPath, 'utf-8').split(/\r?\n/)) {
  if (line.trim()) entries.push(JSON.parse(line) as Entry);
}

const escCsv = (v: string) => {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
};

const header = ['ID', '卷册', '题目', '考察点', 'gate', 'confidence', 'evidence', 'autoScore', 'autoReason'];
const csvLines = [
  header.map(escCsv).join(','),
  ...entries.map((e) =>
    [
      e.row.id,
      e.row.volume,
      e.row.query,
      e.row.focus,
      e.result?.gate_triggered ?? 'error',
      String(e.result?.confidence ?? 0),
      String(e.result?.evidence?.length ?? 0),
      String(e.autoScore ?? 0),
      e.autoReason ?? e.error ?? '',
    ]
      .map((v) => escCsv(String(v)))
      .join(','),
  ),
];

const csvPath = join(outDir, 'new-baseline-scores.csv');
writeFileSync(csvPath, '\uFEFF' + csvLines.join('\r\n'), 'utf-8');

let scoreSum = 0;
let zero = 0;
let stock = 0;
const gates = new Map<string, number>();
for (const e of entries) {
  const s = e.autoScore ?? 0;
  scoreSum += s;
  if (s === 0) zero += 1;
  const gate = e.result?.gate_triggered ?? 'error';
  gates.set(gate, (gates.get(gate) ?? 0) + 1);
  if ((e.result?.answer ?? '').includes('我暂时无法确认')) stock += 1;
}

const md = [
  '# 魔鬼训练 v2.5 新基线（E126）',
  '',
  `> 生成时间：${new Date().toISOString()}｜条目：${entries.length}`,
  '',
  '| 指标 | 值 |',
  '|------|----|',
  `| 平均自动分（0-3） | ${(scoreSum / entries.length).toFixed(2)} |`,
  `| 0 分条目 | ${zero} |`,
  `| “我暂时无法确认” | ${stock} |`,
  `| gate 分布 | ${[...gates.entries()].map(([k, v]) => `${k}=${v}`).join('，')} |`,
  '',
  '原始数据：`bench/devil-v25/results.jsonl`',
  '自动评分表：`bench/devil-v25/new-baseline-scores.csv`',
  '',
].join('\n');

const mdPath = join(outDir, 'new-baseline-summary.md');
writeFileSync(mdPath, md, 'utf-8');

console.log(`已生成：${csvPath}（${entries.length} 条）`);
console.log(`已生成：${mdPath}`);
