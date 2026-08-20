import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildCompanionReply } from './companion-reply.js';

test('companion-reply: 陪伴回复不推 App、不提搜索', () => {
  const out = buildCompanionReply('今天心情不好，陪我聊聊天。');
  assert.ok(out.includes('我在呢'));
  assert.ok(out.includes('慢慢说'));
  assert.ok(!out.includes('App'));
});

test('companion-reply: 工作话题优先接工作情绪', () => {
  const out = buildCompanionReply('项目又延期了，心里很烦。');
  assert.ok(out.includes('工作上的事'));
});
