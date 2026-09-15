import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { test } from 'node:test';

import { RouteCaseStore } from '../agent/route-case-store.js';
import { routeV2 } from '../agent/router-v2.js';
import { buildXmindBuffer, createNode } from '../skills/pm-xmind/format.js';
import { ExperienceManager } from '../memory/experience.js';
import { SessionContextStore } from '../memory/session-context.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { DAY_MS } from '../memory/confidence-decay.js';
import { writeSecurityConfig } from '../config/security-config.js';
import { subscribeArtifactEvents } from './artifact-bus.js';
import { clearProjectChangeHistory, recordProjectChanges } from './change-history.js';
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
import { FeedbackStore } from '../feedback/feedback-store.js';
import { SkillCandidateStore } from '../feedback/skill-candidate-store.js';
import { SkillLifecycle } from '../skills/lifecycle.js';
import { PARAMS } from '../config/params.js';
import { AnswerPostprocessRuleStore } from '../postprocess/answer-postprocess-store.js';
import { PendingProjectTransactionStore } from '../security/pending-project-transaction-store.js';
import { prepareProjectTransaction } from '../security/project-transaction.js';

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

test('gateway: E341 dev 模式 CORS 白名单放行 Vite UI 源，其他源不回跨域头', async () => {
  const { server, base } = await startApp();
  try {
    const preflight = await fetch(`${base}/api/ask`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    assert.ok(preflight.headers.get('access-control-allow-methods')?.includes('POST'));

    const samePort = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://127.0.0.1:5173' },
    });
    assert.equal(samePort.status, 200);
    assert.equal(samePort.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');

    const localhost = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(localhost.headers.get('access-control-allow-origin'), 'http://localhost:5173');

    const other = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://evil.example' },
    });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  } finally {
    server.close();
  }
});

test('gateway: E341 生产模式（设置 GATEWAY_AUTH_TOKEN）不返回跨域头', async () => {
  process.env.GATEWAY_AUTH_TOKEN = 'e341-test-secret';
  let server: ReturnType<typeof createServer> | undefined;
  try {
    const started = await startApp();
    server = started.server;
    const resp = await fetch(`${started.base}/api/health`, {
      headers: { Origin: 'http://127.0.0.1:5173' },
    });
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('access-control-allow-origin'), null);
  } finally {
    server?.close();
    delete process.env.GATEWAY_AUTH_TOKEN;
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

test('gateway: /api/ask 拒绝非法记忆访问栏位', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'STM32F103C8T6 主频是多少', mode: 'admin' }),
    });
    assert.equal(resp.status, 403);
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
      body: JSON.stringify({ decision: 'approve', note: '面板批准', mode: 'knowledge' }),
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

