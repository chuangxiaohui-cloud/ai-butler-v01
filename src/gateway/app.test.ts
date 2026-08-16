import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { RouteCaseStore } from '../agent/route-case-store.js';
import { routeV2 } from '../agent/router-v2.js';
import { ExperienceManager } from '../memory/experience.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { writeSecurityConfig } from '../config/security-config.js';
import { subscribeArtifactEvents } from './artifact-bus.js';
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
      if (system.includes('这个图')) {
        return JSON.stringify({
          actionType: 'qa',
          targetDomain: 'unknown',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'none',
          hasImplicitContext: true,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: ['missing_referent'],
          hasImage: true,
          hasDocument: false,
          attachmentTypes: ['image/png'],
        });
      }
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
    skillDeps: {
      callVLM: async () => '截图：对话界面，含表格与代码块。',
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
      mode?: string;
    };
    assert.equal(resp.status, 200);
    assert.equal(body.query, 'STM32F103C8T6 主频是多少');
    assert.ok(body.answer?.includes('测试答案'));
    assert.equal(typeof body.confidence, 'number');
    assert.ok(['none', 'emergency', 'low_confidence', 'safety'].includes(body.gate_triggered ?? ''));
    assert.equal(body.mode, 'knowledge');
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

test('gateway: /api/ask 接收图片附件并走 VLM Skill', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '这个图是什么',
        attachments: [
          {
            name: 'shot.png',
            type: 'image/png',
            dataUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
        ],
      }),
    });
    const body = (await resp.json()) as { answer?: string };
    assert.equal(resp.status, 200);
    assert.ok(body.answer?.includes('对话界面'), JSON.stringify(body));
  } finally {
    server.close();
  }
});

test('gateway: 路由校准 cases / batch-mark / export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-routing-'));
  const store = new RouteCaseStore(join(dir, 'route-cases.jsonl'));
  const id = store.record(routeV2('帮我写一份 PRD'), { source: 'seed' });
  const app = createGatewayApp({ deps: testDeps(), routeCaseStore: store });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    const listResp = await fetch(`${base}/api/routing/cases`);
    const list = (await listResp.json()) as { total?: number; records?: Array<{ id: string }> };
    assert.equal(list.total, 1);
    assert.equal(list.records?.[0]?.id, id);

    const markResp = await fetch(`${base}/api/routing/batch-mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: [{ id, feedback: 'accept' }],
      }),
    });
    const mark = (await markResp.json()) as { updated?: string[] };
    assert.deepEqual(mark.updated, [id]);

    const exportResp = await fetch(`${base}/api/routing/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'csv' }),
    });
    const csv = await exportResp.text();
    assert.ok(csv.includes('id,timestamp,query'));
    assert.ok(csv.includes('帮我写一份 PRD'));
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/providers 返回状态，测试连接安全失败', async () => {
  const { server, base } = await startApp();
  try {
    const listResp = await fetch(`${base}/api/providers`);
    const list = (await listResp.json()) as {
      order?: string[];
      providers?: Array<{ id: string; label: string; configured: boolean }>;
    };
    assert.equal(listResp.status, 200);
    assert.ok(list.order?.includes('deepseek'));
    assert.ok((list.providers ?? []).some((p) => p.id === 'deepseek'));

    const testResp = await fetch(`${base}/api/providers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'missing' }),
    });
    const testBody = (await testResp.json()) as { ok?: boolean; error?: string };
    assert.equal(testBody.ok, false);
    assert.ok(testBody.error);

    const defaultResp = await fetch(`${base}/api/providers/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'nope' }),
    });
    assert.equal(defaultResp.status, 400);
  } finally {
    server.close();
  }
});

test('gateway: /api/skills 返回真实技能目录，非法禁用名单被拒', async () => {
  const { server, base } = await startApp();
  try {
    const listResp = await fetch(`${base}/api/skills`);
    const list = (await listResp.json()) as {
      total?: number;
      skills?: Array<{ name: string; version: string; enabled: boolean }>;
    };
    assert.equal(listResp.status, 200);
    assert.ok((list.total ?? 0) > 0);
    assert.ok((list.skills ?? []).some((s) => s.name === 'calendar-skill'));

    const syncResp = await fetch(`${base}/api/skills/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: ['not-a-skill'] }),
    });
    assert.equal(syncResp.status, 400);
  } finally {
    server.close();
  }
});

test('gateway: /api/usage/stats 返回聚合与预算', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/usage/stats`);
    const body = (await resp.json()) as {
      stats?: { todayTokens?: number; byModel?: Record<string, unknown> };
      budget?: { budgetYuan?: number | null; degradeAtPercent?: number };
    };
    assert.equal(resp.status, 200);
    assert.equal(typeof body.stats?.todayTokens, 'number');
    assert.equal(typeof body.budget?.degradeAtPercent, 'number');
  } finally {
    server.close();
  }
});

