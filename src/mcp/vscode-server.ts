import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { discoverVsCodeWorkspaces, inspectVsCodeWorkspace } from './vscode.js';

interface RpcRequest {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

const argv = process.argv.slice(2);
const valueAfter = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const workspaceRoot = resolve(valueAfter('--workspace-root') ?? process.cwd());
const vscodeExecutable = valueAfter('--code') ?? '';

const tools = [
  {
    name: 'DiscoverWorkspaces',
    description: '只读发现沙箱内含 .vscode 或 .code-workspace 的工作区；不启动 VS Code',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string' } },
      required: ['root'],
      additionalProperties: false,
    },
  },
  {
    name: 'InspectWorkspace',
    description: '只读盘点 VS Code tasks/launch/C++/settings 与诊断来源；不回显或执行 task 命令',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string' } },
      required: ['root'],
      additionalProperties: false,
    },
  },
];

function send(id: RpcRequest['id'], result?: unknown, error?: { code: number; message: string }) {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
}

function callTool(params: Record<string, unknown>): unknown {
  const name = typeof params.name === 'string' ? params.name : '';
  const args = params.arguments && typeof params.arguments === 'object'
    ? params.arguments as Record<string, unknown>
    : {};
  if (typeof args.root !== 'string') throw new Error('root 必须是字符串');
  if (name === 'DiscoverWorkspaces') {
    const workspaces = discoverVsCodeWorkspaces(args.root, workspaceRoot);
    return { workspaces, count: workspaces.length };
  }
  if (name === 'InspectWorkspace') {
    return inspectVsCodeWorkspace({
      root: args.root,
      workspaceRoot,
      ...(vscodeExecutable ? { executable: vscodeExecutable } : {}),
    });
  }
  throw new Error(`未知 VS Code 工具：${name}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let request: RpcRequest;
  try {
    request = JSON.parse(line) as RpcRequest;
  } catch {
    return;
  }
  try {
    if (request.method === 'initialize') {
      send(request.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-butler-vscode', version: '0.1.0' },
      });
    } else if (request.method === 'tools/list') {
      send(request.id, { tools });
    } else if (request.method === 'tools/call') {
      const data = callTool(request.params ?? {});
      send(request.id, { content: [{ type: 'text', text: JSON.stringify(data) }] });
    } else if (request.id !== undefined) {
      send(request.id, undefined, { code: -32601, message: `未知方法：${request.method ?? ''}` });
    }
  } catch (error) {
    send(request.id, {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    });
  }
});
