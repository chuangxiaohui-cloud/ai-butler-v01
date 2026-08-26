#!/usr/bin/env node
/**
 * [P-25] 成熟度轻量自检 CLI（§12.4 五维指标 + L0-L3 判定）
 * 数据源：data/experience.db#skill_stats、MarketStore（data/market-skills 安装记录）、
 *         data/route-cases.jsonl（反馈样本）、data/trajectory.jsonl（复用率观察）。
 * 用法：npm run maturity:check [--json]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DatabaseSync } from 'node:sqlite';

import { MarketStore } from '../src/skills/market/store.js';
import { getSkills } from '../src/skills/registry.js';
import {
  computeMaturityMetrics,
  type MaturityFeedbackSample,
  type MaturitySkillStat,
} from '../src/maturity/metrics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

function readLines(path: string): string[] {
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    return raw ? raw.split(/\r?\n/) : [];
  } catch {
    return [];
  }
}

function main(): void {
  const presetSkills = getSkills().map((skill) => skill.name);

  const skillStats: MaturitySkillStat[] = [];
  try {
    const db = new DatabaseSync(join(root, 'data', 'experience.db'));
    const rows = db
      .prepare('SELECT name, usage_count, thumbs_down_count FROM skill_stats')
      .all() as Array<{ name: string; usage_count: number; thumbs_down_count: number }>;
    for (const row of rows) {
      skillStats.push({
        name: row.name,
        usageCount: row.usage_count,
        thumbsDownCount: row.thumbs_down_count,
      });
    }
    db.close();
  } catch (err) {
    console.error(
      `⚠️ skill_stats 读取失败（不影响其余指标）：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const marketStore = new MarketStore();
  const installedMarketSkills = marketStore.installed().map((record) => record.name);

  const feedbackSamples: MaturityFeedbackSample[] = [];
  for (const line of readLines(join(root, 'data', 'route-cases.jsonl'))) {
    try {
      const record = JSON.parse(line) as { source?: string; feedback?: string | null };
      if (record.source === 'pipeline') {
        feedbackSamples.push({ source: record.source, feedback: record.feedback ?? null });
      }
    } catch {
      // 损坏行跳过
    }
  }

  let skillEvents = 0;
  let answerEvents = 0;
  for (const line of readLines(join(root, 'data', 'trajectory.jsonl'))) {
    try {
      const event = JSON.parse(line) as { type?: string };
      if (event.type === 'skill') skillEvents += 1;
      else if (event.type === 'answer') answerEvents += 1;
    } catch {
      // 损坏行跳过
    }
  }

  const metrics = computeMaturityMetrics({
    presetSkills,
    skillStats,
    installedMarketSkills,
    feedbackSamples,
    reuse: { skillEvents, answerEvents },
  });

  if (asJson) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  const pct = (rate: number | null): string =>
    rate === null ? '无样本' : `${(rate * 100).toFixed(rate >= 1 ? 0 : 1)}%`;

  console.log('[P-25] 成熟度轻量自检（§12.4）');
  console.log(`等级：${metrics.level}`);
  console.log('');
  console.log(
    `Skill 覆盖度：预置 ${metrics.skillCoverage.presetUsed}/${metrics.skillCoverage.presetTotal} 有使用；` +
      `用户累积 ${metrics.skillCoverage.userAccumulated}/50+`,
  );
  console.log(
    `验收通过率：${pct(metrics.acceptance.rate)}` +
      `（${metrics.acceptance.accept} 通过 / ${metrics.acceptance.reject} 驳回 / ` +
      `${metrics.acceptance.correct} 修改，n=${metrics.acceptance.total}）`,
  );
  console.log(
    `复用率观察：${metrics.reuse.rate === null ? '未观测' : pct(metrics.reuse.rate)}` +
      `（${metrics.reuse.skillEvents} Skill 事件 / ${metrics.reuse.answerEvents} 回答事件）`,
  );
  console.log(
    `证据链完整度：${
      metrics.evidenceChain && metrics.evidenceChain.rate !== null
        ? `${pct(metrics.evidenceChain.rate)}（${metrics.evidenceChain.withEvidence}/${metrics.evidenceChain.total}）`
        : '未抽样（机制就绪）'
    }`,
  );
  console.log(`反馈信号样本：${metrics.feedbackSignals.total}`);
  console.log('');
  if (metrics.gaps.length === 0) {
    console.log('✅ 无缺口（L2+ 判据齐达标）');
  } else {
    console.log(`缺口（${metrics.gaps.length}）：`);
    for (const gap of metrics.gaps) console.log(`  - ${gap}`);
  }
}

main();