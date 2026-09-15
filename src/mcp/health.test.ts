import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkMcpAgentHealth } from './health.js';
import type { McpClient, SubAgentMeta } from './types.js';

const meta: SubAgentMeta = {
  id: 'windows',
  name: 'Windows',
  category: 'system',
  toolPrefix: 'windows.',
  available: true,
  command: ['windows-mcp.exe', 'serve'],
  allowedTools: ['Process'],
  defaultTool: 'windows.Process',
  defaultArgs: { mode: 'list', limit: 5 },
};

function client(overrides: Partial<McpClient> = {}): McpClient {
  return {
    listTools: async () => [{ name: 'Process', description: 'process', inputSchema: {} }],
    callTool: async () => ({ ok: true, output: 'PID', untrusted: true, elapsedMs: 1 }),
    close: () => undefined,
    ...overrides,
  };
}

test('mcp-health: 完成握手、工具清单与白名单默认调用', async () => {
  let called = '';
  const result = await checkMcpAgentHealth(meta, client({
    callTool: async (name) => {
      called = name;
      return { ok: true, output: 'PID', untrusted: true, elapsedMs: 1 };
    },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.initializePassed, true);
  assert.equal(result.toolCount, 1);
  assert.deepEqual(result.toolNames, ['Process']);
  assert.equal(result.verification, 'read_only_call');
  assert.equal(result.checkedTool, 'Process');
  assert.equal(result.outputBytes, Buffer.byteLength('PID', 'utf8'));
  assert.match(result.outputSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(result.untrusted, true);
  assert.equal(called, 'Process');
});

test('mcp-health: tools/list 成功但没有默认调用时仅报告连接性', async () => {
  const { defaultTool: _defaultTool, defaultArgs: _defaultArgs, ...connectivityMeta } = meta;
  const result = await checkMcpAgentHealth(connectivityMeta, client());

  assert.equal(result.ok, true);
  assert.equal(result.initializePassed, true);
  assert.deepEqual(result.toolNames, ['Process']);
  assert.equal(result.verification, 'connectivity_only');
  assert.equal(result.outputSha256, undefined);
  assert.equal(result.outputBytes, undefined);
  assert.equal(result.untrusted, undefined);
});

test('mcp-health: server 未声明默认工具时诚实失败且不调用', async () => {
  let called = false;
  const result = await checkMcpAgentHealth(meta, client({
    listTools: async () => [],
    callTool: async () => {
      called = true;
      return { ok: true, output: '', untrusted: true, elapsedMs: 1 };
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.initializePassed, true);
  assert.deepEqual(result.toolNames, []);
  assert.equal(result.verification, 'failed');
  assert.match(result.error ?? '', /未声明默认工具/);
  assert.equal(called, false);
});

test('mcp-health: 默认只读调用失败时不得虚报验证通过', async () => {
  const result = await checkMcpAgentHealth(meta, client({
    callTool: async () => ({
      ok: false,
      output: 'permission denied',
      untrusted: true,
      elapsedMs: 1,
      error: 'permission denied',
    }),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.initializePassed, true);
  assert.deepEqual(result.toolNames, ['Process']);
  assert.equal(result.verification, 'failed');
  assert.equal(result.outputSha256, undefined);
  assert.equal(result.outputBytes, undefined);
  assert.equal(result.untrusted, undefined);
  assert.equal(result.error, 'permission denied');
});

test('mcp-health: initialize 或 tools/list 异常转为可审计失败', async () => {
  const result = await checkMcpAgentHealth(meta, client({
    listTools: async () => { throw new Error('initialize timeout'); },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.initializePassed, false);
  assert.deepEqual(result.toolNames, []);
  assert.equal(result.verification, 'failed');
  assert.equal(result.outputSha256, undefined);
  assert.equal(result.outputBytes, undefined);
  assert.equal(result.untrusted, undefined);
  assert.match(result.error ?? '', /initialize timeout/);
});
