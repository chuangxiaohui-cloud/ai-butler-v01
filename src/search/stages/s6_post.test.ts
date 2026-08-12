import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { postProcess } from './s6_post.js';

test('s6: 后处理写 L0 JSONL 并返回四字段', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'l0-test-'));
  const l0Path = join(dir, 'l0.jsonl');
  try {
    const r = await postProcess(
      {
        query: 'STM32F103C8T6 最大主频是多少',
        answer: '根据证据，最大主频是 72MHz。',
        confidence: 1.2,
        evidence: [
          {
            title: 't',
            url: 'https://example.com/1',
            domain: 'example.com',
            score: 0.89,
            type: '[soft]',
          },
        ],
        gateTriggered: 'none',
        elapsedMs: 1234,
      },
      { l0Path },
    );
    assert.equal(r.confidence, 1);
    assert.equal(r.evidenceHash.length, 16);
    assert.equal(r.l0Written, true);
    const lines = readFileSync(l0Path, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]) as { query: string; evidence_hash: string };
    assert.equal(record.query, 'STM32F103C8T6 最大主频是多少');
    assert.equal(record.evidence_hash, r.evidenceHash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
