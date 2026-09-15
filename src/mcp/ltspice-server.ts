import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { discoverLtspiceSchematics, inspectLtspiceSchematic } from './ltspice.js';

interface RpcRequest { id?: number | string; method?: string; params?: Record<string, unknown> }

const argv = process.argv.slice(2);
const valueAfter = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const workspaceRoot = resolve(valueAfter('--workspace-root') ?? process.cwd());
const executable = valueAfter('--ltspice') ?? '';

const tools = [
  {
    name: 'DiscoverSchematics',
    description: '只读发现沙箱内 LTspice .asc 原理图；不启动仿真',
    inputSchema: { type: 'object', properties: { root: { type: 'string' } }, required: ['root'], additionalProperties: false },
  },
  {
    name: 'InspectSchematic',
    description: '只读提取元件、实例名、模型引用和仿真指令；不写参数、不生成 raw/log/net',
    inputSchema: { type: 'object', properties: { schematicPath: { type: 'string' } }, required: ['schematicPath'], additionalProperties: false },
  },
];

function send(id: RpcRequest['id'], result?: unknown, error?: { code: number; message: string }) {
  if (id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
}

function callTool(params: Record<string, unknown>): unknown {
  const name = typeof params.name === 'string' ? params.name : '';
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments as Record<string, unknown> : {};
  if (name === 'DiscoverSchematics') {
    if (typeof args.root !== 'string') throw new Error('root 必须是字符串');
    const schematics = discoverLtspiceSchematics(args.root, workspaceRoot);
    return { schematics, count: schematics.length };
  }
  if (name === 'InspectSchematic') {
    if (typeof args.schematicPath !== 'string') throw new Error('schematicPath 必须是字符串');
    return inspectLtspiceSchematic({ schematicPath: args.schematicPath, workspaceRoot, ...(executable ? { executable } : {}) });
  }
  throw new Error(`未知 LTspice 工具：${name}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let request: RpcRequest;
  try { request = JSON.parse(line) as RpcRequest; } catch { return; }
  try {
    if (request.method === 'initialize') {
      send(request.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ai-butler-ltspice', version: '0.1.0' } });
    } else if (request.method === 'tools/list') {
      send(request.id, { tools });
    } else if (request.method === 'tools/call') {
      send(request.id, { content: [{ type: 'text', text: JSON.stringify(callTool(request.params ?? {})) }] });
    } else if (request.id !== undefined) {
      send(request.id, undefined, { code: -32601, message: `未知方法：${request.method ?? ''}` });
    }
  } catch (error) {
    send(request.id, { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true });
  }
});
