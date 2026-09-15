import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { StdioMcpClient } from '../../src/mcp/client.js';
import { SubAgentDispatcher } from '../../src/mcp/dispatcher.js';
import type { SubAgentMeta } from '../../src/mcp/types.js';

function serverCommand(root: string): string[] {
  return [
    process.execPath,
    '--import',
    'tsx',
    join(process.cwd(), 'src', 'mcp', 'keil-server.ts'),
    '--workspace-root',
    root,
    '--uv4',
    process.execPath,
  ];
}

function keilMeta(): SubAgentMeta {
  return {
    id: 'keil',
    name: 'Keil',
    category: 'build',
    toolPrefix: 'keil.',
    available: true,
    command: ['node'],
    allowedTools: ['DiscoverProjects', 'ListTargets', 'BuildProject'],
    defaultTool: 'keil.DiscoverProjects',
    defaultArgs: { root: 'projects' },
  };
}

test('INT-MCP-KEIL-001：Keil MCP 发现工程并返回 E389 契约', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keil-mcp-int-'));
  const project = join(root, 'projects', 'demo', 'demo.uvprojx');
  mkdirSync(dirname(project), { recursive: true });
  writeFileSync(project, '<Project/>', 'utf-8');
  const client = new StdioMcpClient(serverCommand(root), { startTimeoutMs: 5000, heartbeatMs: 5000 });
  const meta = keilMeta();
  const dispatcher = new SubAgentDispatcher([meta], new Map([['keil', client]]));
  try {
    const result = await dispatcher.dispatch('发现 Keil 工程', {
      toolName: 'keil.DiscoverProjects',
      args: { root: 'projects' },
      category: 'build',
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.status, 'succeeded');
    assert.equal(result.task.description, '发现 Keil 工程');
    const output = JSON.parse(result.output) as { projects: string[]; count: number };
    assert.equal(output.count, 1);
    assert.match(output.projects[0] ?? '', /demo[\\/]demo\.uvprojx/);
    assert.equal(result.artifacts[0]?.untrusted, true);
    assert.equal(result.evidence[0]?.toolName, 'DiscoverProjects');
  } finally {
    client.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('INT-MCP-KEIL-003：编译失败仍保留结构化产物与调用证据', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keil-mcp-int-'));
  const project = join(root, 'projects', 'demo.uvprojx');
  mkdirSync(dirname(project), { recursive: true });
  writeFileSync(project, '<Project/>', 'utf-8');
  const client = new StdioMcpClient(serverCommand(root), { startTimeoutMs: 5000, heartbeatMs: 5000 });
  const dispatcher = new SubAgentDispatcher([keilMeta()], new Map([['keil', client]]));
  try {
    const result = await dispatcher.dispatch('编译测试工程', {
      toolName: 'keil.BuildProject',
      args: { projectPath: project },
      category: 'build',
      opKind: 'compile',
      retryCount: 0,
    });
    assert.equal(result.ok, false);
    assert.equal(result.failure?.code, 'tool_error');
    assert.equal(result.artifacts.length, 1);
    assert.match(result.artifacts[0]?.content ?? '', /"projectPath"/);
    assert.equal(result.evidence[0]?.toolName, 'BuildProject');
    assert.equal(result.handoff.required, true);
  } finally {
    client.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('INT-MCP-KEIL-004：真实 Keil MCP server 只读返回 target 清单', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keil-mcp-int-'));
  const project = join(root, 'projects', 'demo.uvprojx');
  mkdirSync(dirname(project), { recursive: true });
  writeFileSync(project, '<Project><Targets><Target><TargetName>Debug</TargetName></Target><Target><TargetName>Release</TargetName></Target></Targets></Project>', 'utf-8');
  const client = new StdioMcpClient(serverCommand(root), { startTimeoutMs: 5000, heartbeatMs: 5000 });
  const dispatcher = new SubAgentDispatcher([keilMeta()], new Map([['keil', client]]));
  try {
    const result = await dispatcher.dispatch('列出 target', {
      toolName: 'keil.ListTargets',
      args: { projectPath: project },
      category: 'build',
    });
    assert.equal(result.ok, true, result.error);
    const output = JSON.parse(result.output) as { targets: string[]; count: number };
    assert.deepEqual(output.targets, ['Debug', 'Release']);
    assert.equal(output.count, 2);
    assert.equal(result.evidence[0]?.toolName, 'ListTargets');
  } finally {
    client.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('INT-MCP-KEIL-002：Keil MCP 越界发现返回具体安全错误', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keil-mcp-int-'));
  mkdirSync(join(root, 'projects'), { recursive: true });
  const client = new StdioMcpClient(serverCommand(root), { startTimeoutMs: 5000, heartbeatMs: 5000 });
  try {
    const result = await client.callTool('DiscoverProjects', { root: '..' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /越界/);
  } finally {
    client.close();
    rmSync(root, { recursive: true, force: true });
  }
});
