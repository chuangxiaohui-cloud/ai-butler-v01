import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpAgentSkill } from './index.js';
import type { SkillDeps } from '../deps.js';

const skill = createMcpAgentSkill();

function depsWithSubAgent(dispatch: SkillDeps['subAgent']): SkillDeps {
  return {
    callVLM: async () => '',
    subAgent: dispatch,
  };
}

test('mcp-agent: 未装配 subAgent 时诚实提示', async () => {
  const out = await skill.execute(
    { query: '列出当前进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    { callVLM: async () => '' },
  );
  assert.match(String(out.result), /未装配/);
});

test('mcp-agent: 成功 dispatch 返回工具输出（untrusted）', async () => {
  const deps = depsWithSubAgent({
    dispatch: async () => ({
      ok: true,
      agentId: 'windows',
      output: 'PID 1234 explorer.exe',
      untrusted: true,
      attempts: 1,
      elapsedMs: 50,
      degraded: false,
    }),
  });
  const out = await skill.execute(
    { query: '列出当前进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    deps,
  );
  assert.match(String(out.result), /PID 1234/);
});

test('mcp-agent: 显式工具名透传给调度器', async () => {
  let seenToolName: string | undefined;
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenToolName = options?.toolName;
      return { ok: false, agentId: '', output: '', untrusted: true, attempts: 0, elapsedMs: 0, degraded: false, error: 'x' };
    },
  });
  await skill.execute(
    { query: '用 windows.Process 查看进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    deps,
  );
  assert.equal(seenToolName, 'windows.Process');
});

test('mcp-agent: 失败时返回错误并低置信', async () => {
  const deps = depsWithSubAgent({
    dispatch: async () => ({
      ok: false,
      agentId: 'windows',
      output: '',
      untrusted: true,
      attempts: 1,
      elapsedMs: 10,
      degraded: false,
      error: '工具不在白名单内',
    }),
  });
  const out = await skill.execute(
    { query: '列出进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    deps,
  );
  assert.match(String(out.result), /工具不在白名单内/);
  assert.equal(out.confidence, 0.3);
});