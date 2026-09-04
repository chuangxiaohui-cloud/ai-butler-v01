import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeUsageBudget } from '../config/usage-budget.js';
import { NotificationStore } from '../notifications/notification-store.js';
import type { UsageRecord } from './usage-store.js';
import {
  aiOpsBudgetBand,
  emitAiOpsBudgetAlerts,
  emitAiOpsDailyReport,
  reportDateLabel,
  todayKey,
} from './ai-ops-notify.js';

// 2026-09-02（周三）10:00 北京时间 = 02:00Z：高峰时段；deepseek-v4-flash 缓存未命中输入 3.0¥/M、输出 9.0¥/M（factor 1）
const NOW = Date.UTC(2026, 8, 2, 2, 0, 0);
const BUDGET = 5;

function seedUsage(file: string, promptTokens: number, ts = NOW): void {
  const record: UsageRecord = {
    ts,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    promptTokens,
    completionTokens: 0,
  };
  writeFileSync(file, `${JSON.stringify(record)}\n`, 'utf-8');
}

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), name));
}

test('ai-ops-notify: 日期/档位纯函数（todayKey / reportDateLabel / aiOpsBudgetBand）', () => {
  assert.equal(todayKey(NOW), '2026-09-02');
  assert.equal(reportDateLabel(NOW), '2026年9月2日');
  assert.equal(aiOpsBudgetBand(2.4, BUDGET), 0);
  assert.equal(aiOpsBudgetBand(2.5, BUDGET), 1);
  assert.equal(aiOpsBudgetBand(3.99, BUDGET), 1);
  assert.equal(aiOpsBudgetBand(4.0, BUDGET), 2);
  assert.equal(aiOpsBudgetBand(4.99, BUDGET), 2);
  assert.equal(aiOpsBudgetBand(5.0, BUDGET), 3);
  assert.equal(aiOpsBudgetBand(6.0, null), 0);
  assert.equal(aiOpsBudgetBand(6.0, 0), 0);
});

test('ai-ops-notify: AI 运营日报按日幂等——首次写入 source=usage，同日重复为 dup', () => {
  const dir = tempDir('aiops-daily-');
  try {
    const usageFile = join(dir, 'usage.jsonl');
    const notifyFile = join(dir, 'notifications.jsonl');
    const markerFile = join(dir, 'report-marker.json');
    seedUsage(usageFile, 1000);
    const store = new NotificationStore(notifyFile);

    const first = emitAiOpsDailyReport({ now: NOW, usageFile, markerFile, store });
    assert.equal(first.status, 'emitted');
    assert.ok(first.entry);
    assert.equal(first.entry.kind, 'ai_ops_daily');
    assert.equal(first.entry.role, '秘书');
    assert.equal(first.entry.source, 'usage');
    assert.ok(first.entry.title.includes('AI 运营日报（2026年9月2日）'));
    assert.ok(first.entry?.detail?.includes('📊 AI 运营成本'));

    const again = emitAiOpsDailyReport({ now: NOW + 3600_000, usageFile, markerFile, store });
    assert.equal(again.status, 'dup');

    const lines = readFileSync(notifyFile, 'utf-8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    assert.ok(existsSync(markerFile));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ai-ops-notify: 预算阈值事件跨档写入一次，未跨档/已触发档位不重复', () => {
  const dir = tempDir('aiops-band-');
  try {
    const usageFile = join(dir, 'usage.jsonl');
    const budgetFile = join(dir, 'usage-budget.json');
    const notifyFile = join(dir, 'notifications.jsonl');
    const markerFile = join(dir, 'budget-marker.json');
    writeUsageBudget(
      {
        budgetYuan: null,
        degradeAtPercent: 90,
        dailyBudgetCny: BUDGET,
        monthlyBudgetCny: 150,
        hardStop: false,
      },
      budgetFile,
    );
    const store = new NotificationStore(notifyFile);
    const call = () =>
      emitAiOpsBudgetAlerts({ now: NOW, usageFile, budgetFile, markerFile, store });

    // 档 0（1.8 = 36%）：不写事件
    seedUsage(usageFile, 600_000);
    assert.equal(call().emitted, false);
    assert.ok(!existsSync(notifyFile));

    // 档 1（3.0 = 60%，⚠️ 黄）
    seedUsage(usageFile, 1_000_000);
    const yellow = call();
    assert.equal(yellow.emitted, true);
    assert.equal(yellow.band, 1);
    assert.ok(yellow.alerts[0].startsWith('⚠️'));

    // 仍档 1：不重复
    assert.equal(call().emitted, false);

    // 档 2（4.2 = 84%，🔴 红）
    seedUsage(usageFile, 1_400_000);
    const red = call();
    assert.equal(red.emitted, true);
    assert.equal(red.band, 2);

    // 档 3（5.1 = 102%，🚫 用尽）
    seedUsage(usageFile, 1_700_000);
    const stop = call();
    assert.equal(stop.emitted, true);
    assert.equal(stop.band, 3);

    // 同档不重复
    assert.equal(call().emitted, false);

    const events = readFileSync(notifyFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { kind: string; title: string; source: string });
    assert.equal(events.length, 3);
    assert.ok(events.every((e) => e.kind === 'ai_ops_budget_alert' && e.source === 'usage'));
    assert.ok(events[0].title.startsWith('⚠️'));
    assert.ok(events[1].title.startsWith('🔴'));
    assert.ok(events[2].title.startsWith('🚫'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ai-ops-notify: 预算未配置（dailyBudgetCny=null）时不写事件，无副作用', () => {
  const dir = tempDir('aiops-no-budget-');
  try {
    const usageFile = join(dir, 'usage.jsonl');
    const budgetFile = join(dir, 'usage-budget.json');
    const notifyFile = join(dir, 'notifications.jsonl');
    const markerFile = join(dir, 'budget-marker.json');
    writeUsageBudget(
      { budgetYuan: null, degradeAtPercent: 90, dailyBudgetCny: null, monthlyBudgetCny: null, hardStop: false },
      budgetFile,
    );
    seedUsage(usageFile, 10_000_000);
    const store = new NotificationStore(notifyFile);
    const result = emitAiOpsBudgetAlerts({ now: NOW, usageFile, budgetFile, markerFile, store });
    assert.equal(result.emitted, false);
    assert.equal(result.dailyBudgetCny, null);
    assert.ok(!existsSync(notifyFile));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
