#!/usr/bin/env node
/**
 * A/B 套评测拆分（E129）
 * A 套：可单发评测；B 套：依赖“上个月/上次/老样子/刚才/多轮/工程上下文”的记忆与上下文题。
 * 输出：bench/devil-v25/ab-split.csv、ab-sets.json、ab-split.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface DevilRow {
  volume: string;
  set: string;
  id: string;
  query: string;
  focus: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = join(root, 'AI-Agent_魔鬼训练_v2.5_整理版');
const outDir = join(root, 'bench', 'devil-v25');

const B_REASONS: Record<string, string> = {
  EC02: '跨会话长期记忆：上个月的问题',
  EC10: '跨会话记忆：昨天聊到的东西',
  EC24: '上下文纠正：我刚才问过的问题',
  EC29: '语义模糊召回：上次说的日志工具',
  P02: '上下文缺失：刚生成的代码',
  P04: 'L2 记忆：老规矩',
  P07: '程序性记忆：老样子',
  P08: '上下文改写：刚才那段话',
  P10: '历史记忆：上次推荐的芯片',
  C01: '多轮问转做：按你说的加到工程',
  C02: '迭代修改：生成后更正',
  C03: '做转问：刚才说的 HAL 库坑',
  C05: '工程上下文：当前项目打包',
  C07: '事务回滚：撤销刚才的操作',
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || cur.length > 0) {
        cur.push(field);
        rows.push(cur);
      }
      cur = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || cur.length > 0) rows.push(cur);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function loadRows(): DevilRow[] {
  const rows = parseCsv(readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''));
  const header = rows[0];
  const idx = {
    volume: header.indexOf('卷册'),
    set: header.indexOf('套号'),
    id: header.indexOf('题号'),
    query: header.indexOf('用户输入（魔鬼指令）'),
    focus: header.indexOf('考察点'),
  };
  if (Object.values(idx).some((v) => v < 0)) throw new Error('CSV 表头不符合预期');
  return rows.slice(1).map((r) => ({
    volume: r[idx.volume]?.trim() ?? '',
    set: r[idx.set]?.trim() ?? '',
    id: r[idx.id]?.trim() ?? '',
    query: r[idx.query]?.trim() ?? '',
    focus: r[idx.focus]?.trim() ?? '',
  }));
}

const escCsv = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const rows = loadRows();
const aRows = rows.filter((r) => !B_REASONS[r.id]);
const bRows = rows.filter((r) => B_REASONS[r.id]);

const csvLines = [
  ['set', 'id', 'volume', 'query', 'focus', 'reason'].join(','),
  ...[
    ...aRows.map((r) => ['A', r.id, r.volume, r.query, r.focus, '单发可评测'].join(',')),
    ...bRows.map((r) => ['B', r.id, r.volume, r.query, r.focus, B_REASONS[r.id]].join(',')),
  ].map((line) =>
    line
      .split(',')
      .map((v, i) => (i >= 3 && i <= 5 ? escCsv(v) : v))
      .join(','),
  ),
];
writeFileSync(join(outDir, 'ab-split.csv'), '\uFEFF' + csvLines.join('\r\n'), 'utf-8');

const sets = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  A: aRows.map((r) => r.id),
  B: bRows.map((r) => r.id),
};
writeFileSync(join(outDir, 'ab-sets.json'), JSON.stringify(sets, null, 2), 'utf-8');

const md = [
  '# 魔鬼训练 v2.5 A/B 套评测拆分',
  '',
  `> 生成时间：${sets.generatedAt}｜总数：${sets.total}`,
  '',
  `| 套 | 条数 | 口径 |`,
  `|----|------|------|`,
  `| A | ${sets.A.length} | 可单发评测（技术/管理/边界/搜索） |`,
  `| B | ${sets.B.length} | 记忆/上下文/多轮依赖，需播种会话或标记带记忆评测 |`,
  '',
  '## B 套清单',
  '',
  '| ID | 依赖 | 理由 |',
  '|----|------|------|',
  ...bRows.map((r) => `| ${r.id} | ${r.set} 卷 | ${B_REASONS[r.id]} |`),
  '',
  '## 用法',
  '',
  '```bash',
  'npm run split:devil-ab',
  'npm run bench:devil-v25 -- --set=a',
  'npm run bench:devil-v25 -- --set=b',
  '```',
  '',
].join('\n');
writeFileSync(join(outDir, 'ab-split.md'), md, 'utf-8');

console.log(`A=${aRows.length} B=${bRows.length} total=${rows.length}`);
console.log(`B: ${sets.B.join(', ')}`);
