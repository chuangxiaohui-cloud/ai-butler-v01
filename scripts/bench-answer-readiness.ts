#!/usr/bin/env node
/**
 * 答案覆盖度基准（P-ZZZ' 信号 A/B，E271）
 *
 * 目标：用「整体指标」回归回答力信号检测器，而不是为每个 query 加断言——
 * 在魔鬼训练 v2.5 query 集上按意图分组统计：
 *   1) predicate 分类覆盖率：数值/时序/操作/观点 四类被识别的 query 占比（非 other）
 *   2) 答案覆盖度达标率（真实证据）：读 bench/devil-v25/results.jsonl 已有运行结果，
 *      用每条 query 的 top evidence 标题做 checkEvidenceReadiness，按意图统计达标占比
 *   3) 答案覆盖度达标率（预期文本代理，离线兜底）：以「预期行为」列文本为证据代理，
 *      无 results.jsonl 时也可回归检测器（验证形态检测器能识别该类问题需要的证据形态）
 *   4) 证据多样性达标率：top-3 evidence 覆盖 ≥2 个不同域名的 query 占比
 *
 * 用法：
 *   npm run bench:answer-readiness             # 分析（1/2/4 + 3 兜底）
 *   npm run bench:answer-readiness -- --json   # JSON 输出（便于脚本对比）
 *   npm run bench:answer-readiness -- --csv=<path>
 *   npm run bench:answer-readiness -- --results=<path>
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { classifyPredicate, checkEvidenceReadiness, type PredicateKind } from '../src/search/answer-readiness.js';

interface DevilRow {
  volume: string;
  id: string;
  query: string;
  expected: string;
  focus: string;
}

interface RunEntry {
  row: DevilRow;
  result?: { evidence?: Array<{ title: string; url: string; domain: string }> };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvArg = process.argv.find((a) => a.startsWith('--csv='))?.split('=')[1];
const csvPath = csvArg ? join(process.cwd(), csvArg) : join(root, 'AI-Agent_魔鬼训练_v2.5.csv');
const resultsArg = process.argv.find((a) => a.startsWith('--results='))?.split('=')[1];
const resultsPath = resultsArg ?? join(root, 'bench', 'devil-v25', 'results.jsonl');
const wantJson = process.argv.includes('--json');
const outPath = join(root, 'bench', `answer-readiness-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cur.push(field); field = ''; }
    else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function loadRows(): DevilRow[] {
  const rows = parseCsv(readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''));
  const header = rows[0].map((c) => c.trim());
  const idx = {
    volume: header.indexOf('卷册'),
    id: header.indexOf('题号'),
    query: header.indexOf('用户输入（魔鬼指令）'),
    expected: header.indexOf('预期行为（魔鬼细节）'),
    focus: header.indexOf('考察点'),
  };
  if (Object.values(idx).some((v) => v < 0)) throw new Error('CSV 表头不符合预期');
  return rows.slice(1).map((r) => ({
    volume: r[idx.volume]?.trim() ?? '',
    id: r[idx.id]?.trim() ?? '',
    query: r[idx.query]?.trim() ?? '',
    expected: r[idx.expected]?.trim() ?? '',
    focus: r[idx.focus]?.trim() ?? '',
  }));
}

/** 考察点 → 项目 8 意图（离线启发式，仅用于分组统计，不作路由依据） */
function estimateIntent(row: DevilRow): string {
  const t = row.focus + ' ' + row.query;
  if (/安全|急救|逃生|违法|危险|人身/.test(t)) return 'emergency';
  if (/github|仓库|开源项目|repo|架构|技术栈/.test(t)) return 'github_analysis';
  if (/行情|新闻|最新|实时|现状|报道|榜单|市值|排名/.test(t)) return 'news';
  if (/踩坑|经验|教训|心得|实战/.test(t)) return 'experience';
  if (/报错|失败|无应答|排查|错误|解决|修复/.test(t)) return 'troubleshooting';
  if (/对比|差异|区别|选型|权衡|vs/.test(t)) return 'comparison';
  if (/步骤|流程|配置|安装|操作|建模|仿真|怎么|如何|怎样/.test(t)) return 'how_to';
  return 'factual';
}

function loadResults(): Map<string, RunEntry> {
  const done = new Map<string, RunEntry>();
  if (!existsSync(resultsPath)) return done;
  for (const line of readFileSync(resultsPath, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as RunEntry;
      if (entry.row?.id) done.set(entry.row.id, entry);
    } catch {
      // 忽略损坏行
    }
  }
  return done;
}

interface StatBucket {
  total: number;
  predicateCount: Record<string, number>;
  expectedPass: number;
  evidencePass: number;
  evidenceSamples: number;
}

