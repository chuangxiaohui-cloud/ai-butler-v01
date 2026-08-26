import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OneBotChannel, parseOneBotEvent } from './adapter.js';
import type { OneBotChannelConfig } from './types.js';

const baseCfg: OneBotChannelConfig = {
  httpApiBase: 'http://127.0.0.1:3000',
  listenHost: '127.0.0.1',
  listenPort: 8791,
  listenPath: '/onebot/qq',
  accessToken: 'secret-token',
};

test('E241: parseOneBotEvent 私聊字符串消息 → ImInboundMessage', () => {
  const msg = parseOneBotEvent({
    post_type: 'message',
    message_type: 'private',
    user_id: 10001,
    message_id: 7,
    message: 'STM32 主频 [CQ:face,id=1]',
    time: 1700000000,
  });
  assert.ok(msg);
  assert.equal(msg.platform, 'qq');
  assert.equal(msg.sessionKey, 'private:10001');
  assert.equal(msg.isGroup, false);
  assert.equal(msg.text, 'STM32 主频');
  assert.equal(msg.ts, 1700000000000);
});

test('E241: parseOneBotEvent 群消息段数组 → sessionKey 隔离群', () => {
  const msg = parseOneBotEvent({
    post_type: 'message',
    message_type: 'group',
    group_id: 888,
    user_id: 10002,
    message: [{ type: 'text', data: { text: '你好' } }, { type: 'image', data: { file: 'x.png' } }],
  });
  assert.ok(msg);
  assert.equal(msg.sessionKey, 'group:888');
  assert.equal(msg.isGroup, true);
  assert.equal(msg.text, '你好');
});

test('E241: parseOneBotEvent 非 message 事件 / 空文本返回 null', () => {
  assert.equal(parseOneBotEvent({ post_type: 'notice', notice_type: 'group_upload' } as never), null);
  assert.equal(parseOneBotEvent({ post_type: 'message', message_type: 'private', user_id: 1, message: '[CQ:image,file=x]' }), null);
  assert.equal(parseOneBotEvent({ post_type: 'message', message: 'no message_type' }), null);
  assert.equal(parseOneBotEvent(null as never), null);
});

test('E241: OneBotChannel 构造校验必填项（§10 accessToken）', () => {
  assert.throws(() => new OneBotChannel({ ...baseCfg, accessToken: '' }), /accessToken 必填/);
  assert.throws(() => new OneBotChannel({ ...baseCfg, httpApiBase: '' }), /httpApiBase 与 listenPort 必填/);
  assert.throws(() => new OneBotChannel({ ...baseCfg, listenPort: 0 }), /httpApiBase 与 listenPort 必填/);
});

test('E241: OneBotChannel.send 调 send_private_msg（Bearer 鉴权）', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const channel = new OneBotChannel(baseCfg, { fetcher: fetcher as typeof fetch });
  const result = await channel.send({ text: '回复' }, {
    id: 'x', platform: 'qq', sessionKey: 'private:10001', isGroup: false, text: 'q', ts: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/send_private_msg');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer secret-token');
  assert.equal(JSON.parse(String(calls[0].init.body)).user_id, 10001);
  assert.equal(JSON.parse(String(calls[0].init.body)).message, '回复');
});

test('E241: OneBotChannel.send 群消息调 send_group_msg，API 失败返回 error', async () => {
  const fetcher = async () =>
    new Response(JSON.stringify({ status: 'failed', retcode: 100, wording: '账号离线' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const channel = new OneBotChannel(baseCfg, { fetcher: fetcher as typeof fetch });
  const ok = await channel.send({ text: 'r' }, {
    id: 'x', platform: 'qq', sessionKey: 'group:888', isGroup: true, text: 'q', ts: 1,
  });
  assert.equal(ok.ok, false);
  assert.match(ok.error ?? '', /账号离线/);
});

test('E241: OneBotChannel HTTP 上报端到端（真实 server + 鉴权 + 回复链路）', async () => {
  const sent: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    if (url.endsWith('/send_private_msg')) sent.push(JSON.parse(String(init.body)).message as string);
    return new Response(JSON.stringify({ status: 'ok', retcode: 0, data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const port = 18791;
  const ch = new OneBotChannel({ ...baseCfg, listenPort: port, accessToken: 't' }, { fetcher: fetcher as typeof fetch });
  ch.onMessage(async (m) => ({ text: `已收到：${m.text}`, confidence: 0.5 }));
  await ch.start();
  try {
    const bad = await fetch(`http://127.0.0.1:${port}/onebot/qq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ post_type: 'message', message_type: 'private', user_id: 1, message: 'hi' }),
    });
    assert.equal(bad.status, 401);
    const good = await fetch(`http://127.0.0.1:${port}/onebot/qq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify({ post_type: 'message', message_type: 'private', user_id: 42, message: '你好' }),
    });
    assert.equal(good.status, 200);
    assert.deepEqual(sent, ['已收到：你好']);
  } finally {
    await ch.stop();
  }
});
