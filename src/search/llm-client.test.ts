import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LLMLengthTruncatedError,
  OpenAiCompatibleClient,
  stripThinkBlock,
} from './llm-client.js';

describe('llm-client: stripThinkBlock（deepseek 思考块剥离，E238）', () => {
  it('剥离前导 <think> 推理块', () => {
    assert.equal(stripThinkBlock('<think>推理过程</think>\n\n最终答案'), '最终答案');
  });
  it('无 think 块时原样返回', () => {
    assert.equal(stripThinkBlock('普通答案'), '普通答案');
  });
  it('只有 think 块时保留原文避免空答案', () => {
    assert.equal(stripThinkBlock('<think>只有推理</think>'), '<think>只有推理</think>');
  });
});

describe('llm-client: 外部取消信号（P17 总预算透传）', () => {
  const makeClient = () =>
    new OpenAiCompatibleClient({
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      timeoutMs: 30_000,
      provider: 'test',
    });

  it('已中止的 signal 立即拒绝，不发网络请求', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = makeClient();
    await assert.rejects(
      () => client.complete([{ role: 'user', content: 'hi' }], { signal: controller.signal }),
      (err: unknown) => err instanceof Error && err.name === 'AbortError',
    );
  });
});

describe('llm-client: finish_reason=length 截断检测（E274）', () => {
  const makeClient = () =>
    new OpenAiCompatibleClient({
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      timeoutMs: 30_000,
      provider: 'test',
    });

  it('rejectOnTruncate 时抛 LLMLengthTruncatedError，默认原样返回', async () => {
    const original = globalThis.fetch;
    const client = makeClient();
    try {
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
          choices: [{ message: { content: '半截回答' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch;
      await assert.rejects(
        () =>
          client.complete([{ role: 'user', content: 'hi' }], {
            maxTokens: 800,
            rejectOnTruncate: true,
          }),
        (err: unknown) => err instanceof LLMLengthTruncatedError,
      );
      const plain = await client.complete([{ role: 'user', content: 'hi' }], {
        maxTokens: 800,
      });
      assert.equal(plain, '半截回答');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('finish_reason=stop 时 rejectOnTruncate 不影响返回（含 think 剥离）', async () => {
    const original = globalThis.fetch;
    const client = makeClient();
    try {
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
          choices: [
            {
              message: { content: '<think>推理过程</think>\n完整回答' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch;
      const text = await client.complete([{ role: 'user', content: 'hi' }], {
        maxTokens: 800,
        rejectOnTruncate: true,
      });
      assert.equal(text, '完整回答');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('llm-client: 流式输出（onToken，P0）', () => {
  const makeClient = () =>
    new OpenAiCompatibleClient({
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      timeoutMs: 30_000,
      provider: 'test',
    });

  function sseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  it('逐块回调可见增量（抑制 think 块），返回剥离后全量文本', async () => {
    const original = globalThis.fetch;
    const client = makeClient();
    const deltas: string[] = [];
    try {
      globalThis.fetch = (async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"<think>推理过程"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"</think>最终"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"答案"}}]}\n\n',
          'data: [DONE]\n\n',
        ])) as typeof fetch;
      const text = await client.complete([{ role: 'user', content: 'hi' }], {
        onToken: (d) => deltas.push(d),
      });
      assert.equal(text, '最终答案');
      assert.deepEqual(deltas, ['最终', '答案']);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('流式 finish_reason=length 且 rejectOnTruncate 时抛 LLMLengthTruncatedError', async () => {
    const original = globalThis.fetch;
    const client = makeClient();
    try {
      globalThis.fetch = (async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"半截回答"},"finish_reason":null}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
          'data: [DONE]\n\n',
        ])) as typeof fetch;
      await assert.rejects(
        () =>
          client.complete([{ role: 'user', content: 'hi' }], {
            onToken: () => {},
            rejectOnTruncate: true,
          }),
        (err: unknown) => err instanceof LLMLengthTruncatedError,
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it('流式请求带 stream:true + stream_options，非流式不带', async () => {
    const original = globalThis.fetch;
    const client = makeClient();
    const bodies: string[] = [];
    try {
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''));
        if (String(init?.body ?? '').includes('"stream":true')) {
          return sseResponse([
            'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
            'data: [DONE]\n\n',
          ]);
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '好' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch;
      await client.complete([{ role: 'user', content: 'hi' }], { onToken: () => {} });
      await client.complete([{ role: 'user', content: 'hi' }]);
      assert.equal(bodies.length, 2);
      assert.ok(bodies[0].includes('"stream":true'));
      assert.ok(bodies[0].includes('"stream_options":{"include_usage":true}'));
      assert.ok(!bodies[1].includes('"stream":true'));
    } finally {
      globalThis.fetch = original;
    }
  });
});
