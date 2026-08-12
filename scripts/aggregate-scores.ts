#!/usr/bin/env node
/**
 * aggregate-scores.ts — 干净标定集评分脚本（WP2）
 *
 * 职责（§6.4 步 0 + 附录 C.4）：
 * 1. 生成附录 C.3 per-query 31 行聚合表（原用途）
 * 2. 函数级验证干净标定集：结构完整性、5 处标注 bug 修复状态、SHA-256 复核
 *
 * 用法:
 *   npx tsx aggregate-scores.ts
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CSV_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'bench', 'raw_scores.csv');
const EXPECTED_SHA256 = 'd34f831733cd8b56a23333ccda6cab76ead04653b92628e7bb9f64def20a59b1';

const ENGINE_ORDER = ['Bocha', 'AnySearch', 'Tavily'] as const;
const ENGINE_SHORT: Record<string, string> = { Bocha: 'B', AnySearch: 'A', Tavily: 'T' };

interface ScoreRow {
  id: string;
  query: string;
  engine: string;
  relevance: number;
  timeliness: number;
  usability: number;
  note: string;
}

/** 5 处标注 bug 检查点（附录 C.4 权威登记，2026-08-11 老张两轮审核修复） */
const BUG_FIX_CHECKPOINTS = [
  { id: 'E02', engine: 'AnySearch', dim: '综合分', expected: 0.33, label: '综合误标' },
  { id: 'E06', engine: 'Bocha', dim: '相关性', expected: 1, label: '相关性误标' },
  { id: 'E15', engine: 'Tavily', dim: '时效', expected: 3, label: '时效误标' },
  { id: 'E17', engine: 'AnySearch', dim: '可用', expected: 1, label: '可用误标' },
  { id: 'L04', engine: 'Tavily', dim: '时效', expected: 1, label: '时效误标' },
] as const;

function sha256Hex(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function parseCsv(csv: string): ScoreRow[] {
  const lines = csv.trim().split('\n');
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
    rows.push({
      id: parts[0],
      query: parts[1],
      engine: parts[2],
      relevance: +parts[3],
      timeliness: +parts[4],
      usability: +parts[5],
      note: parts[6] ?? '',
    });
  }
  return rows;
}

function computeComposite(r: ScoreRow): number {
  return +((r.relevance + r.timeliness + r.usability) / 3).toFixed(2);
}

function verifyDataset(rows: ScoreRow[]): string[] {
  const issues: string[] = [];
  if (rows.length !== 93) issues.push(`行数应为 93，实际 ${rows.length}`);
  const byId = new Map<string, ScoreRow[]>();
  for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  if (byId.size !== 31) issues.push(`唯一 query 应为 31，实际 ${byId.size}`);
  for (const [id, group] of byId) {
    const engines = group.map((r) => r.engine).sort().join(',');
    if (engines !== 'AnySearch,Bocha,Tavily') issues.push(`${id} 引擎集合异常: ${engines}`);
    for (const r of group) {
      const vals = [r.relevance, r.timeliness, r.usability];
      if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 3 || !Number.isInteger(v))) {
        issues.push(`${id}/${r.engine} 分数越界或非整数: ${vals.join(',')}`);
      }
    }
  }
  return issues;
}

function verifyBugFixes(rows: ScoreRow[]): { pass: boolean; lines: string[] } {
  const lines: string[] = [];
  let pass = true;
  for (const cp of BUG_FIX_CHECKPOINTS) {
    const row = rows.find((r) => r.id === cp.id && r.engine === cp.engine);
    if (!row) {
      lines.push(`❌ ${cp.id}/${cp.engine} 缺失，无法验证`);
      pass = false;
      continue;
    }
    let actual: number;
    if (cp.dim === '综合分') actual = computeComposite(row);
    else if (cp.dim === '相关性') actual = row.relevance;
    else if (cp.dim === '时效') actual = row.timeliness;
    else actual = row.usability;
    const ok = actual === cp.expected;
    if (!ok) pass = false;
    lines.push(
      `${ok ? '✅' : '❌'} ${cp.id}/${cp.engine} ${cp.label}：修复后 ${actual}，期望 ${cp.expected}${ok ? '' : '（不一致）'}`,
    );
  }
  return { pass, lines };
}

function renderAggregateTable(rows: ScoreRow[]): string[] {
  const ids: string[] = [];
  const byId = new Map<string, ScoreRow[]>();
  for (const r of rows) {
    if (!byId.has(r.id)) { byId.set(r.id, []); ids.push(r.id); }
    byId.get(r.id)!.push(r);
  }
  const out: string[] = [
    '| ID | Query | B(相/时/可/综) | A(相/时/可/综) | T(相/时/可/综) | 最佳 |',
    '|----|-------|-----------------|-----------------|-----------------|------|',
  ];
  for (const id of ids) {
    const group = byId.get(id)!;
    const query = group[0].query;
    const byEngine = new Map(group.map((r) => [r.engine, r]));
    const cells: string[] = [];
    let best = '';
    let bestScore = -1;
    for (const e of ENGINE_ORDER) {
      const r = byEngine.get(e);
      if (!r) { cells.push('-'); continue; }
      const c = computeComposite(r);
      cells.push(`${r.relevance}/${r.timeliness}/${r.usability}/${c}`);
      if (c > bestScore) { bestScore = c; best = ENGINE_SHORT[e]; }
    }
    out.push(`| ${id} | ${query} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${best} |`);
  }
  return out;
}

function main(): void {
  const csv = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csv);

  console.log('══════════════════════════════════════════════════');
  console.log('  aggregate-scores.ts — 附录 C.3 聚合表');
  console.log(`  数据: ${CSV_PATH}`);
  console.log('══════════════════════════════════════════════════\n');
  console.log(renderAggregateTable(rows).join('\n'));

  console.log('\n══════════════════════════════════════════════════');
  console.log('  标定集验证（§6.4 步 0 + 附录 C.4）');
  console.log('══════════════════════════════════════════════════\n');

  const sha = sha256Hex(CSV_PATH);
  const shaOk = sha === EXPECTED_SHA256;
  console.log(`${shaOk ? '✅' : '❌'} SHA-256: ${sha}${shaOk ? '' : `（期望 ${EXPECTED_SHA256}）`}`);

  const datasetIssues = verifyDataset(rows);
  console.log(
    datasetIssues.length === 0
      ? '✅ 数据集结构：93 行 / 31 query / 每 query 3 引擎 / 分数 0-3'
      : datasetIssues.map((m) => `❌ ${m}`).join('\n'),
  );

  const fixes = verifyBugFixes(rows);
  console.log(fixes.lines.join('\n'));
  console.log('\n修复前后说明（附录 C.4 登记）：修复前旧 CSV 已作废，以上 5 处为当前干净版实测值。');

  const pass = shaOk && datasetIssues.length === 0 && fixes.pass;
  console.log(`\n结果: ${pass ? '✅ 干净标定集可用' : '❌ 标定集存在问题'}`);
  process.exitCode = pass ? 0 : 1;
}

main();
