#!/usr/bin/env node
/**
 * 从 bench/devil-v25/results.jsonl 生成人类可读的证据来源文档：
 * bench/devil-v25/evidence.md，每题列出 evidence 的标题/域名/URL/分数/类型。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface DevilResultEntry {
  row: { id: string; query: string };
  result?: {
    answer: string;
    confidence: number;
    gate_triggered: string;
    evidence: Array<{ title: string; url: string; domain: string; score: number; type: string }>;
  };
  error?: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonlPath = join(root, 'bench', 'devil-v25', 'results.jsonl');
const outPath = join(root, 'bench', 'devil-v25', 'evidence.md');

if (!existsSync(jsonlPath)) {
  console.error('缺少 results.jsonl，请先跑 bench:devil-v25。');
  process.exit(1);
}

const entries: DevilResultEntry[] = [];
for (const line of readFileSync(jsonlPath, 'utf-8').split(/\r?\n/)) {
  if (line.trim()) entries.push(JSON.parse(line) as DevilResultEntry);
}

const sections = entries
  .map((e) => {
    const r = e.result;
    if (!r || r.evidence.length === 0) {
      return `### ${e.row.id} ${e.row.query}\n\n无搜索结果证据${e.error ? `（${e.error}）` : ''}。\n`;
    }
    const rows = r.evidence
      .map(
        (ev) =>
          `| ${ev.type} | ${ev.score.toFixed(2)} | ${ev.domain} | ${ev.title} | [链接](${ev.url}) |`,
      )
      .join('\n');
    return `### ${e.row.id} ${e.row.query}\n\n- gate: ${r.gate_triggered} | confidence: ${r.confidence.toFixed(2)}\n\n| 类型 | 可信分 | 域名 | 标题 | URL |\n|------|--------|------|------|-----|\n${rows}\n`;
  })
  .join('\n');

const totalEvidence = entries.reduce(
  (s, e) => s + (e.result?.evidence.length ?? 0),
  0,
);
const md = `# 魔鬼训练 v2.5 搜索结果证据来源

> 由 \`bench/devil-v25/results.jsonl\` 生成：共 ${entries.length} 条，${totalEvidence} 条证据。

${sections}
`;

writeFileSync(outPath, md, 'utf-8');
console.log(`已生成：${outPath}（${entries.length} 条，${totalEvidence} 条证据）`);
