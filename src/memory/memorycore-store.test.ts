import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { MemoryCoreStore } from './memorycore-store.js';

function fakeFetch(calls: Array<{ path: string; body: unknown }>, response: unknown) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = typeof input === 'string' ? input : (input as URL).toString();
    calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    return new Response(
      JSON.stringify({ code: 0, message: 'ok', request_id: 'req-1', data: response }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
}

test('memorycore-store: put 调用 /v3/conversation/add 并返回 id', async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch(calls, {
    accepted_ids: ['msg-abc'],
    accepted_versions: ['v1'],
    total_count: 2,
  }) as typeof fetch;
  try {
    const store = new MemoryCoreStore('http://127.0.0.1:8420');
    const id = await store.put({
      session_id: 's1',
      query: 'q',
      answer: 'a',
      confidence: 0.9,
      evidence_hash: 'h',
      timestamp: 123,
    });
    assert.equal(id, 'msg-abc');
    assert.equal(calls[0].path, 'http://127.0.0.1:8420/v3/conversation/add');
    const body = calls[0].body as { messages: Array<{ role: string; content: string }>; session_id: string };
    assert.equal(body.session_id, 's1');
    assert.equal(body.messages[0].content, 'q');
    assert.equal(body.messages[1].content, 'a');
  } finally {
    globalThis.fetch = original;
  }
});

test('memorycore-store: recall 将 user/assistant 消息对映射回 MemoryRecord', async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch(calls, {
    messages: [
      // 模拟 MemoryCore 实际返回的倒序（assistant 在前）
      { role: 'assistant', content: 'a1', id: 'm2', timestamp: '2026-08-12T00:00:01Z' },
      { role: 'user', content: 'q1', id: 'm1', timestamp: '2026-08-12T00:00:00Z' },
    ],
    total: 2,
  }) as typeof fetch;
  try {
    const store = new MemoryCoreStore('http://127.0.0.1:8420');
    const records = await store.recall('s1', 5);
    assert.equal(records.length, 1);
    assert.equal(records[0].query, 'q1');
    assert.equal(records[0].answer, 'a1');
    assert.equal((calls[0].body as { session_id: string }).session_id, 's1');
  } finally {
    globalThis.fetch = original;
  }
});

test('memorycore-store: forget 调用删除接口', async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch(calls, { deleted_count: 1 }) as typeof fetch;
  try {
    const store = new MemoryCoreStore('http://127.0.0.1:8420');
    await store.forget('s1');
    assert.ok(calls[0].path.endsWith('/v3/conversation/delete'));
  } finally {
    globalThis.fetch = original;
  }
});
