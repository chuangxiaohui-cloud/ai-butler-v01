import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createMcpAgents, closeMcpAgents, loadMcpAgentConfig } from '../../src/mcp/config.js';
import { SubAgentDispatcher } from '../../src/mcp/dispatcher.js';
import { createMcpAgentSkill } from '../../src/skills/mcp-agent/index.js';

const windowsConfig = loadMcpAgentConfig().find((entry) => entry.id === 'windows');
const hasServer = Boolean(windowsConfig && existsSync(windowsConfig.command[0]!));
const skipReason = hasServer ? false : '本机未配置或未安装 windows-mcp（真实 server 集成测试跳过）';

function buildRuntime() {
  if (!windowsConfig) throw new Error('本机未配置 windows-mcp');
  const { metas, clients } = createMcpAgents([windowsConfig]);
  return { metas, clients, dispatcher: new SubAgentDispatcher(metas, clients) };
}

test('INT-MCP-001：真实 windows-mcp 端到端——白名单外拒绝、白名单内只读调用', { skip: skipReason }, async () => {
  const { metas, clients, dispatcher } = buildRuntime();
  try {
    assert.equal(metas.length, 1);
    assert.equal(metas[0]!.available, true);
    // 白名单外：windows.PowerShell 未列白名单 → 拒绝且不启动真实调用
    const denied = await dispatcher.dispatch('执行命令', { toolName: 'windows.PowerShell' });
    assert.equal(denied.ok, false);
    assert.match(denied.error ?? '', /白名单/);
    // 白名单内：windows.Process(mode=list) 真实调用
    const res = await dispatcher.dispatch('列出进程', {
      toolName: 'windows.Process',
      args: { mode: 'list', limit: 5 },
    });
    assert.equal(res.ok, true, res.error);
    assert.ok(res.output.length > 0);
    assert.equal(res.untrusted, true);
    assert.equal(res.agentId, 'windows');
    assert.equal(res.task.description, '列出进程');
    assert.equal(res.status, 'succeeded');
    assert.deepEqual(res.plan.map((step) => step.status), ['completed', 'completed', 'completed']);
    assert.equal(res.artifacts[0]?.untrusted, true);
    assert.equal(res.evidence[0]?.toolName, 'Process');
    assert.equal(res.handoff.required, false);
  } finally {
    closeMcpAgents(clients);
  }
});

test('INT-MCP-002：mcp-agent skill 全链路——自然语言列出进程走只读默认', { skip: skipReason }, async () => {
  const { clients, dispatcher } = buildRuntime();
  const skill = createMcpAgentSkill();
  try {
    const out = await skill.execute(
      {
        query: '列出当前进程',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        workingMemory: [],
        params: { mode: 'execute', userId: 'int', conversationId: 'int' },
      },
      {
        callVLM: async () => '',
        subAgent: { dispatch: (task, options) => dispatcher.dispatch(task, options) },
      },
    );
    assert.equal(out.confidence, 0.8);
    const text = String(out.result);
    assert.ok(text.includes('PID') || text.includes('进程'), text.slice(0, 100));
  } finally {
    closeMcpAgents(clients);
  }
});

test('INT-MCP-003：危险参数 kill 默认拒绝（§10 双闸）', { skip: skipReason }, async () => {
  const { clients, dispatcher } = buildRuntime();
  const skill = createMcpAgentSkill();
  try {
    const out = await skill.execute(
      {
        query: '用 windows.Process(mode=kill,pid=1234) 结束进程',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        workingMemory: [],
        params: { mode: 'execute', userId: 'int', conversationId: 'int' },
      },
      {
        callVLM: async () => '',
        subAgent: { dispatch: (task, options) => dispatcher.dispatch(task, options) },
      },
    );
    assert.match(String(out.result), /默认拒绝/);
  } finally {
    closeMcpAgents(clients);
  }
});
