import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createImDispatchSkill } from './index.js';

test('im-dispatch: 消息写入待发送队列', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-dispatch-'));
  const skill = createImDispatchSkill({ dbPath: join(dir, 'messages.db') });
  const deps = { callVLM: async () => '' };
  try {
    const out = await skill.execute(
      {
        query: '发消息给老张，说明天下午开会',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'send_message' },
      },
      deps,
    );
    const result = out.result as {
      ok: boolean;
      recipient: string;
      content: string;
      status: string;
    };
    assert.equal(result.ok, true);
    assert.equal(result.recipient, '老张');
    assert.ok(result.content.includes('明天下午开会'));
    assert.equal(result.status, 'pending');
  } finally {
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