function summarize(rows: DevilRow[], results: Map<string, RunEntry>): Record<string, unknown> {
  const byIntent = new Map<string, StatBucket>();
  const kinds: PredicateKind[] = [];
  const expectedGaps = new Map<string, number>();
  const evidenceGaps = new Map<string, number>();

  for (const row of rows) {
    const intent = estimateIntent(row);
    const kind = classifyPredicate(row.query);
    kinds.push(kind);
    const bucket = byIntent.get(intent) ?? {
      total: 0,
      predicateCount: {},
      expectedPass: 0,
      evidencePass: 0,
      evidenceSamples: 0,
    };
    bucket.total += 1;
    bucket.predicateCount[kind] = (bucket.predicateCount[kind] ?? 0) + 1;

    // 预期文本代理（离线兜底）
    const expectedReady = checkEvidenceReadiness(row.query, [row.expected]);
    if (expectedReady.ready) bucket.expectedPass += 1;
    else if (expectedReady.gap) expectedGaps.set(expectedReady.gap, (expectedGaps.get(expectedReady.gap) ?? 0) + 1);

    // 真实证据（有运行结果时）
    const entry = results.get(row.id);
    const evidence = entry?.result?.evidence ?? [];
    if (evidence.length > 0) {
      bucket.evidenceSamples += 1;
      const evidenceReady = checkEvidenceReadiness(
        row.query,
        evidence.slice(0, 3).map((e) => `${e.title} ${e.url}`),
      );
      if (evidenceReady.ready) bucket.evidencePass += 1;
      else if (evidenceReady.gap) evidenceGaps.set(evidenceReady.gap, (evidenceGaps.get(evidenceReady.gap) ?? 0) + 1);
    }
    byIntent.set(intent, bucket);
  }

  const nonOther = kinds.filter((k) => k !== 'other').length;
  const all = [...byIntent.values()];
  const expectedTotal = all.reduce((a, b) => a + b.expectedPass, 0);
  const evidenceTotal = all.reduce((a, b) => a + b.evidencePass, 0);
  const evidenceSamples = all.reduce((a, b) => a + b.evidenceSamples, 0);

  const perIntent = [...byIntent.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([intent, s]) => ({
      intent,
      total: s.total,
      predicateCoverage: Number(((s.total - (s.predicateCount.other ?? 0)) / s.total).toFixed(3)),
      readinessExpectedPassRate: Number((s.expectedPass / s.total).toFixed(3)),
      readinessEvidencePassRate: s.evidenceSamples > 0 ? Number((s.evidencePass / s.evidenceSamples).toFixed(3)) : null,
      evidenceSamples: s.evidenceSamples,
      predicateCount: s.predicateCount,
    }));

  return {
    csv: csvPath,
    total: rows.length,
    predicateCoverage: Number((nonOther / rows.length).toFixed(3)),
    readinessExpectedOverall: Number((expectedTotal / rows.length).toFixed(3)),
    readinessEvidence: evidenceSamples > 0
      ? { samples: evidenceSamples, passRate: Number((evidenceTotal / evidenceSamples).toFixed(3)) }
      : null,
    perIntent,
    topExpectedGaps: [...expectedGaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    topEvidenceGaps: [...evidenceGaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    evidenceDiversity: analyzeDiversity(results),
  };
}

/** 证据多样性达标率：top-3 evidence 覆盖 ≥2 个不同域名的 query 占比（与信号 C 同口径） */
function analyzeDiversity(results: Map<string, RunEntry>): { available: boolean; passRate?: number; samples?: number } {
  let pass = 0;
  let samples = 0;
  for (const entry of results.values()) {
    const ev = entry.result?.evidence ?? [];
    const top = ev.slice(0, 3);
    if (top.length >= 2) {
      samples += 1;
      if (new Set(top.map((e) => e.domain)).size >= 2) pass += 1;
    }
  }
  if (samples === 0) return { available: false };
  return { available: true, passRate: Number((pass / samples).toFixed(3)), samples };
}

const report = summarize(loadRows(), loadResults());
if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('═'.repeat(56));
  console.log('  答案覆盖度基准（P-ZZZ\', E271）— 整体指标，不逐 query 加断言');
  console.log('═'.repeat(56));
  console.log(`  样本集: ${report.csv}`);
  console.log(`  总 query: ${report.total}`);
  console.log(`  predicate 分类覆盖率: ${((report.predicateCoverage as number) * 100).toFixed(1)}%`);
  console.log(`  覆盖度达标率(预期文本代理): ${((report.readinessExpectedOverall as number) * 100).toFixed(1)}%`);
  const re = report.readinessEvidence as { samples: number; passRate: number } | null;
  if (re) console.log(`  覆盖度达标率(真实证据, n=${re.samples}): ${(re.passRate * 100).toFixed(1)}%`);
  console.log('');
  const iters = report.perIntent as Array<{
    intent: string; total: number; predicateCoverage: number;
    readinessExpectedPassRate: number; readinessEvidencePassRate: number | null;
  }>;
  for (const it of iters) {
    const ev = it.readinessEvidencePassRate === null ? '  n/a   ' : `  ${(it.readinessEvidencePassRate * 100).toFixed(0).padStart(3)}%`;
    console.log(
      `  [${it.intent.padEnd(16)}] n=${String(it.total).padStart(3)}  分类覆盖 ${(it.predicateCoverage * 100).toFixed(0).padStart(3)}%  覆盖度-代理 ${(it.readinessExpectedPassRate * 100).toFixed(0).padStart(3)}%  覆盖度-真实${ev}`,
    );
  }
  const div = report.evidenceDiversity as { available: boolean; passRate?: number; samples?: number };
  if (div.available) {
    console.log(`  证据多样性达标率(已有结果集): ${((div.passRate ?? 0) * 100).toFixed(1)}% (n=${div.samples})`);
  } else {
    console.log('  证据多样性: 未提供 results.jsonl，跳过（由 fusion 单测回归）');
  }
  console.log('═'.repeat(56));
}
writeFileSync(outPath, JSON.stringify(report, null, 2));
