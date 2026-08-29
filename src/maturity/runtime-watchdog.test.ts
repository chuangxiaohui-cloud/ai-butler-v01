import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSynthesisHealth } from './runtime-watchdog.js';

const NOW = 1_000_000_000_000;
const WINDOW = 3_600_000;

function fixture(events: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'watchdog-test-'));
  const file = join(dir, 'trajectory.jsonl');
  writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n'), 'utf-8');
  return file;
}

function answer(timestamp: number, gateTriggered: string): unknown {
  return { id: `a-${timestamp}`, timestamp, type: 'answer', answer: { gateTriggered } };
}

test('watchdog: 窗口内 1/5 命中阈值告警（P-141）', () => {
  const file = fixture([
    answer(NOW - 1_000, 'none'),
    answer(NOW - 2_000, 'none'),
    answer(NOW - 3_000, 'none'),
    answer(NOW - 4_000, 'none'),
    answer(NOW - 5_000, 'synthesis_timeout'),
  ]);
  try {
    const r = checkSynthesisHealth({ filePath: file, windowMs: WINDOW, now: NOW });
    assert.equal(r.triggered, true);
    assert.equal(r.answers, 5);
    assert.equal(r.timeouts, 1);
    assert.equal(r.ratio, 0.2);
    assert.match(r.message ?? '', /1\/5/);
  } finally {
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});

test('watchdog: 窗口内无超时不告警', () => {
  const file = fixture([answer(NOW - 1_000, 'none'), answer(NOW - 2_000, 'low_confidence')]);
  try {
    const r = checkSynthesisHealth({ filePath: file, windowMs: WINDOW, now: NOW });
    assert.equal(r.triggered, false);
    assert.equal(r.timeouts, 0);
    assert.equal(r.answers, 2);
  } finally {
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});

test('watchdog: 1/6 低于阈值不告警', () => {
  const file = fixture([
    answer(NOW - 1_000, 'none'),
    answer(NOW - 2_000, 'none'),
    answer(NOW - 3_000, 'none'),
    answer(NOW - 4_000, 'none'),
    answer(NOW - 5_000, 'none'),
    answer(NOW - 6_000, 'synthesis_timeout'),
  ]);
  try {
    const r = checkSynthesisHealth({ filePath: file, windowMs: WINDOW, now: NOW });
    assert.equal(r.triggered, false);
    assert.equal(r.ratio, 1 / 6);
  } finally {
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});

test('watchdog: 窗口外超时不计入', () => {
  const file = fixture([
    answer(NOW - WINDOW * 2, 'synthesis_timeout'),
    answer(NOW - 1_000, 'none'),
  ]);
  try {
    const r = checkSynthesisHealth({ filePath: file, windowMs: WINDOW, now: NOW });
    assert.equal(r.triggered, false);
    assert.equal(r.answers, 1);
    assert.equal(r.timeouts, 0);
  } finally {
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});

test('watchdog: 缺失文件静默降级不告警', () => {
  const r = checkSynthesisHealth({ filePath: join(tmpdir(), 'watchdog-missing.jsonl'), windowMs: WINDOW, now: NOW });
  assert.equal(r.triggered, false);
  assert.equal(r.answers, 0);
});

test('watchdog: 非 answer 事件与坏行忽略', () => {
  const file = fixture([
    { id: 'r', timestamp: NOW - 1_000, type: 'route', route: {} },
    { id: 'bad', timestamp: NOW - 1_000, type: 'answer', answer: { gateTriggered: 'none' } },
    'not-json',
  ]);
  try {
    const r = checkSynthesisHealth({ filePath: file, windowMs: WINDOW, now: NOW });
    assert.equal(r.triggered, false);
    assert.equal(r.answers, 1);
    assert.equal(r.timeouts, 0);
  } finally {
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});

test('watchdog: 单次超时即 100% 占比，按阈值语义告警', () => {
  const file = fixture([answer(NOW - 1_000, 'synthesis_timeout')]);
  try {
    const r = checkSynthesisHealth({ filePath: file, windowMs: WINDOW, now: NOW });
    assert.equal(r.triggered, true);
    assert.equal(r.ratio, 1);
  } finally {
    rmSync(join(file, '..'), { recursive: true, force: true });
  }
});
