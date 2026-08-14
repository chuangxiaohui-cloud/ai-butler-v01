import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { SkillLifecycle } from './lifecycle.js';

const DAY_MS = 24 * 3600 * 1000;

function tempDb(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'skill-lifecycle-test-'));
  return { path: join(dir, 'experience.db'), dir };
}

test('skill-lifecycle: 注册 18 项 Skill 并记录使用', () => {
  const { path, dir } = tempDb();
  const lc = new SkillLifecycle(path);
  try {
    const now = Date.now();
    lc.ensureRegistered(now);
    assert.equal(lc.list(now).length, 18);
    lc.recordUse('chip-analysis', now);
    const stat = lc.list(now).find((s) => s.name === 'chip-analysis');
    assert.equal(stat?.usageCount, 1);
    assert.ok((stat?.confidence ?? 0) >= 0.6);
  } finally {
    lc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skill-lifecycle: 连续 👎 触发复审但不自动弃用', () => {
  const { path, dir } = tempDb();
  const lc = new SkillLifecycle(path);
  try {
    const now = Date.now();
    lc.ensureRegistered(now);
    lc.recordFeedback('jargon-map', false, now);
    lc.recordFeedback('jargon-map', false, now);
    lc.recordFeedback('jargon-map', false, now);
    const stat = lc.list(now).find((s) => s.name === 'jargon-map');
    assert.equal(stat?.state, 'review');
    assert.equal(stat?.needsReview, true);
  } finally {
    lc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skill-lifecycle: findBest 按触发特异性优先', () => {
  const { path, dir } = tempDb();
  const lc = new SkillLifecycle(path);
  try {
    const now = Date.now();
    lc.ensureRegistered(now);
    const best = lc.findBest('STM32 ADC 芯片踩坑', now);
    assert.ok(best);
    assert.equal(best.name, 'chip-analysis');
  } finally {
    lc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skill-lifecycle: 90 天未用标记 cold', () => {
  const { path, dir } = tempDb();
  const lc = new SkillLifecycle(path);
  try {
    const created = Date.now();
    lc.ensureRegistered(created);
    const later = created + 100 * DAY_MS;
    const list = lc.list(later);
    assert.equal(list.filter((s) => s.state === 'cold').length, 18);
    assert.equal(lc.findBest('芯片', later), null);
  } finally {
    lc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
