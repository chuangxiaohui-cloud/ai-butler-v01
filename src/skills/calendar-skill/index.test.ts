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
    const result = created.result as string;
    assert.ok(result.includes('已创建日程'));
    assert.ok(result.includes('明天上午十点'));

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
    const listedResult = listed.result as string;
    assert.ok(listedResult.includes('共 1 条日程'));
  } finally {
    skill.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
