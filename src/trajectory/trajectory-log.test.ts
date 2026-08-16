import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { TrajectoryLog } from './trajectory-log.js';

test('trajectory-log: 事件只追加不覆盖，且携带 id/timestamp/sessionId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trajectory-log-test-'));
  const file = join(dir, 'trajectory.jsonl');
  try {
    const log = new TrajectoryLog(file);
    log.record({
      type: 'route',
      sessionId: 's1',
      route: {
        decisionType: 'direct',
        primaryLens: 'secretary',
        intent: 'web_search',
        confidence: 0.9,
        matchedRules: ['R008'],
      },
    });
    log.record({
      type: 'answer',
      sessionId: 's1',
      answer: {
        answerSnippet: '测试答案',
        confidence: 0.9,
        gateTriggered: 'none',
        elapsedMs: 12,
      },
    });
    log.record({
      type: 'model_route',
      sessionId: 's1',
      modelRoute: {
        tier: 'medium',
        provider: 'deepseek',
        model: 'deepseek-chat',
        fallbacks: [{ from: 'deepseek', to: 'zhipu' }],
      },
    });

    const lines = readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .filter((line) => line.trim());
    assert.equal(lines.length, 3);
    for (const line of lines) {
      const event = JSON.parse(line) as {
        id: string;
        timestamp: number;
        type: string;
        sessionId: string;
      };
      assert.ok(event.id);
      assert.ok(Number.isFinite(event.timestamp));
      assert.equal(event.sessionId, 's1');
      assert.ok(['route', 'answer', 'model_route'].includes(event.type));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