test('gateway: Skill 列表展示复审状态并由用户恢复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-skill-review-'));
  const lifecycle = new SkillLifecycle(join(dir, 'experience.db'));
  const now = Date.now();
  lifecycle.ensureRegistered(now);
  lifecycle.syncReviewSignals('jargon-map', 3, 3, now);
  const app = createGatewayApp({ deps: { ...testDeps(), skillLifecycle: lifecycle } });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const list = (await (await fetch(`${base}/api/skills`)).json()) as {
      skills?: Array<{
        name: string;
        state?: string;
        thumbsDownCount?: number;
        consecutiveDown?: number;
      }>;
    };
    const review = list.skills?.find((skill) => skill.name === 'jargon-map');
    assert.equal(review?.state, 'review');
    assert.equal(review?.thumbsDownCount, 3);
    assert.equal(review?.consecutiveDown, 3);

    const response = await fetch(`${base}/api/skills/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'jargon-map', action: 'restore' }),
    });
    assert.equal(response.status, 200);
    const restored = lifecycle.list(Date.now()).find((skill) => skill.name === 'jargon-map');
    assert.equal(restored?.needsReview, false);
    assert.equal(restored?.consecutiveDown, 0);
    assert.equal(restored?.thumbsDownCount, 3);
  } finally {
    server.close();
    lifecycle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});


test('gateway: /api/agents 返回真实子 Agent 目录（类别与接入状态）', async () => {
  const { server, base } = await startApp();
  try {
    const resp = await fetch(`${base}/api/agents`);
    const body = (await resp.json()) as {
      total?: number;
      agents?: Array<{ id: string; name: string; category: string; available: boolean }>;
    };
    assert.equal(resp.status, 200);
    assert.ok((body.total ?? 0) >= 8);
    const kicad = (body.agents ?? []).find((agent) => agent.id === 'kicad');
    assert.ok(kicad);
    assert.equal(kicad.name, 'KiCad');
    assert.ok(['eda', 'structure', 'code', 'simulation', 'build', 'system'].includes(kicad.category));
    assert.equal(typeof kicad.available, 'boolean');
    const vscode = (body.agents ?? []).find((agent) => agent.id === 'vscode');
    assert.deepEqual(vscode, {
      id: 'vscode',
      name: 'Visual Studio Code',
      category: 'code',
      available: true,
    });
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
  userContext.addFact('test-user', '我偏好 STM32 平台和 Keil 工具链', 'user_explicit', now);
  // [P-93] 超过长期事实第二档老化检查点，API 应透出时效警告。
  userContext.addFact('test-user', 'STM32F103 当前库存还有 120 片', 'user_explicit', now - 91 * DAY_MS);
  userContext.addFact(
    'test-user',
    '回复时请叫我专家',
    'user_explicit',
    now,
    undefined,
    'knowledge',
  );
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
    const missingModeResp = await fetch(`${base}/api/memory`);
    assert.equal(missingModeResp.status, 403);

    const engineeringResp = await fetch(`${base}/api/memory?mode=engineering`);
    const engineering = (await engineeringResp.json()) as {
      items?: Array<{ id: string; type: string }>;
    };
    assert.deepEqual(engineering.items?.map((item) => item.type), ['experience']);

    const lifeResp = await fetch(`${base}/api/memory?mode=life`);
    const life = (await lifeResp.json()) as {
      items?: Array<{ id: string; type: string; layer: string; content: string; stale?: boolean }>;
    };
    assert.deepEqual(life.items?.map((item) => item.type), ['fact', 'fact', 'fact', 'session']);
    assert.equal(
      life.items?.find((item) => item.type === 'fact' && item.layer === 'L2')?.layer,
      'L2',
    );
    assert.equal(life.items?.some((item) => item.content.includes('叫我专家')), false);
    assert.equal(life.items?.find((item) => item.content.includes('库存'))?.stale, true);

    const listResp = await fetch(`${base}/api/memory?mode=knowledge`);
    const list = (await listResp.json()) as {
      total?: number;
      items?: Array<{ id: string; type: string; content: string; stale?: boolean }>;
    };
    assert.equal(list.total, 6);
    assert.equal(list.items?.some((item) => item.content.includes('叫我专家')), true);
    const factId = list.items?.find((item) => item.type === 'fact')?.id ?? '';
    const expId = list.items?.find((item) => item.type === 'experience')?.id ?? '';

    const deniedForgetResp = await fetch(`${base}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: expId, type: 'experience', mode: 'life' }),
    });
    assert.equal(deniedForgetResp.status, 403);
    assert.equal(experience.list().length, 1);

    const forgetResp = await fetch(`${base}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: factId, type: 'fact', mode: 'knowledge' }),
    });
    assert.equal(((await forgetResp.json()) as { ok?: boolean }).ok, true);

    const forgetExpResp = await fetch(`${base}/api/memory/forget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: expId, type: 'experience', mode: 'knowledge' }),
    });
    assert.equal(((await forgetExpResp.json()) as { ok?: boolean }).ok, true);
  } finally {
    server.close();
    userContext.close();
    experience.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: /api/feedback 持久化并按回复最新反馈统计', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-feedback-'));
  const feedbackStore = new FeedbackStore(join(dir, 'feedback.jsonl'));
  const app = createGatewayApp({ deps: testDeps(), feedbackStore });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const body = {
      userId: 'u1',
      conversationId: 'c1',
      messageId: 'm1',
      mode: 'knowledge',
      query: '问题',
      answer: '回答',
    };

    const accept = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, feedback: 'accept' }),
    });
    assert.equal(accept.status, 200);
    const reject = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        feedback: 'reject',
        reason: 'missing_key_point',
        note: '遗漏了功耗限制',
      }),
    });
    assert.equal(reject.status, 200);

    const list = (await (await fetch(`${base}/api/feedback`)).json()) as {
      entries: unknown[];
      latest: Array<{ reason?: string; note?: string }>;
      stats: { accept: number; reject: number; total: number };
    };
    assert.equal(list.entries.length, 2);
    assert.equal(list.latest.length, 1);
    assert.equal(list.latest[0].reason, 'missing_key_point');
    assert.equal(list.latest[0].note, '遗漏了功耗限制');
    assert.deepEqual(list.stats, { accept: 0, reject: 1, correct: 0, total: 1, acceptanceRate: 0 });

    const invalid = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, feedback: 'like' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(feedbackStore.all().length, 2);

    const invalidReason = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, feedback: 'reject', reason: '随便写的原因' }),
    });
    assert.equal(invalidReason.status, 400);
    assert.equal(feedbackStore.all().length, 2);
  } finally {
    server.close();
    feedbackStore.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: correct 反馈保存修订答并写入 Chat Memory L2', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-correct-feedback-'));
  const feedbackStore = new FeedbackStore(join(dir, 'feedback.jsonl'));
  const userContext = new UserContextStore(join(dir, 'user-context.db'));
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'u1',
    feedbackStore,
    userContextStore: userContext,
  });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const body = {
      userId: 'u1',
      conversationId: 'c1',
      messageId: 'm-correct',
      mode: 'engineering',
      query: '如何选型？',
      answer: '原回答',
      feedback: 'correct',
      correctedAnswer: '应优先核对 STM32 的工作温度范围。',
    };
    const response = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as {
      memorySaved?: boolean;
      entry?: { correctedAnswer?: string };
    };
    assert.equal(response.status, 200);
    assert.equal(result.memorySaved, true);
    assert.equal(result.entry?.correctedAnswer, body.correctedAnswer);
    const fact = userContext.listFacts('u1', 'engineering').find((item) => item.content.includes('温度范围'));
    assert.equal(fact?.layer, 'L2');
    assert.equal(fact?.source, 'corrected');

    const invalid = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, messageId: 'm-invalid', correctedAnswer: '' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(feedbackStore.all().length, 1);
  } finally {
    server.close();
    feedbackStore.close();
    userContext.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: 同类修订达到 [P-11] 后只生成待确认 Skill 候选', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-skill-candidate-'));
  const feedbackStore = new FeedbackStore(join(dir, 'feedback.jsonl'));
  const skillCandidateStore = new SkillCandidateStore(join(dir, 'candidates.jsonl'));
  const answerPostprocessRuleStore = new AnswerPostprocessRuleStore(join(dir, 'rules.jsonl'));
  const app = createGatewayApp({
    deps: testDeps(),
    feedbackStore,
    skillCandidateStore,
    answerPostprocessRuleStore,
  });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    let proposed: { id: string; status: string } | undefined;
    for (let index = 0; index < PARAMS.feedbackCandidateThreshold; index += 1) {
      const response = await fetch(`${base}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'u1',
          conversationId: 'c1',
          messageId: `m-${index}`,
          mode: 'knowledge',
          query: '如何排查？',
          answer: `原回答 ${index}`,
          feedback: 'correct',
          correctedAnswer: `结论：应优先检查电源 ${index}。`,
        }),
      });
      assert.equal(response.status, 200);
      proposed = ((await response.json()) as {
        skillCandidate?: { id: string; status: string } | null;
      }).skillCandidate ?? undefined;
    }
    assert.equal(proposed?.status, 'proposed');

    const list = (await (await fetch(`${base}/api/skill-candidates?userId=u1`)).json()) as {
      candidates: Array<{ id: string; status: string; sampleCount: number }>;
    };
    assert.equal(list.candidates.length, 1);
    assert.equal(list.candidates[0].sampleCount, PARAMS.feedbackCandidateThreshold);
    const beforeAccept = await fetch(
      `${base}/api/skill-candidates/${list.candidates[0].id}/draft?userId=u1`,
    );
    assert.equal(beforeAccept.status, 409);
    const otherUser = (await (await fetch(`${base}/api/skill-candidates?userId=u2`)).json()) as {
      candidates: unknown[];
    };
    assert.equal(otherUser.candidates.length, 0);
    const otherUserDraft = await fetch(
      `${base}/api/skill-candidates/${list.candidates[0].id}/draft?userId=u2`,
    );
    assert.equal(otherUserDraft.status, 404);

    const decision = await fetch(`${base}/api/skill-candidates/${list.candidates[0].id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', decision: 'accept' }),
    });
    assert.equal(decision.status, 200);
    const draftResponse = await fetch(
      `${base}/api/skill-candidates/${list.candidates[0].id}/draft?userId=u1`,
    );
    const draft = (await draftResponse.json()) as {
      draft?: { name?: string; installable?: boolean; skillMarkdown?: string };
    };
    assert.equal(draftResponse.status, 200);
    assert.equal(draft.draft?.name, 'reply-conclusion-first');
    assert.equal(draft.draft?.installable, true);
    assert.match(draft.draft?.skillMarkdown ?? '', /应优先检查电源/);
    assert.equal(
      ((await decision.json()) as { candidate?: { status?: string } }).candidate?.status,
      'accepted',
    );
    assert.equal(skillCandidateStore.all().length, 2);

    const enable = await fetch(`${base}/api/skill-candidates/${list.candidates[0].id}/rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', action: 'enable' }),
    });
    assert.equal(enable.status, 200);
    const askEnabled = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', query: 'ESP32 I2C 通信失败 无应答', mode: 'knowledge' }),
    });
    const enabledAnswer = (await askEnabled.json()) as { answer?: string; postprocessSkillNames?: string[] };
    assert.ok(enabledAnswer.answer?.startsWith('结论：'));
    assert.deepEqual(enabledAnswer.postprocessSkillNames, ['reply-conclusion-first']);
    for (const [index, messageId] of ['rule-feedback-1', 'rule-feedback-2', 'rule-feedback-3'].entries()) {
      const feedbackResponse = await fetch(`${base}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'u1',
          conversationId: 'c1',
          messageId,
          mode: 'knowledge',
          query: `ESP32 I2C 通信失败 无应答 ${index + 1}`,
          answer: `${enabledAnswer.answer} ${index + 1}`,
          postprocessSkillNames: enabledAnswer.postprocessSkillNames,
          feedback: 'reject',
          reason: index === 1 ? 'technical_error' : 'missing_key_point',
          note: `复审说明 ${index + 1}`,
        }),
      });
      assert.equal(feedbackResponse.status, 200);
    }
    const amendLatest = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u1',
        conversationId: 'c1',
        messageId: 'rule-feedback-3',
        mode: 'knowledge',
        query: 'ESP32 I2C 通信失败 无应答 3',
        answer: `${enabledAnswer.answer} 3`,
        postprocessSkillNames: enabledAnswer.postprocessSkillNames,
        feedback: 'accept',
      }),
    });
    assert.equal(amendLatest.status, 200);
    feedbackStore.record({
      userId: 'u2',
      conversationId: 'c2',
      messageId: 'other-user-later-feedback',
      mode: 'knowledge',
      query: '其他用户问题',
      answer: '其他用户回答',
      postprocessSkillNames: ['reply-conclusion-first'],
      feedback: 'reject',
      reason: 'irrelevant',
      note: '不能泄露到 u1',
    }, Date.now() + 1);
    const reviewedCandidates = (await (
      await fetch(`${base}/api/skill-candidates?userId=u1`)
    ).json()) as {
      candidates: Array<{
        id: string;
        ruleEnabled: boolean;
        ruleLifecycle?: { usageCount: number; thumbsDownCount: number; needsReview: boolean };
        latestNegativeFeedback?: {
          reason?: string;
          note?: string;
          query: string;
          answer: string;
          createdAt: number;
        } | null;
      }>;
    };
    const reviewed = reviewedCandidates.candidates.find((item) => item.id === list.candidates[0].id);
    assert.equal(reviewed?.ruleEnabled, true);
    assert.equal(reviewed?.ruleLifecycle?.usageCount, 1);
    assert.equal(reviewed?.ruleLifecycle?.thumbsDownCount, 2);
    assert.equal(reviewed?.ruleLifecycle?.needsReview, true);
    assert.deepEqual(reviewed?.latestNegativeFeedback, {
      reason: 'technical_error',
      note: '复审说明 2',
      query: 'ESP32 I2C 通信失败 无应答 2',
      answer: `${enabledAnswer.answer} 2`,
      createdAt: reviewed?.latestNegativeFeedback?.createdAt,
    });
    const restoreReview = await fetch(`${base}/api/skill-candidates/${list.candidates[0].id}/rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', action: 'restore_review' }),
    });
    const restored = (await restoreReview.json()) as {
      rule?: {
        status: string;
        usageCount: number;
        thumbsDownCount: number;
        consecutiveDown: number;
        needsReview: boolean;
      };
    };
    assert.equal(restoreReview.status, 200);
    assert.equal(restored.rule?.status, 'enabled');
    assert.equal(restored.rule?.usageCount, 1);
    assert.equal(restored.rule?.thumbsDownCount, 2);
    assert.equal(restored.rule?.consecutiveDown, 0);
    assert.equal(restored.rule?.needsReview, false);
    const afterRestore = (await (
      await fetch(`${base}/api/skill-candidates?userId=u1`)
    ).json()) as { candidates: Array<{ id: string; latestNegativeFeedback?: unknown }> };
    assert.equal(
      afterRestore.candidates.find((item) => item.id === list.candidates[0].id)
        ?.latestNegativeFeedback,
      null,
    );

    const disable = await fetch(`${base}/api/skill-candidates/${list.candidates[0].id}/rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', action: 'disable' }),
    });
    assert.equal(disable.status, 200);
    assert.equal(answerPostprocessRuleStore.all().length, 8);
    const askDisabled = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', query: 'ESP32 I2C 通信失败 无应答', mode: 'knowledge' }),
    });
    const disabledAnswer = (await askDisabled.json()) as { answer?: string; postprocessSkillNames?: string[] };
    assert.equal(disabledAnswer.answer?.startsWith('结论：'), false);
    assert.equal(disabledAnswer.postprocessSkillNames, undefined);
  } finally {
    server.close();
    feedbackStore.close();
    skillCandidateStore.close();
    answerPostprocessRuleStore.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: Skill 连续 👎 达 [P-79] 后标记复审且不自动降权', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-skill-feedback-'));
  const feedbackStore = new FeedbackStore(join(dir, 'feedback.jsonl'));
  const lifecycle = new SkillLifecycle(join(dir, 'experience.db'));
  lifecycle.ensureRegistered(1_000);
  const before = lifecycle.list(1_000).find((item) => item.name === 'jargon-map');
  const app = createGatewayApp({
    deps: { ...testDeps(), skillLifecycle: lifecycle },
    feedbackStore,
  });
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const common = {
      userId: 'u1',
      conversationId: 'c1',
      mode: 'knowledge',
      query: '问题',
      answer: '回答',
      skillName: 'jargon-map',
      feedback: 'reject',
    };
    for (const messageId of ['m1', 'm2', 'm3']) {
      const response = await fetch(`${base}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...common, messageId }),
      });
      assert.equal(response.status, 200);
    }
    const reviewed = lifecycle.list(Date.now()).find((item) => item.name === 'jargon-map');
    assert.equal(reviewed?.needsReview, true);
    assert.equal(reviewed?.consecutiveDown, 3);
    assert.equal(reviewed?.thumbsDownCount, 3);
    assert.ok(Math.abs((reviewed?.confidence ?? 0) - (before?.confidence ?? 0)) < 0.000001);

    await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...common, messageId: 'm2', feedback: 'accept' }),
    });
    const amended = lifecycle.list(Date.now()).find((item) => item.name === 'jargon-map');
    assert.equal(amended?.thumbsDownCount, 2);
    assert.equal(amended?.consecutiveDown, 0);
    assert.equal(feedbackStore.latest().length, 3);
  } finally {
    server.close();
    feedbackStore.close();
    lifecycle.close();
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
  const decisionStore = new DecisionLog(join(dir, 'decision-log.jsonl'));
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    notificationStore: store,
    decisionLog: decisionStore,
  });
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
    decisionStore.close();
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
  const decisionStore = new DecisionLog(join(dir, 'decision-log.jsonl'));
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    notificationStore: store,
    decisionLog: decisionStore,
  });
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
    decisionStore.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: 通知简报返回当前用户的每日回复反馈汇总', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-notify-feedback-'));
  const feedbackStore = new FeedbackStore(join(dir, 'feedback.jsonl'));
  feedbackStore.record({
    userId: 'u1',
    conversationId: 'c1',
    messageId: 'm1',
    mode: 'knowledge',
    query: '问题',
    answer: '回答',
    feedback: 'reject',
    reason: 'too_verbose',
  });
  feedbackStore.record({
    userId: 'u2',
    conversationId: 'c2',
    messageId: 'm2',
    mode: 'knowledge',
    query: '其他问题',
    answer: '其他回答',
    feedback: 'accept',
  });
  const notificationStore = new NotificationStore(join(dir, 'notifications.jsonl'));
  const decisionStore = new DecisionLog(join(dir, 'decision-log.jsonl'));
  const app = createGatewayApp({
    deps: testDeps(),
    feedbackStore,
    notificationStore,
    decisionLog: decisionStore,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = (await (
      await fetch(`${base}/api/notifications?userId=u1`)
    ).json()) as {
      feedbackSummary?: {
        accept: number;
        reject: number;
        correct: number;
        total: number;
        topRejectReason?: string;
        text: string;
      };
    };
    assert.deepEqual(response.feedbackSummary, {
      accept: 0,
      reject: 1,
      correct: 0,
      total: 1,
      topRejectReason: 'too_verbose',
      text: '今天收到 1 个👎、0 个👍、0 条修改建议，主要原因是“太啰嗦”。',
    });
  } finally {
    server.close();
    feedbackStore.close();
    notificationStore.close();
    decisionStore.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: E336 裁决后对应「待你裁决」通知从列表消失（未裁决仍展示）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-notify-resolve-'));
  const log = new DecisionLog(join(dir, 'decision-log.jsonl'));
  const notifyLog = new NotificationStore(join(dir, 'notifications.jsonl'));
  const pending = log.record({
    trigger: 'human_arbitration',
    question: '⏸ 待批准：明天下午3点周会',
    options: ['执行', '取消'],
    decision: 'pending',
    resume: { query: '帮我安排明天下午3点的周会', executor: 'calendar_skill', intent: 'create_calendar' },
    conversationId: 'conv-e336',
    confidence: 0.8,
  });
  notifyLog.add({
    role: '老板',
    kind: 'risk_decision',
    title: '待你裁决',
    detail: '⏸ 待批准：明天下午3点周会',
    decisionId: pending.id,
  });
  notifyLog.add({ role: '秘书', kind: 'ai_ops_daily', title: 'AI 运营日报', detail: '今日 ¥0.00' });
  const app = createGatewayApp({
    deps: testDeps(),
    defaultUserId: 'test-user',
    notificationStore: notifyLog,
    decisionLog: log,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // 未裁决：待你裁决通知仍展示
    const before = (await (await fetch(`${base}/api/notifications`)).json()) as {
      entries?: Array<{ id: string; title: string }>;
      total?: number;
    };
    assert.equal(before.total, 2, '未裁决时两条都展示');
    assert.ok(before.entries?.some((e) => e.title === '待你裁决'), '未裁决时应含待你裁决');

    // 否决该 pending 后：对应待你裁决通知从列表消失，其余保留
    const reject = await fetch(`${base}/api/decisions/${pending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject', note: '面板否决' }),
    });
    assert.equal(reject.status, 200);
    const after = (await (await fetch(`${base}/api/notifications`)).json()) as {
      entries?: Array<{ id: string; title: string }>;
      total?: number;
    };
    assert.equal(after.total, 1, '裁决后待你裁决被过滤，只剩无关通知');
    assert.ok(!after.entries?.some((e) => e.title === '待你裁决'), '裁决后不应再展示待你裁决');
    assert.ok(after.entries?.some((e) => e.title === 'AI 运营日报'));
  } finally {
    server.close();
    notifyLog.close();
    log.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: E337 /api/files/preview 路径防护与不存在处理', async () => {
  const app = createGatewayApp({ deps: testDeps(), defaultUserId: 'test-user' });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // 路径穿越 → 400
    const traversal = await fetch(`${base}/api/files/preview?path=${encodeURIComponent('../secret.txt')}`);
    assert.equal(traversal.status, 400);
    const traversalBody = (await traversal.json()) as { error?: string };
    assert.ok(traversalBody.error?.includes('不合法'), traversalBody.error);

    // 非沙箱根开头 → 400
    const outside = await fetch(`${base}/api/files/preview?path=${encodeURIComponent('etc/passwd')}`);
    assert.equal(outside.status, 400);

    // 沙箱根内但文件不存在 → 404
    const missing = await fetch(
      `${base}/api/files/preview?path=${encodeURIComponent('projects/__e337_missing__.txt')}`,
    );
    assert.equal(missing.status, 404);
    const missingBody = (await missing.json()) as { error?: string };
    assert.equal(missingBody.error, '文件不存在');
  } finally {
    server.close();
  }
});

