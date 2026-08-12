import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { logSearchRequest, readSearchMetrics } from './metrics.js';

test('metrics: 按请求记录 bocha_ms/anysearch_ms/timeout 字段', () => {
  const dir = mkdtempSync(join(tmpdir(), 'metrics-test-'));
  const logPath = join(dir, 'search-metrics.jsonl');
  try {
    logSearchRequest(
      {
        ts: '2026-08-12T00:00:00Z',
        query: 'q1',
        bocha_ms: 148,
        bocha_ok: true,
        anysearch_ms: null,
        anysearch_ok: false,
        timeout: true,
        degraded: false,
      },
      logPath,
    );
    const metrics = readSearchMetrics(logPath);
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].bocha_ms, 148);
    assert.equal(metrics[0].bocha_ok, true);
    assert.equal(metrics[0].anysearch_ms, null);
    assert.equal(metrics[0].anysearch_ok, false);
    assert.equal(metrics[0].timeout, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
