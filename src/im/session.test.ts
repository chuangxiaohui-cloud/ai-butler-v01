import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ImSessionMapper } from './session.js';

test('im-session: 同一用户/群映射稳定 conversationId（重启可复现）', () => {
  const mapper = new ImSessionMapper();
  const msg = { platform: 'wechat' as const, sessionKey: 'wx_zhang' };
  const first = mapper.conversationIdFor(msg);
  const second = mapper.conversationIdFor(msg);
  assert.equal(first, second);
  assert.match(first, /^im-wechat-/);
});

test('im-session: 不同用户/群互相隔离（会话隔离 §4.5）', () => {
  const mapper = new ImSessionMapper();
  const a = mapper.conversationIdFor({ platform: 'wechat', sessionKey: 'wx_userA' });
  const b = mapper.conversationIdFor({ platform: 'wechat', sessionKey: 'wx_userB' });
  assert.notEqual(a, b);

  // 同 sessionKey 跨平台也隔离
  const feishu = mapper.conversationIdFor({ platform: 'feishu', sessionKey: 'wx_userA' });
  assert.notEqual(a, feishu);

  // 群会话与个人会话隔离
  const group = mapper.conversationIdFor({ platform: 'wechat', sessionKey: 'grp_team' });
  const personal = mapper.conversationIdFor({ platform: 'wechat', sessionKey: 'team' });
  assert.notEqual(group, personal);
});