test('gateway: E345 /api/files/preview .xmind 分发——读回大纲 200 / 损坏 415', async () => {
  const { server, base } = await startApp();
  const tmpDir = mkdtempSync(join(process.cwd(), 'projects', '.e345-gw-'));
  try {
    const root = createNode('项目计划', [createNode('设计'), createNode('测试')]);
    const buf = await buildXmindBuffer(root);
    writeFileSync(join(tmpDir, 'plan.xmind'), buf);
    const relPath = relative(process.cwd(), join(tmpDir, 'plan.xmind')).split(sep).join('/');

    const okResp = await fetch(`${base}/api/files/preview?path=${encodeURIComponent(relPath)}`);
    assert.equal(okResp.status, 200);
    const okBody = (await okResp.json()) as {
      ok?: boolean;
      preview?: string;
      truncated?: boolean;
    };
    assert.equal(okBody.ok, true);
    assert.equal(okBody.preview, '项目计划\n1 设计\n2 测试');
    assert.equal(okBody.truncated, false);

    writeFileSync(join(tmpDir, 'bad.xmind'), 'not a zip');
    const badRel = relative(process.cwd(), join(tmpDir, 'bad.xmind')).split(sep).join('/');
    const badResp = await fetch(`${base}/api/files/preview?path=${encodeURIComponent(badRel)}`);
    assert.equal(badResp.status, 415);
    const badBody = (await badResp.json()) as { error?: string };
    assert.equal(badBody.error, '不是可读的 .xmind 文件');
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('gateway: E354 /api/files/raw 返回 HTML 产物（面板 iframe 渲染用）', async () => {
  const { server, base } = await startApp();
  const tmpDir = mkdtempSync(join(process.cwd(), 'outputs', '.e354-gw-'));
  try {
    const html = '<html><body><h1>系统架构图</h1></body></html>';
    writeFileSync(join(tmpDir, 'diagram.html'), html);
    const relPath = relative(process.cwd(), join(tmpDir, 'diagram.html')).split(sep).join('/');

    const okResp = await fetch(`${base}/api/files/raw?path=${encodeURIComponent(relPath)}`);
    assert.equal(okResp.status, 200);
    assert.equal(okResp.headers.get('content-type')?.toLowerCase().includes('text/html'), true);
    assert.equal(okResp.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await okResp.text(), html);

    writeFileSync(join(tmpDir, 'note.txt'), 'not html');
    const txtRel = relative(process.cwd(), join(tmpDir, 'note.txt')).split(sep).join('/');
    const txtResp = await fetch(`${base}/api/files/raw?path=${encodeURIComponent(txtRel)}`);
    assert.equal(txtResp.status, 415);

    const traversal = await fetch(`${base}/api/files/raw?path=${encodeURIComponent('../secret.html')}`);
    assert.equal(traversal.status, 400);

    const missing = await fetch(`${base}/api/files/raw?path=${encodeURIComponent('outputs/__e354_missing__.html')}`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('gateway: E339 /api/files/changes 返回 watcher 最近变更（内存环，新→旧）', async () => {
  clearProjectChangeHistory();
  const app = createGatewayApp({ deps: testDeps(), defaultUserId: 'test-user' });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // 空环 → 空数组
    const emptyResp = await fetch(`${base}/api/files/changes`);
    assert.equal(emptyResp.status, 200);
    assert.deepEqual((await emptyResp.json()) as { changes: unknown[] }, { changes: [] });
    // 记录两条后 → 新在前、字段齐全
    recordProjectChanges([{ path: 'projects/a.txt', kind: 'added' }], 1111);
    recordProjectChanges([{ path: 'projects/b.txt', kind: 'removed' }], 2222);
    const resp = await fetch(`${base}/api/files/changes`);
    const body = (await resp.json()) as {
      changes?: Array<{ path: string; kind: string; at: number }>;
    };
    assert.equal(resp.status, 200);
    assert.equal(body.changes?.length, 2);
    assert.deepEqual(body.changes?.[0], { path: 'projects/b.txt', kind: 'removed', at: 2222 });
    assert.deepEqual(body.changes?.[1], { path: 'projects/a.txt', kind: 'added', at: 1111 });
  } finally {
    clearProjectChangeHistory();
    server.close();
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

test('gateway: E402 冲突裁决要求合法 choice，事务缺失时不从日志恢复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-decision-choice-'));
  const logFile = join(dir, 'decision-log.jsonl');
  const store = new DecisionLog(logFile);
  const pending = store.record({
    trigger: 'human_arbitration',
    question: '项目冲突如何处理？',
    options: ['保留外部版本', '使用事务版本', '取消整批'],
    choices: [
      { id: 'keep_external', label: '保留外部版本', outcome: 'approve' },
      { id: 'use_transaction', label: '使用事务版本', outcome: 'approve' },
      { id: 'cancel_all', label: '取消整批', outcome: 'reject' },
    ],
    defaultChoice: 'cancel_all',
    requiresConfirmation: true,
    context: { kind: 'project_transaction_conflict', transactionId: 'tx-1' },
    decision: 'pending',
  });
  const app = createGatewayApp({ deps: testDeps(), decisionLog: store });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const missingChoice = await fetch(`${base}/api/decisions/${pending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(missingChoice.status, 400);

    const invalidChoice = await fetch(`${base}/api/decisions/${pending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'overwrite_without_confirmation' }),
    });
    assert.equal(invalidChoice.status, 400);

    const selected = await fetch(`${base}/api/decisions/${pending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'use_transaction', note: '显式选择' }),
    });
    assert.equal(selected.status, 200);
    const body = (await selected.json()) as {
      ok?: boolean;
      entry?: { selectedChoice?: string; refId?: string };
      executed?: unknown;
      projectTransaction?: { status?: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.entry?.selectedChoice, 'use_transaction');
    assert.equal(body.entry?.refId, pending.id);
    assert.equal(body.executed, undefined, '冲突 choice 不走普通 pipeline resume');
    assert.equal(body.projectTransaction?.status, 'expired');
    assert.equal(store.all().find((entry) => entry.id === pending.id)?.selectedChoice, undefined);
    assert.deepEqual(store.openDecisions(), []);
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: E399 confirm_changes 返回事务提交结果并写入整批文件', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-pending-project-transaction-'));
  const logFile = join(dir, 'decision-log.jsonl');
  const first = join(dir, 'projects', 'a.txt');
  const second = join(dir, 'projects', 'b.txt');
  mkdirSync(join(dir, 'projects'), { recursive: true });
  writeFileSync(first, 'old-a', { encoding: 'utf-8', flag: 'w' });
  const prepared = prepareProjectTransaction([
    { path: first, content: 'new-a' },
    { path: second, content: 'new-b' },
  ], { workspaceRoot: dir, snapshotRoot: join(dir, 'data', 'writer-transactions') });
  if (!prepared.ok) throw new Error(prepared.error);
  const decisionLog = new DecisionLog(logFile);
  const transactionStore = new PendingProjectTransactionStore();
  const pending = decisionLog.record({
    trigger: 'human_arbitration',
    question: '确认多文件变更？',
    choices: [
      { id: 'confirm_changes', label: '确认变更', outcome: 'approve' },
      { id: 'cancel_all', label: '取消整批', outcome: 'reject' },
    ],
    defaultChoice: 'cancel_all',
    requiresConfirmation: true,
    context: {
      kind: 'project_multifile_change_confirmation',
      transactionId: prepared.transaction.id,
      snapshotDir: prepared.transaction.snapshotDir,
    },
    decision: 'pending',
  });
  transactionStore.register(pending.id, prepared.transaction);
  const app = createGatewayApp({
    deps: testDeps(),
    decisionLog,
    pendingProjectTransactionStore: transactionStore,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/api/decisions/${pending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'confirm_changes' }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      projectTransaction?: { status?: string; commit?: { committedPaths?: string[] } };
    };
    assert.equal(body.projectTransaction?.status, 'completed');
    assert.deepEqual(body.projectTransaction?.commit?.committedPaths, [first, second]);
    assert.equal(readFileSync(first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(second, 'utf-8'), 'new-b');
    assert.equal(existsSync(second), true);
  } finally {
    server.close();
    decisionLog.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: E399 /api/ask prepare → decision choice → commit 共用进程内事务仓库', async () => {
  const baseDir = join(process.cwd(), 'data', 'gateway-e399-test');
  mkdirSync(baseDir, { recursive: true });
  const dir = mkdtempSync(join(baseDir, 'run-'));
  const logFile = join(dir, 'decision-log.jsonl');
  const operationLog = join(dir, 'operations.jsonl');
  const first = join(dir, 'a.txt');
  const second = join(dir, 'b.txt');
  writeFileSync(first, 'old-a', 'utf-8');
  const oldSandbox = process.env.SANDBOX_ALLOWED_DIRS;
  const oldOperationLog = process.env.OPERATIONS_LOG_PATH;
  process.env.SANDBOX_ALLOWED_DIRS = dir;
  process.env.OPERATIONS_LOG_PATH = operationLog;
  const decisionLog = new DecisionLog(logFile);
  const transactionStore = new PendingProjectTransactionStore();
  const app = createGatewayApp({
    deps: { ...testDeps(), llm: undefined },
    decisionLog,
    pendingProjectTransactionStore: transactionStore,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let snapshotDir = '';
  try {
    const query = `请把以下多文件变更写入工程\n\`\`\`json\n${JSON.stringify({
      files: [
        { path: first, content: 'new-a' },
        { path: second, content: 'new-b' },
      ],
    })}\n\`\`\``;
    const ask = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, userId: 'u1', conversationId: 'conv-e399' }),
    });
    assert.equal(ask.status, 200);
    const askBody = (await ask.json()) as {
      answer?: string;
      artifacts?: Array<{ data?: { snapshotDir?: string } }>;
    };
    snapshotDir = askBody.artifacts?.[0]?.data?.snapshotDir ?? '';
    const pending = decisionLog.openDecisions()[0];
    assert.ok(pending, askBody.answer ?? '未生成待确认记录');
    assert.equal(transactionStore.get(pending!.id)?.transaction.id, pending?.context?.transactionId);
    assert.equal(readFileSync(first, 'utf-8'), 'old-a');
    assert.equal(existsSync(second), false);

    const decide = await fetch(`${base}/api/decisions/${pending!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'confirm_changes' }),
    });
    assert.equal(decide.status, 200);
    const decideBody = (await decide.json()) as { projectTransaction?: { status?: string } };
    assert.equal(decideBody.projectTransaction?.status, 'completed');
    assert.equal(readFileSync(first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(second, 'utf-8'), 'new-b');
    assert.equal(transactionStore.size(), 0);
  } finally {
    server.close();
    decisionLog.close();
    if (oldSandbox === undefined) delete process.env.SANDBOX_ALLOWED_DIRS;
    else process.env.SANDBOX_ALLOWED_DIRS = oldSandbox;
    if (oldOperationLog === undefined) delete process.env.OPERATIONS_LOG_PATH;
    else process.env.OPERATIONS_LOG_PATH = oldOperationLog;
    if (snapshotDir) rmSync(snapshotDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway: E402 初次确认转冲突后 use_transaction 恢复执行', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-project-conflict-resume-'));
  const logFile = join(dir, 'decision-log.jsonl');
  const first = join(dir, 'projects', 'a.txt');
  const second = join(dir, 'projects', 'b.txt');
  mkdirSync(dirname(first), { recursive: true });
  writeFileSync(first, 'old-a', 'utf-8');
  const prepared = prepareProjectTransaction([
    { path: first, content: 'new-a' },
    { path: second, content: 'new-b' },
  ], { workspaceRoot: dir, snapshotRoot: join(dir, 'data', 'writer-transactions') });
  if (!prepared.ok) throw new Error(prepared.error);
  const decisionLog = new DecisionLog(logFile);
  const transactionStore = new PendingProjectTransactionStore();
  const pending = decisionLog.record({
    trigger: 'human_arbitration',
    question: '确认多文件变更？',
    choices: [
      { id: 'confirm_changes', label: '确认变更', outcome: 'approve' },
      { id: 'cancel_all', label: '取消整批', outcome: 'reject' },
    ],
    defaultChoice: 'cancel_all',
    requiresConfirmation: true,
    context: {
      kind: 'project_multifile_change_confirmation',
      transactionId: prepared.transaction.id,
      snapshotDir: prepared.transaction.snapshotDir,
    },
    decision: 'pending',
  });
  transactionStore.register(pending.id, prepared.transaction);
  writeFileSync(first, 'external-a', 'utf-8');
  const app = createGatewayApp({
    deps: testDeps(),
    decisionLog,
    pendingProjectTransactionStore: transactionStore,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const firstDecision = await fetch(`${base}/api/decisions/${pending.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'confirm_changes' }),
    });
    assert.equal(firstDecision.status, 200);
    const firstBody = (await firstDecision.json()) as {
      projectTransaction?: { status?: string; conflictDecisionId?: string };
    };
    assert.equal(firstBody.projectTransaction?.status, 'conflict_pending');
    const conflictDecisionId = firstBody.projectTransaction?.conflictDecisionId ?? '';
    assert.ok(conflictDecisionId);
    assert.equal(readFileSync(first, 'utf-8'), 'external-a');
    assert.equal(existsSync(second), false);

    const conflictDecision = await fetch(`${base}/api/decisions/${conflictDecisionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'use_transaction' }),
    });
    assert.equal(conflictDecision.status, 200);
    const conflictBody = (await conflictDecision.json()) as {
      projectTransaction?: { status?: string; conflictResolution?: { selectedChoice?: string } };
    };
    assert.equal(conflictBody.projectTransaction?.status, 'completed');
    assert.equal(conflictBody.projectTransaction?.conflictResolution?.selectedChoice, 'use_transaction');
    assert.equal(readFileSync(first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(second, 'utf-8'), 'new-b');
    assert.equal(transactionStore.size(), 0);
  } finally {
    server.close();
    decisionLog.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
