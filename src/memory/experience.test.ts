import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ExperienceManager } from './experience.js';

const DAY_MS = 24 * 3600 * 1000;

function tempDb(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'experience-test-'));
  return { path: join(dir, 'experience.db'), dir };
}

test('experience: 关键词检索命中并受置信度门槛约束', () => {
  const { path, dir } = tempDb();
  const mgr = new ExperienceManager(path);
  try {
    const now = Date.now();
    mgr.add({
      id: 'e1',
      skillName: 'chip-analysis',
      content: 'STM32F103C8T6 最大主频 72MHz',
      keywords: ['STM32', '主频'],
      createdAt: now,
      lastUsedAt: now,
    });
    mgr.add({
      id: 'e2',
      skillName: 'jargon-map',
      content: 'Protel 是 Altium Designer 旧称',
      keywords: ['Protel'],
      createdAt: now,
      lastUsedAt: now,
    });
    const hits = mgr.search('STM32 主频', { limit: 5 });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'e1');
  } finally {
    mgr.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('experience: 使用次数提升置信度，👍 提升 👎 降权并复审', () => {
  const { path, dir } = tempDb();
  const mgr = new ExperienceManager(path);
  try {
    const now = Date.now();
    mgr.add({
      id: 'e1',
      skillName: 'chip-analysis',
      content: '经验内容',
      keywords: ['ADC'],
      createdAt: now,
      lastUsedAt: now,
    });
    mgr.recordUse('e1', now);
    const afterUse = mgr.search('ADC', { now }).find((e) => e.id === 'e1');
    assert.ok((afterUse?.confidence ?? 0) > 0.5);
    mgr.recordFeedback('e1', true, now);
    const afterUp = mgr.search('ADC', { now }).find((e) => e.id === 'e1');
    assert.ok((afterUp?.confidence ?? 0) > (afterUse?.confidence ?? 0));
    mgr.recordFeedback('e1', false, now);
    mgr.recordFeedback('e1', false, now);
    mgr.recordFeedback('e1', false, now);
    const stats = mgr.stats(now);
    assert.equal(stats.review, 1);
    // 复审项不再参与自动检索
    assert.equal(mgr.search('ADC', { now }).length, 0);
  } finally {
    mgr.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('experience: 90 天未用进入冷存，不再自动召回', () => {
  const { path, dir } = tempDb();
  const mgr = new ExperienceManager(path);
  try {
    const created = Date.now();
    mgr.add({
      id: 'e1',
      skillName: 'chip-analysis',
      content: '老经验',
      keywords: ['老'],
      createdAt: created,
      lastUsedAt: created,
    });
    const later = created + 100 * DAY_MS;
    const hits = mgr.search('老', { now: later });
    assert.equal(hits.length, 0);
    const stats = mgr.stats(later);
    assert.equal(stats.cold, 1);
  } finally {
    mgr.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