test('gateway: /api/memory 读取与遗忘', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-memory-'));
  const userContext = new UserContextStore(join(dir, 'user-context.db'));
  const experience = new ExperienceManager(join(dir, 'experience.db'));
  const now = Date.now();
  userContext.addFact('test-user', '用户偏好 A 区会议室', 'user_explicit', now);
  userContext.addSessionSummary('test-user', 's1', '讨论选型方案', ['选型'], now);
  experience.add({
    id: 'e1',
    skillName: 'chip-analysis',
    content: 'STM32F103C8T6 主频 72MHz',
    keywords: ['STM32'],
    createdAt: now,
    lastUsedAt: now,
  });
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    userContextStore: userContext,
    experienceManager: experience,
  });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const listResp = await fetch(`${base}/api/memory`);
    const list = (await listResp.json()) as { total?: number; items?: Array<{ id: string; type: string }> };
    assert.ok((list.total ?? 0) >= 3);
    const factId = list.items?.find((item) => item.type === 'fact')?.id ?? '';
    const expId = list.items?.find((item) => item.type === 'experience')?.id ?? '';

    const forgetResp = await fetch(`${base}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: factId, type: 'fact' }),
    });
    assert.equal(((await forgetResp.json()) as { ok?: boolean }).ok, true);

    const forgetExpResp = await fetch(`${base}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: expId, type: 'experience' }),
    });
    assert.equal(((await forgetExpResp.json()) as { ok?: boolean }).ok, true);
  } finally {
    server.close();
    userContext.close();
    experience.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/security 读取，Shell 关闭时终端 403', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-security-'));
  const file = join(dir, 'security-config.json');
  writeSecurityConfig(
    {
      shellEnabled: false,
      fileAccess: 'project-only',
      externalApiEnabled: false,
      illegalEnabled: true,
      personalEmergencyEnabled: true,
      propertyEmergencyEnabled: true,
      allowedCommandPrefixes: [],
    },
    file,
  );
  const app = createGatewayApp({ deps: testDeps(), securityConfigPath: file });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const secResp = await fetch(`${base}/api/security`);
    const sec = (await secResp.json()) as { shellEnabled?: boolean };
    assert.equal(sec.shellEnabled, false);

    const execResp = await fetch(`${base}/api/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'echo hi' }),
    });
    assert.equal(execResp.status, 403);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: 终端命令白名单拒绝未授权前缀', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-allowlist-'));
  const file = join(dir, 'security-config.json');
  writeSecurityConfig(
    {
      shellEnabled: true,
      fileAccess: 'project-only',
      externalApiEnabled: false,
      illegalEnabled: true,
      personalEmergencyEnabled: true,
      propertyEmergencyEnabled: true,
      allowedCommandPrefixes: ['git', 'npm'],
    },
    file,
  );
  const app = createGatewayApp({ deps: testDeps(), securityConfigPath: file });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const execResp = await fetch(`${base}/api/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'echo hi' }),
    });
    assert.equal(execResp.status, 403);
    const body = (await execResp.json()) as { error?: string };
    assert.ok(body.error?.includes('白名单'));
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/files 返回产物文件列表', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/files`);
    const body = (await resp.json()) as {
      total?: number;
      files?: Array<{ path: string; size: number; kind: string }>;
    };
    assert.equal(resp.status, 200);
    assert.equal(typeof body.total, 'number');
    assert.ok(Array.isArray(body.files));
    if ((body.files ?? []).length > 0) {
      assert.ok(body.files?.[0]?.path);
    }
  } finally {
    server.close();
  }
});

test('gateway: /api/ask 完成时发布 files_changed 事件', async () => {
  const events: string[] = [];
  const unsubscribe = subscribeArtifactEvents((event) => events.push(event.type));
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '查一下我今天的日程' }),
    });
    assert.equal(resp.status, 200);
  } finally {
    server.close();
    unsubscribe();
  }
  assert.ok(events.includes('files_changed'));
  assert.ok(events.includes('progress'));
});
