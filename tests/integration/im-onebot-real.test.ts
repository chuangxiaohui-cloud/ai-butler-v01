/**
 * E241 集成测试：OneBot 11 真实协议端到端。
 * 本地 mock OneBot server（真实 HTTP/JSON：接收 send API、模拟 NapCat 上报事件），
 * 验证 适配器 → ImService（复用 pipeline 契约的 stub ask）→ 输出适配 → send API 回发。
 * 协议级真实；真实 QQ 登录态（NapCat 实例）需用户配置后使用。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OneBotChannel } from '../../src/im/onebot/adapter.js';
import { ImGate } from '../../src/im/gate.js';
import { ImService } from '../../src/im/service.js';
import type { OneBotApiResponse } from '../../src/im/onebot/types.js';

let gateSeq = 0;
function freshGate(): ImGate {
  return new ImGate(join(tmpdir(), `im-gate-it-${process.pid}-${gateSeq++}.json`));
}

interface MockOneBot {
  server: Server;
  received: Array<{ endpoint: string; body: Record<string, unknown> }>;
  url: string;
}

async function startMockOneBot(): Promise<MockOneBot> {
  const received: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const endpoint = req.url ?? '';
      if ((endpoint === '/send_private_msg' || endpoint === '/send_group_msg') && req.method === 'POST') {
        received.push({ endpoint, body: JSON.parse(body || '{}') });
        const ok: OneBotApiResponse = { status: 'ok', retcode: 0, data: { message_id: received.length } };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ok));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return { server, received, url: `http://127.0.0.1:${addr.port}` };
}

async function report(channelPort: number, event: Record<string, unknown>): Promise<number> {
  const resp = await fetch(`http://127.0.0.1:${channelPort}/onebot/qq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer it-token' },
    body: JSON.stringify(event),
  });
  return resp.status;
}

async function withChannel(
  mock: MockOneBot,
  gate: ImGate,
  askText: string,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const channel = new OneBotChannel({
    httpApiBase: mock.url,
    listenHost: '127.0.0.1',
    listenPort: 18792,
    listenPath: '/onebot/qq',
    accessToken: 'it-token',
  });
  const service = new ImService({
    ask: async (text, conversationId) => {
      assert.ok(conversationId.length > 0);
      return { answer: `${askText}：${text}` };
    },
    gate,
  });
  channel.onMessage(async (message) => {
    const result = await service.route(message);
    return result.ok && result.reply ? result.reply : null;
  });
  await channel.start();
  try {
    await fn(18792);
  } finally {
    await channel.stop();
  }
}

test('INT-IM-001：私聊消息 → pipeline 回复 → send_private_msg', async () => {
  const mock = await startMockOneBot();
  try {
    const gate = freshGate();
    gate.enable('qq');
    await withChannel(mock, gate, '回答', async (port) => {
      const status = await report(port, {
        post_type: 'message',
        message_type: 'private',
        user_id: 10001,
        message: 'STM32F103 主频是多少',
      });
      assert.equal(status, 200);
      assert.equal(mock.received.length, 1);
      assert.equal(mock.received[0].endpoint, '/send_private_msg');
      assert.equal(mock.received[0].body.user_id, 10001);
      assert.equal(mock.received[0].body.message, '回答：STM32F103 主频是多少');
    });
  } finally {
    mock.server.close();
  }
});

test('INT-IM-002：群消息 → send_group_msg（会话按群隔离）', async () => {
  const mock = await startMockOneBot();
  try {
    const gate = freshGate();
    gate.enable('qq');
    await withChannel(mock, gate, '答', async (port) => {
      const status = await report(port, {
        post_type: 'message',
        message_type: 'group',
        group_id: 8888,
        user_id: 10002,
        message: [{ type: 'at', data: { qq: 'self' } }, { type: 'text', data: { text: '帮忙查个芯片' } }],
      });
      assert.equal(status, 200);
      assert.equal(mock.received.length, 1);
      assert.equal(mock.received[0].endpoint, '/send_group_msg');
      assert.equal(mock.received[0].body.group_id, 8888);
      assert.equal(mock.received[0].body.message, '答：帮忙查个芯片');
    });
  } finally {
    mock.server.close();
  }
});

test('INT-IM-003：gate 未授权不回复；鉴权失败 401', async () => {
  const mock = await startMockOneBot();
  try {
    const gate = freshGate(); // 默认全关（§4.5 授权开关）
    await withChannel(mock, gate, 'x', async (port) => {
      const status = await report(port, {
        post_type: 'message',
        message_type: 'private',
        user_id: 10003,
        message: 'hi',
      });
      assert.equal(status, 200);
      assert.equal(mock.received.length, 0);

      const unauthorized = await fetch(`http://127.0.0.1:${port}/onebot/qq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify({ post_type: 'message', message_type: 'private', user_id: 1, message: 'hi' }),
      });
      assert.equal(unauthorized.status, 401);
      assert.equal(mock.received.length, 0);
    });
  } finally {
    mock.server.close();
  }
});

test('INT-IM-004：长回复触发输出适配截断（[P-123]）', async () => {
  const mock = await startMockOneBot();
  try {
    const gate = freshGate();
    gate.enable('qq');
    const longAnswer = '答：' + '字'.repeat(600);
    const channel = new OneBotChannel({
      httpApiBase: mock.url,
      listenHost: '127.0.0.1',
      listenPort: 18793,
      listenPath: '/onebot/qq',
      accessToken: 'it-token',
    });
    const service = new ImService({
      ask: async () => ({ answer: longAnswer }),
      gate,
    });
    channel.onMessage(async (message) => {
      const result = await service.route(message);
      return result.ok && result.reply ? result.reply : null;
    });
    await channel.start();
    try {
      await report(18793, {
        post_type: 'message',
        message_type: 'private',
        user_id: 10004,
        message: '来一份长报告',
      });
      assert.equal(mock.received.length, 1);
      const sent = mock.received[0].body.message as string;
      assert.ok(sent.length < longAnswer.length);
      assert.match(sent, /已截断/);
    } finally {
      await channel.stop();
    }
  } finally {
    mock.server.close();
  }
});
