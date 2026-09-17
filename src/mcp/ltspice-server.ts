import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { discoverLtspiceSchematics, inspectLtspiceSchematic, runLtspiceSimulation } from './ltspice.js';

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
  {
    name: 'RunSimulation',
    description:
      '经批准后先 -netlist 再以 -b 批模式运行 LTspice；可选白名单批开关（-ascii/-alt）；产物限定在原理图同目录沙箱内',
    inputSchema: {
      type: 'object',
      properties: {
        schematicPath: { type: 'string' },
        extraBatchFlags: {
          type: 'array',
          items: { type: 'string' },
          description: '可选批开关白名单：仅 -ascii、-alt',
        },
      },
      required: ['schematicPath'],
      additionalProperties: false,
    },
  },
];

function send(id: RpcRequest['id'], result?: unknown, error?: { code: number; message: string }) {
  if (id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
}

async function callTool(params: Record<string, unknown>): Promise<unknown> {
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
  if (name === 'RunSimulation') {
    if (typeof args.schematicPath !== 'string') throw new Error('schematicPath 必须是字符串');
    if (!executable) throw new Error('未配置 LTspice，无法执行仿真');
    const extraBatchFlags = Array.isArray(args.extraBatchFlags)
      ? args.extraBatchFlags.filter((item): item is string => typeof item === 'string')
      : undefined;
    return runLtspiceSimulation({
      schematicPath: args.schematicPath,
      workspaceRoot,
      executable,
      ...(extraBatchFlags ? { extraBatchFlags } : {}),
    });
  }
  throw new Error(`未知 LTspice 工具：${name}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let request: RpcRequest;
  try { request = JSON.parse(line) as RpcRequest; } catch { return; }
  try {
    if (request.method === 'initialize') {
      send(request.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ai-butler-ltspice', version: '0.1.0' } });
    } else if (request.method === 'tools/list') {
      send(request.id, { tools });
    } else if (request.method === 'tools/call') {
      send(request.id, { content: [{ type: 'text', text: JSON.stringify(await callTool(request.params ?? {})) }] });
    } else if (request.id !== undefined) {
      send(request.id, undefined, { code: -32601, message: `未知方法：${request.method ?? ''}` });
    }
  } catch (error) {
    send(request.id, { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true });
  }
});
