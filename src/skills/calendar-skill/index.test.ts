import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createCalendarSkill } from './index.js';

test('calendar-skill: 创建日程并查询', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  const skill = createCalendarSkill({ dbPath: join(dir, 'calendar.db') });
  const deps = { callVLM: async () => '' };
  try {
    const created = await skill.execute(
      {
        query: '帮我安排明天上午十点的会议',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'create_calendar' },
      },
      deps,
    );
    const result = created.result as {
      ok: boolean;
      timeExpression: string;
      startAt: string;
    };
    assert.equal(result.ok, true);
    assert.ok(result.timeExpression.includes('明天'));
    assert.ok(result.startAt.includes('T'));

    const listed = await skill.execute(
      {
        query: '查一下我今天的日程',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mode: 'local_query' },
      },
      deps,
    );
    const listedResult = listed.result as { count: number };
    assert.equal(listedResult.count, 1);
  } finally {
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
