import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { RouteCaseStore } from '../agent/route-case-store.js';
import { routeV2 } from '../agent/router-v2.js';
import { ExperienceManager } from '../memory/experience.js';
import { SessionContextStore } from '../memory/session-context.js';
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
import { resetBochaBalanceCache } from '../search/balance.js';

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
      if (system.includes('日程')) {
        return JSON.stringify({
          actionType: 'query',
          targetDomain: 'schedule',
          scope: 'atomic',
          requiresExternalSearch: false,
          searchSourceHint: 'local_skill',
          hasImplicitContext: false,
          urgency: 'normal',
          rawEntities: [],
          ambiguityFlags: [],
          hasImage: false,
          hasDocument: false,
          attachmentTypes: [],
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
      // 不带 modelId：走注入的 fake LLM（带 modelId 时按 E269 用所选 provider:role 真实客户端）
      body: JSON.stringify({ query: 'STM32F103C8T6 主频是多少' }),
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

test('gateway: /api/ask 斜杠命令 /context 返回会话状态', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gw-slash-'));
  const store = new SessionContextStore({ dir });
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    sessionContext: store,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await store.append('c1', 'user', '第一轮');
    await store.append('c1', 'assistant', '回答一');
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '/context', conversationId: 'c1' }),
    });
    const body = (await resp.json()) as { answer?: string; slash?: string; gate_triggered?: string };
    assert.equal(resp.status, 200);
    assert.equal(body.slash, 'context');
    assert.ok(body.answer?.includes('2'), body.answer);
    assert.equal(body.gate_triggered, 'none');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/ask 斜杠命令 /compact 压缩窗口外轮次', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gw-slash-'));
  const store = new SessionContextStore({ dir });
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    sessionContext: store,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 8; i++) {
      await store.append('c1', i % 2 === 0 ? 'user' : 'assistant', `第 ${i + 1} 轮`);
    }
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '/compact', conversationId: 'c1' }),
    });
    const body = (await resp.json()) as { answer?: string; slash?: string };
    assert.equal(resp.status, 200);
    assert.equal(body.slash, 'compact');
    assert.ok(body.answer?.includes('已手动压缩'), body.answer);
    const ctx = await store.load('c1');
    assert.equal(ctx?.turns.length, 5, '窗口内 5 轮保留原文');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
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
      assert.match(item.id, /^[a-z]+:(light|medium|heavy|vision)$/);
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

test('gateway: GATEWAY_AUTH_TOKEN 设置后写端点要求鉴权', async () => {
  const old = process.env.GATEWAY_AUTH_TOKEN;
  process.env.GATEWAY_AUTH_TOKEN = 'test-secret-token';
  try {
    const dir = mkdtempSync(join(tmpdir(), 'gateway-auth-'));
    const file = join(dir, 'security-config.json');
    const app = createGatewayApp({ deps: testDeps(), securityConfigPath: file });
    const server = createServer(app);
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;
      // 未带 token：写端点必须 401
      const persist = await fetch(`${base}/api/security/persist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shellEnabled: true }),
      });
      assert.equal(persist.status, 401, 'security/persist 未鉴权应 401');
      const ask = await fetch(`${base}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'hi' }),
      });
      assert.equal(ask.status, 401, '/api/ask 未鉴权应 401');
      const forget = await fetch(`${base}/api/memory/forget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'fact:1', type: 'fact' }),
      });
      assert.equal(forget.status, 401, 'memory/forget 未鉴权应 401');
      // 带 token：可写
      const ok = await fetch(`${base}/api/security/persist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-secret-token',
        },
        body: JSON.stringify({ shellEnabled: true }),
      });
      assert.equal(ok.status, 200);
    } finally {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    if (old === undefined) delete process.env.GATEWAY_AUTH_TOKEN;
    else process.env.GATEWAY_AUTH_TOKEN = old;
  }
});

