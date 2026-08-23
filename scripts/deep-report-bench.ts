#!/usr/bin/env node
/**
 * 深度报告 [P-13] 复测工具（E229）
 *
 * 口径：[P-13] = 深度报告增量预算（生成+证据组装，不含内部搜索调用）→ 直接调用
 * `generateDeepReport(query, evidence, opts)`，evidence 用合成集（不触发搜索），
 * 测量 `elapsedMs` 与是否超 `budgetMs`（默认 PARAMS.deepReportBudgetMs=13s）。
 *
 * 用法:
 *   npm run deep:bench                     # LLM 真跑（需网络 + token，heavy 客户端）
 *   npm run deep:bench -- --dry-run        # 离线自检（fallback 组装，无 LLM 调用，零 token）
 *   npm run deep:bench -- --samples 15     # 指定样本数（晋升需 n>=15，query 循环复用）
 *   npm run deep:bench -- --sections 3     # 分节数（默认 3，与生产一致）
 *   npm run deep:bench -- --budget-ms 20000  # 覆盖预算（E231 校准用，默认 PARAMS.deepReportBudgetMs）
 */
import { loadEnvFile } from '../src/config/env.js';
import { PARAMS } from '../src/config/params.js';
import { createDeepReportHeavyClient } from '../src/search/llm.js';
import {
  generateDeepReport,
  type DeepReportEvidenceItem,
} from '../src/search/deep-report.js';

const QUERIES = [
  'STM32F103C8T6 选型与最小系统设计分析',
  '嵌入式 Linux 启动时间优化方案',
  'GitHub 开源 BLDC 电机控制库评估',
];

interface SampleRecord {
  round: number;
  query: string;
  elapsedMs: number;
  source: 'llm' | 'fallback';
  timedOut: boolean;
  sections: number;
}

function buildEvidence(query: string): DeepReportEvidenceItem[] {
  return [
    { title: `${query} 官方数据手册`, url: `https://example.com/ds/${encodeURIComponent(query)}`, domain: 'example.com', score: 0.95, type: 'datasheet' },
    { title: `${query} 应用笔记 AN001`, url: `https://example.com/an/${encodeURIComponent(query)}`, domain: 'example.com', score: 0.88, type: 'appnote' },
    { title: `${query} 社区实践讨论`, url: `https://forum.example.com/t/${encodeURIComponent(query)}`, domain: 'forum.example.com', score: 0.72, type: 'forum' },
  ];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const samplesArg = args.find((a) => a.startsWith('--samples='))?.split('=')[1]
    ?? args[args.indexOf('--samples') + 1] ?? '3';
  const sectionsArg = args.find((a) => a.startsWith('--sections='))?.split('=')[1]
    ?? args[args.indexOf('--sections') + 1] ?? '3';
  const samples = Math.max(1, Number(samplesArg) || 3);
  const sectionCount = Math.max(1, Number(sectionsArg) || 3);
  const budgetArg = args.find((a) => a.startsWith('--budget-ms='))?.split('=')[1]
    ?? args[args.indexOf('--budget-ms') + 1];
  const budgetMs = Math.max(1, Number(budgetArg) || PARAMS.deepReportBudgetMs);

  const llm = dryRun ? undefined : createDeepReportHeavyClient();
  const mode = llm ? 'LLM 真跑' : dryRun ? 'dry-run（fallback，无 LLM）' : '未配置 heavy client → fallback';
  console.log(`[P-13] 深度报告复测（E229）：samples=${samples} sections=${sectionCount} budget=${budgetMs}ms 模式=${mode}\n`);

  const records: SampleRecord[] = [];
  for (let i = 0; i < samples; i++) {
    const query = QUERIES[i % QUERIES.length];
    const round = Math.floor(i / QUERIES.length) + 1;
    const q = round > 1 ? `${query}（第 ${round} 轮）` : query;
    const result = await generateDeepReport(q, buildEvidence(q), {
      llm,
      sectionCount,
      budgetMs,
      onStage: () => {},
    });
    records.push({
      round,
      query: q,
      elapsedMs: result.elapsedMs,
      source: result.source,
      timedOut: result.timedOut,
      sections: result.sections.length,
    });
    const flag = result.timedOut ? ' ⚠️超预算' : '';
    console.log(
      `  #${i + 1} ${result.source} ${result.elapsedMs}ms${flag} sections=${result.sections.length} 「${q.slice(0, 24)}…」`,
    );
  }

  const sorted = records.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const over = records.filter((r) => r.elapsedMs > budgetMs).length;
  const llmCount = records.filter((r) => r.source === 'llm').length;
  const fallbackCount = records.filter((r) => r.source === 'fallback').length;
  const timedOutCount = records.filter((r) => r.timedOut).length;
  console.log(`\n汇总（n=${records.length}）：`);
  console.log(`  min=${sorted[0]}ms p50=${percentile(sorted, 50)}ms p90=${percentile(sorted, 90)}ms max=${sorted[sorted.length - 1]}ms avg=${Math.round(sum / records.length)}ms`);
  console.log(`  >${budgetMs}ms 占比 ${over}/${records.length}；llm=${llmCount} fallback=${fallbackCount} timedOut=${timedOutCount}`);
  console.log(`  判定：${over > 0 ? `⚠️ ${over} 轮超 [P-13]=${budgetMs}ms，需评估` : '✅ 未超预算'}`);
  console.log('\n提示：晋升 [P-13] 需 n>=15 真实样本（E197 复验门）；真跑请用 npm run deep:bench -- --samples 15');
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
