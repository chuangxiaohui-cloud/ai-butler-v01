import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { SubAgentDispatcher } from './dispatcher.js';
import type { McpCallResult, McpClient, SubAgentMeta } from './types.js';

class FakeMcpClient implements McpClient {
  calls: Array<{ name: string; args: Record<string, unknown>; timeoutMs?: number }> = [];

  constructor(private readonly mode: 'ok' | 'fail' | 'timeout' = 'ok') {}

  async listTools() {
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpCallResult> {
    this.calls.push({ name, args, timeoutMs });
    if (this.mode === 'fail') {
      return { ok: false, output: '', untrusted: true, elapsedMs: 1, error: '工具失败' };
    }
    if (this.mode === 'timeout') {
      return { ok: false, output: '', untrusted: true, elapsedMs: 50, error: 'MCP 请求超时', timedOut: true };
    }
    return { ok: true, output: `out:${name}`, untrusted: true, elapsedMs: 1 };
  }

  close() {}
}

function meta(id: string, category: SubAgentMeta['category'], available = true): SubAgentMeta {
  return { id, name: id, category, toolPrefix: `${id}.`, available, command: [`${id}-cli`] };
}

test('mcp-dispatcher: 成功调用返回 attempts=1 且 untrusted', async () => {
  const kicad = meta('kicad', 'eda');
  const client = new FakeMcpClient();
  const dispatcher = new SubAgentDispatcher([kicad], new Map([['kicad', client]]), { backoffBaseMs: 1 });
  const result = await dispatcher.dispatch('出原理图', { toolName: 'kicad.sch_export', args: { file: 'a.kicad_sch' } });
  assert.equal(result.ok, true);
  assert.equal(result.agentId, 'kicad');
  assert.equal(result.attempts, 1);
  assert.equal(result.degraded, false);
  assert.equal(result.untrusted, true);
  assert.equal(result.output, 'out:kicad.sch_export');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0]?.name, 'kicad.sch_export');
});

test('mcp-dispatcher: 失败按重试次数重试且退避递增', async () => {
  const keil = meta('keil', 'build');
  const client = new FakeMcpClient('fail');
  const dispatcher = new SubAgentDispatcher([keil], new Map([['keil', client]]), { backoffBaseMs: 2 });
  const result = await dispatcher.dispatch('编译固件', {
    toolName: 'keil.compile',
    deterministic: true, // [P-44] = 2 次重试 → 共 3 次调用
    timeoutMs: 100,
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 3, '确定性操作默认重试 2 次');
  assert.equal(client.calls.length, 3);
  assert.ok(client.calls.every((c) => c.name === 'keil.compile'));
});

test('mcp-dispatcher: 非确定性操作重试次数更少（[P-45]）', async () => {
  const cursor = meta('cursor', 'code');
  const client = new FakeMcpClient('fail');
  const dispatcher = new SubAgentDispatcher([cursor], new Map([['cursor', client]]), { backoffBaseMs: 1 });
  const result = await dispatcher.dispatch('生成代码', { toolName: 'cursor.generate', deterministic: false });
  assert.equal(result.attempts, 2, '非确定性默认重试 1 次');
});

test('mcp-dispatcher: 超时中断标记 timedOut', async () => {
  const ltspice = meta('ltspice', 'simulation');
  const client = new FakeMcpClient('timeout');
  const dispatcher = new SubAgentDispatcher([ltspice], new Map([['ltspice', client]]), { backoffBaseMs: 1 });
  const result = await dispatcher.dispatch('仿真', { toolName: 'ltspice.sim', retryCount: 0, timeoutMs: 60 });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.attempts, 1);
});

test('mcp-dispatcher: 同类别降级到备用子 Agent 且标记 degraded', async () => {
  const altium = meta('altium', 'eda');
  const kicad = meta('kicad', 'eda');
  const failClient = new FakeMcpClient('fail');
  const okClient = new FakeMcpClient();
  const dispatcher = new SubAgentDispatcher(
    [altium, kicad],
    new Map([
      ['altium', failClient],
      ['kicad', okClient],
    ]),
    { backoffBaseMs: 1 },
  );
  const result = await dispatcher.dispatch('画原理图', { category: 'eda', toolName: 'altium.run', retryCount: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.agentId, 'kicad', '降级到同类别备用');
  assert.equal(result.degraded, true);
  assert.equal(okClient.calls.length, 1);
  assert.equal(okClient.calls[0]?.name, 'kicad.run', '降级回退到备用 agent 默认工具');
});

test('mcp-dispatcher: 预中止信号立即取消', async () => {
  const kicad = meta('kicad', 'eda');
  const client = new FakeMcpClient();
  const dispatcher = new SubAgentDispatcher([kicad], new Map([['kicad', client]]), { backoffBaseMs: 1 });
  const controller = new AbortController();
  controller.abort();
  const result = await dispatcher.dispatch('出图', { toolName: 'kicad.run', signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.error, '已取消');
  assert.equal(client.calls.length, 0);
});

test('mcp-dispatcher: 无可用子 Agent 时诚实报错', async () => {
  const kicad = meta('kicad', 'eda', false);
  const dispatcher = new SubAgentDispatcher([kicad], new Map());
  const result = await dispatcher.dispatch('出图', { toolName: 'kicad.run' });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /没有可用的子 Agent/);
  assert.equal(result.attempts, 0);
});

test('mcp-dispatcher: 白名单拒绝不进入调用', async () => {
  const kicad = meta('kicad', 'eda');
  const client = new FakeMcpClient();
  const dispatcher = new SubAgentDispatcher([kicad], new Map([['kicad', client]]), { backoffBaseMs: 1 });
  const result = await dispatcher.dispatch('越权调用', { toolName: 'keil.compile', retryCount: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.error, '诚实报错');
  assert.equal(client.calls.length, 0, '无匹配工具不触发越权调用');
});
