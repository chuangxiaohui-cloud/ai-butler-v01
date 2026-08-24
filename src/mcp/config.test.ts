import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execPath } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMcpAgentConfig, createMcpAgents } from './config.js';

test('loadMcpAgentConfig: 无配置文件返回空', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-config-'));
  try {
    assert.deepEqual(loadMcpAgentConfig(join(dir, 'missing.json')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMcpAgentConfig: 损坏 JSON 返回空', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-config-'));
  try {
    const p = join(dir, 'mcp-agents.json');
    writeFileSync(p, '{bad json', 'utf-8');
    assert.deepEqual(loadMcpAgentConfig(p), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMcpAgentConfig: 过滤缺少命令/白名单的条目', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-config-'));
  try {
    const p = join(dir, 'mcp-agents.json');
    writeFileSync(
      p,
      JSON.stringify({
        agents: [
          { id: 'ok', command: ['a.exe'], allowedTools: ['X'] },
          { id: 'no-cmd', allowedTools: ['X'] },
          { id: 'no-whitelist', command: ['a.exe'] },
          'bad',
        ],
      }),
      'utf-8',
    );
    const entries = loadMcpAgentConfig(p);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.id, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createMcpAgents: 未知 agent id 被跳过（保持注册表为准）', () => {
  const { metas, clients } = createMcpAgents([
    { id: 'nope', command: ['x.exe'], allowedTools: ['X'] },
  ]);
  assert.equal(metas.length, 0);
  assert.equal(clients.size, 0);
});

test('createMcpAgents: 合法配置启用子 Agent 并保留注册表前缀/类别', () => {
  const { metas, clients } = createMcpAgents([
    { id: 'windows', command: [execPath, '-e', 'process.stdin.resume()'], allowedTools: ['Process'] },
  ]);
  assert.equal(metas.length, 1);
  assert.equal(metas[0]!.available, true);
  assert.equal(metas[0]!.toolPrefix, 'windows.');
  assert.equal(metas[0]!.category, 'system');
  assert.equal(metas[0]!.allowedTools?.[0], 'Process');
  assert.ok(clients.has('windows'));
  clients.get('windows')?.close();
});