test('gateway: 终端白名单 default-deny（空列表拒绝所有命令）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-deny-'));
  const file = join(dir, 'security-config.json');
  writeSecurityConfig(
    {
      shellEnabled: true,
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
    const execResp = await fetch(`${base}/api/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'git status' }),
    });
    assert.equal(execResp.status, 403);
    const body = (await execResp.json()) as { error?: string };
    assert.ok(body.error?.includes('白名单为空'), body.error);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: 终端硬拒绝危险命令（rm -rf 根目录）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-harddeny-'));
  const file = join(dir, 'security-config.json');
  writeSecurityConfig(
    {
      shellEnabled: true,
      fileAccess: 'project-only',
      externalApiEnabled: false,
      illegalEnabled: true,
      personalEmergencyEnabled: true,
      propertyEmergencyEnabled: true,
      allowedCommandPrefixes: ['git', 'rm'],
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
      body: JSON.stringify({ command: 'rm -rf /' }),
    });
    assert.equal(execResp.status, 403);
    const body = (await execResp.json()) as { error?: string };
    assert.ok(body.error?.includes('安全策略拒绝'), body.error);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: 解释器通道需白名单显式放行（node -e）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-interp-'));
  const file = join(dir, 'security-config.json');
  const makeApp = (prefixes: string[]) => {
    writeSecurityConfig(
      {
        shellEnabled: true,
        fileAccess: 'project-only',
        externalApiEnabled: false,
        illegalEnabled: true,
        personalEmergencyEnabled: true,
        propertyEmergencyEnabled: true,
        allowedCommandPrefixes: prefixes,
      },
      file,
    );
    return createGatewayApp({ deps: testDeps(), securityConfigPath: file });
  };
  const run = async (app: ReturnType<typeof createGatewayApp>, command: string) => {
    const server = createServer(app);
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      return await fetch(`http://127.0.0.1:${port}/api/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
    } finally {
      server.close();
    }
  };
  try {
    // 只白名单 "node"：node -e 仍应被拒（解释器通道需显式写全）
    const denied = await run(makeApp(['node']), 'node -e process.stdout.write("x")');
    assert.equal(denied.status, 403);
    const body = (await denied.json()) as { error?: string };
    assert.ok(body.error?.includes('显式配置'), body.error);
    // 白名单写全 "node -e"：放行并真实执行
    const allowed = await run(makeApp(['node -e']), 'node -e process.stdout.write("x")');
    assert.equal(allowed.status, 200);
    const result = (await allowed.json()) as { stdout?: string; exitCode?: number };
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout?.includes('x'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/mail/credentials 读写且不暴露密码', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-mail-'));
  const file = join(dir, 'mail-credentials.json');
  const app = createGatewayApp({ deps: testDeps(), mailCredentialsPath: file });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    const emptyResp = await fetch(`${base}/api/mail/credentials`);
    const empty = (await emptyResp.json()) as { configured?: boolean };
    assert.equal(empty.configured, false);

    const badResp = await fetch(`${base}/api/mail/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'smtp.qq.com', port: 465, secure: true, user: 'a@qq.com' }),
    });
    assert.equal(badResp.status, 400);

    const saveResp = await fetch(`${base}/api/mail/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: 'smtp.qq.com',
        port: 465,
        secure: true,
        user: 'a@qq.com',
        pass: 'secret-auth-code',
        from: 'a@qq.com',
      }),
    });
    assert.equal(((await saveResp.json()) as { ok?: boolean }).ok, true);

    const getResp = await fetch(`${base}/api/mail/credentials`);
    const got = (await getResp.json()) as Record<string, unknown>;
    assert.equal(got.configured, true);
    assert.equal(got.host, 'smtp.qq.com');
    assert.equal(got.user, 'a@qq.com');
    assert.equal(got.from, 'a@qq.com');
    assert.ok(!('pass' in got), '不得暴露密码字段');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/calendar 导入 ICS 并导出', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-cal-'));
  const dbPath = join(dir, 'calendar.db');
  const app = createGatewayApp({ deps: testDeps(), calendarDbPath: dbPath });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    const emptyResp = await fetch(`${base}/api/calendar/export`);
    assert.equal(emptyResp.status, 404);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:gw-test-1@example.com',
      'DTSTAMP:20260822T000000Z',
      'DTSTART:20260823T100000Z',
      'SUMMARY:网关导入测试',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const importResp = await fetch(`${base}/api/calendar/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ics }),
    });
    const imported = (await importResp.json()) as {
      ok?: boolean;
      imported?: number;
      skipped?: number;
    };
    assert.equal(imported.ok, true);
    assert.equal(imported.imported, 1);
    assert.equal(imported.skipped, 0);

    const exportResp = await fetch(`${base}/api/calendar/export`);
    assert.equal(exportResp.status, 200);
    const text = await exportResp.text();
    assert.ok(text.includes('BEGIN:VCALENDAR'));
    assert.ok(text.includes('SUMMARY:网关导入测试'));

    const emptyIcsResp = await fetch(`${base}/api/calendar/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ics: 'not-an-ics' }),
    });
    assert.equal(emptyIcsResp.status, 400);
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
  assert.ok(events.includes('artifact'));
});

test('gateway: 静态 UI 目录同源托管且不回退 API', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-ui-dist-'));
  writeFileSync(join(dir, 'index.html'), '<div id="root">one-person-agent</div>', 'utf-8');
  const app = createGatewayApp({ deps: testDeps(), uiDistPath: dir });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const root = await fetch(`${base}/`);
    assert.equal(root.status, 200);
    assert.ok((await root.text()).includes('one-person-agent'));
    const spa = await fetch(`${base}/some/client/route`);
    assert.equal(spa.status, 200);
    assert.ok((await spa.text()).includes('one-person-agent'));
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as { ok?: boolean };
    assert.equal(body.ok, true);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/bocha/balance 返回余额与告警（§D.3）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-bocha-balance-'));
  const cacheFile = join(dir, 'bocha-balance.json');
  writeFileSync(
    cacheFile,
    JSON.stringify({ remainingYuan: 2.8, remainingCalls: 777, fetchedAt: new Date().toISOString() }),
    'utf-8',
  );
  process.env.BOCHA_BALANCE_CACHE = cacheFile;
  resetBochaBalanceCache();
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/bocha/balance`);
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok?: boolean;
      remainingYuan?: number;
      remainingCalls?: number;
      notice?: string | null;
    };
    assert.equal(body.ok, true);
    assert.equal(body.remainingYuan, 2.8);
    assert.equal(body.remainingCalls, 777);
    assert.equal(body.notice, null);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
