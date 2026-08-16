import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../search/llm.js';
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../search/providers/types.js';
import type { PipelineDeps } from '../search/pipeline.js';
import { createGatewayApp } from './app.js';

class FakeLLM implements LLMClient {
  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? '';
    if (system.includes('意图特征提取器')) {
      return JSON.stringify({
        actionType: 'query',
        targetDomain: 'search',
        scope: 'atomic',
        requiresExternalSearch: true,
        searchSourceHint: 'web_search',
        hasImplicitContext: false,
        urgency: 'normal',
        rawEntities: [],
        ambiguityFlags: [],
        hasImage: false,
        hasDocument: false,
        attachmentTypes: [],
      });
    }
    if (system.includes('搜索意图分类器')) {
      return JSON.stringify({
        intent: 'factual',
        search_query: 'STM32F103C8T6 主频',
        time_window: '不限',
        domain: '不限',
      });
    }
    return '根据证据，这是一个测试答案。';
  }
}

class FakeProvider implements SearchProvider {
  readonly id = 'bocha' as const;

  async search(query: string): Promise<SearchProviderResult> {
    return {
      provider: 'bocha',
      ok: true,
      results: [
        {
          title: 'STM32F103C8T6 数据手册',
          url: 'https://example.com/stm32',
          content: `${query} 完整 参数 说明 步骤 示例 设计 文档 100A `.repeat(5),
          provider: 'bocha',
        } satisfies SearchResultItem,
      ],
      latencyMs: 1,
    };
  }
}

function testDeps(): PipelineDeps {
  return {
    llm: new FakeLLM(),
    providers: [new FakeProvider()],
    quota: {
      take: async () => true,
    },
    memoryStore: {
      put: async () => '1',
      recall: async () => [],
    },
  };
}

async function startApp(): Promise<{ server: ReturnType<typeof createServer>; base: string }> {
  const app = createGatewayApp({ deps: testDeps(), defaultUserId: 'test-user' });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('gateway: /api/health 返回服务状态', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/health`);
    const body = (await resp.json()) as { ok?: boolean };
    assert.equal(resp.status, 200);
    assert.equal(body.ok, true);
  } finally {
    server.close();
  }
});

test('gateway: /api/ask 走同一 pipeline 并返回四字段契约', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'STM32F103C8T6 主频是多少', modelId: 'deepseek:heavy' }),
    });
    const body = (await resp.json()) as {
      query?: string;
      answer?: string;
      confidence?: number;
      gate_triggered?: string;
    };
    assert.equal(resp.status, 200);
    assert.equal(body.query, 'STM32F103C8T6 主频是多少');
    assert.ok(body.answer?.includes('测试答案'));
    assert.equal(typeof body.confidence, 'number');
    assert.ok(['none', 'emergency', 'low_confidence', 'safety'].includes(body.gate_triggered ?? ''));
  } finally {
    server.close();
  }
});

test('gateway: 空 query 返回 400 且不带原始错误', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    });
    const body = (await resp.json()) as { error?: string };
    assert.equal(resp.status, 400);
    assert.equal(body.error, 'query 不能为空');
  } finally {
    server.close();
  }
});

test('gateway: /api/model-providers 返回 UI 可用的模型目录', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/model-providers`);
    const body = (await resp.json()) as {
      models?: Array<{ id: string; provider: string; label: string; note: string }>;
    };
    assert.equal(resp.status, 200);
    assert.ok((body.models ?? []).length > 0);
    for (const item of body.models ?? []) {
      assert.match(item.id, /^[a-z]+:(light|medium|heavy)$/);
      assert.ok(item.provider);
      assert.ok(item.label);
    }
  } finally {
    server.close();
  }
});
