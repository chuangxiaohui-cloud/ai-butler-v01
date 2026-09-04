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
import { DecisionLog } from '../escalation/decision-log.js';
import { NotificationStore } from '../notifications/notification-store.js';
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

test('gateway: E324 第二刀 /api/decisions POST 批准带 resume → 自动恢复执行带回执（否决不执行）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-decision-resume-'));
  const logFile = join(dir, 'decision-log.jsonl');
  const store = new DecisionLog(logFile);
  const approvePending = store.record({
    trigger: 'human_arbitration',
    question: '⏸ 待批准：查主频',
    options: ['执行', '取消'],
    decision: 'pending',
    resume: { query: 'STM32F103C8T6 主频是多少', executor: 'project_writer' },
    conversationId: 'conv-gw-resume-approve',
    confidence: 0.6,
  });
  const rejectPending = store.record({
    trigger: 'human_arbitration',
    question: '⏸ 待批准：发周报',
    options: ['执行', '取消'],
    decision: 'pending',
    resume: { query: '帮我把周报发给张三', executor: 'office_daily' },
    conversationId: 'conv-gw-resume-reject',
    confidence: 0.7,
  });
  const app = createGatewayApp({
    deps: {
      ...testDeps(),
      sessionContext: new SessionContextStore({ dir: join(dir, 'session-context') }),
    },
    defaultUserId: 'test-user',
    decisionLog: store,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // 批准带 resume 的 pending：裁决记录 + 同一 pipeline 自动恢复执行，响应带回执
    const approve = await fetch(`${base}/api/decisions/${approvePending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', note: '面板批准' }),
    });
    assert.equal(approve.status, 200);
    const approveBody = (await approve.json()) as {
      ok?: boolean;
      resume?: { query?: string };
      executed?: { answer?: string; mode?: string; error?: string };
    };
    assert.equal(approveBody.ok, true);
    assert.equal(approveBody.resume?.query, 'STM32F103C8T6 主频是多少', '响应应带回 resume 载荷');
    assert.ok(approveBody.executed, '批准带 resume 的 pending 应自动恢复执行');
    assert.ok(approveBody.executed?.answer?.includes('测试答案'), approveBody.executed?.answer);
    assert.ok(!approveBody.executed?.answer?.includes('⏸'), '恢复执行不应二次挂起');
    assert.equal(approveBody.executed?.mode, 'knowledge');
    assert.equal(approveBody.executed?.error, undefined, '执行成功时无 error');

    // 否决带 resume 的 pending：仅记录，不触发恢复执行
    const reject = await fetch(`${base}/api/decisions/${rejectPending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject', note: '面板否决' }),
    });
    assert.equal(reject.status, 200);
    const rejectBody = (await reject.json()) as {
      ok?: boolean;
      resume?: { query?: string };
      executed?: unknown;
    };
    assert.equal(rejectBody.ok, true);
    assert.equal(rejectBody.resume?.query, '帮我把周报发给张三');
    assert.equal(rejectBody.executed, undefined, '否决不触发自动执行、无回执');

    assert.equal(store.openDecisions().length, 0, '两条待批均已被裁决，队列清空');
  } finally {
    server.close();
    store.close();
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
test('gateway: /api/notifications 返回通知列表（最新在前 + 优先级 + 摘要）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-notify-'));
  const logFile = join(dir, 'notifications.jsonl');
  const older = {
    id: 'n1',
    source: 'decision',
    role: '老板',
    kind: 'risk_decision',
    title: '待你裁决',
    detail: '选项 A/B',
    ts: '2026-09-02T08:00:00.000Z',
    createdAt: 1000,
  };
  const newer = {
    id: 'n2',
    source: 'usage',
    role: '秘书',
    kind: 'ai_ops_daily',
    title: 'AI 运营日报',
    detail: '今日 ¥0.07',
    ts: '2026-09-02T14:00:00.000Z',
    createdAt: 2000,
  };
  writeFileSync(logFile, `${JSON.stringify(older)}\n${JSON.stringify(newer)}\n`, 'utf-8');
  const store = new NotificationStore(logFile);
  const app = createGatewayApp({ deps: testDeps(), defaultUserId: 'test-user', notificationStore: store });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/api/notifications`);
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      entries?: Array<{ id: string; createdAt: number; priority: string }>;
      digest?: string;
    };
    assert.ok(body.entries, '应返回 entries');
    assert.equal(body.entries.length, 2);
    assert.equal(body.entries[0].id, 'n2', '最新在前');
    assert.equal(body.entries[0].priority, 'normal', 'AI 运营日报 → 普通');
    assert.equal(body.entries[1].priority, 'urgent', '待你裁决 → 紧急');
    assert.ok(body.digest?.includes('🔴 紧急'), body.digest);
    assert.ok(body.digest?.includes('AI 运营日报'), body.digest);
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/notifications 分页（E331：page/pageSize 切片 + total）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-notify-page-'));
  const logFile = join(dir, 'notifications.jsonl');
  const lines: string[] = [];
  for (let i = 1; i <= 25; i += 1) {
    lines.push(
      JSON.stringify({
        id: `n${i}`,
        source: 'skill',
        role: '秘书',
        kind: 'skill_run',
        title: `事件 ${i}`,
        ts: `2026-09-02T${String(i).padStart(2, '0')}:00:00.000Z`,
        createdAt: i * 1000,
      }),
    );
  }
  writeFileSync(logFile, lines.join('\n') + '\n', 'utf-8');
  const store = new NotificationStore(logFile);
  const app = createGatewayApp({ deps: testDeps(), defaultUserId: 'test-user', notificationStore: store });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const page2 = (await (
      await fetch(`http://127.0.0.1:${port}/api/notifications?page=2&pageSize=10`)
    ).json()) as { entries?: Array<{ id: string }>; total?: number };
    assert.equal(page2.total, 25, '应返回总数 25');
    assert.equal(page2.entries?.length, 10);
    assert.equal(page2.entries?.[0].id, 'n15', '第 2 页最新在前从第 11 新（n15）开始');
    assert.equal(page2.entries?.[9].id, 'n6', '第 2 页末尾 n6');
    const page3 = (await (
      await fetch(`http://127.0.0.1:${port}/api/notifications?page=3&pageSize=10`)
    ).json()) as { entries?: Array<{ id: string }> };
    assert.equal(page3.entries?.length, 5);
    assert.equal(page3.entries?.[0].id, 'n5');
    assert.equal(page3.entries?.[4].id, 'n1');
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/decisions 待裁决队列 + POST 批准/否决回填（E323）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-decision-'));
  const logFile = join(dir, 'decision-log.jsonl');
  const decidedOld = {
    id: 'd0',
    trigger: 'human_arbitration',
    question: '旧题',
    decision: 'pending',
    conversationId: 'conv-0',
    createdAt: 500,
  };
  const p1 = {
    id: 'd1',
    trigger: 'human_arbitration',
    question: '选 A 还是 B？',
    options: ['A', 'B'],
    decision: 'pending',
    conversationId: 'conv-1',
    confidence: 0.6,
    createdAt: 1000,
  };
  const p2 = {
    id: 'd2',
    trigger: 'human_arbitration',
    question: '必须澄清：指哪个器件？',
    decision: 'pending',
    conversationId: 'conv-2',
    createdAt: 2000,
  };
  const esc = {
    id: 'd3',
    trigger: 'escalation',
    question: '连续失败升级',
    decision: 'escalate',
    conversationId: 'conv-3',
    createdAt: 3000,
  };
  const doneEvent = {
    id: 'e0',
    trigger: 'human_arbitration',
    question: '旧题',
    decision: 'approve',
    refId: 'd0',
    createdAt: 4000,
  };
  writeFileSync(
    logFile,
    [decidedOld, p1, p2, esc, doneEvent].map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf-8',
  );
  const store = new DecisionLog(logFile);
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    decisionLog: store,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // GET：只返回 open pending（d0 已被裁决事件引用，排除）；保持 append 顺序
    const first = await fetch(`${base}/api/decisions`);
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as {
      open?: Array<{ id: string; decision: string; refId?: string }>;
    };
    assert.ok(firstBody.open, '应返回 open 队列');
    assert.deepEqual(
      firstBody.open?.map((e) => e.id),
      ['d1', 'd2'],
      'escalate 与已裁决的 pending 不进队列',
    );
    assert.equal(firstBody.open?.[0]?.refId, undefined, '原行不带 refId');

    // POST 批准 d1（带备注）
    const post = await fetch(`${base}/api/decisions/d1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', note: '选 A' }),
    });
    assert.equal(post.status, 200);
    const postBody = (await post.json()) as {
      ok?: boolean;
      entry?: { id: string; decision: string; refId?: string; note?: string };
    };
    assert.equal(postBody.ok, true);
    assert.equal(postBody.entry?.decision, 'approve');
    assert.equal(postBody.entry?.refId, 'd1', '裁决事件指向原 pending 行');
    assert.equal(postBody.entry?.note, '选 A');

    // 裁决后 open 只剩 d2
    const second = await fetch(`${base}/api/decisions`);
    const secondBody = (await second.json()) as { open?: Array<{ id: string }> };
    assert.deepEqual(secondBody.open?.map((e) => e.id), ['d2']);

    // 非法 decision / 未找到 / 已裁决 / 非 pending
    const badDecision = await fetch(`${base}/api/decisions/d2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'escalate' }),
    });
    assert.equal(badDecision.status, 400);
    const missing = await fetch(`${base}/api/decisions/no-such-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });
    assert.equal(missing.status, 404);
    const again = await fetch(`${base}/api/decisions/d1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });
    assert.equal(again.status, 409, '已裁决二次提交拒绝');
    const escalate = await fetch(`${base}/api/decisions/d3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });
    assert.equal(escalate.status, 404, 'escalate 行不可裁决');
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
