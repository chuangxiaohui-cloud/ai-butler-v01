import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { discoverKiCadProjects, inspectKiCadProject, runKiCadErc } from './kicad.js';
import { applyKiCadSchematicEdit, type KiCadSchematicEdit } from './kicad-edit.js';

interface RpcRequest { id?: number | string; method?: string; params?: Record<string, unknown> }

const argv = process.argv.slice(2);
const valueAfter = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const workspaceRoot = resolve(valueAfter('--workspace-root') ?? process.cwd());
const executable = valueAfter('--kicad-cli') ?? '';

const tools = [
  {
    name: 'DiscoverProjects',
    description: '只读发现沙箱内 KiCad 工程和原理图',
    inputSchema: { type: 'object', properties: { root: { type: 'string' } }, required: ['root'], additionalProperties: false },
  },
  {
    name: 'InspectProject',
    description: '只读盘点 KiCad 工程、原理图、PCB 和结构统计',
    inputSchema: { type: 'object', properties: { projectPath: { type: 'string' } }, required: ['projectPath'], additionalProperties: false },
  },
  {
    name: 'RunErc',
    description: '调用固定 kicad-cli sch erc 命令生成临时 JSON 报告；不修改工程文件',
    inputSchema: { type: 'object', properties: { schematicPath: { type: 'string' } }, required: ['schematicPath'], additionalProperties: false },
  },
  {
    name: 'EditSchematic',
    description: '有界编辑 .kicad_sch（追加注解或单次精确替换），经项目事务快照后落盘',
    inputSchema: {
      type: 'object',
      properties: {
        schematicPath: { type: 'string' },
        edit: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['append_annotation', 'replace_text'] },
            text: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['kind'],
          additionalProperties: false,
        },
      },
      required: ['schematicPath', 'edit'],
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
  if (name === 'DiscoverProjects') {
    if (typeof args.root !== 'string') throw new Error('root 必须是字符串');
    const projects = discoverKiCadProjects(args.root, workspaceRoot);
    return { platform: 'kicad', projects, count: projects.length };
  }
  if (name === 'InspectProject') {
    if (typeof args.projectPath !== 'string') throw new Error('projectPath 必须是字符串');
    return inspectKiCadProject({ projectPath: args.projectPath, workspaceRoot, ...(executable ? { executable } : {}) });
  }
  if (name === 'RunErc') {
    if (typeof args.schematicPath !== 'string') throw new Error('schematicPath 必须是字符串');
    if (!executable) throw new Error('未配置 KiCad CLI，无法执行 ERC');
    return runKiCadErc({ schematicPath: args.schematicPath, workspaceRoot, executable });
  }
  if (name === 'EditSchematic') {
    if (typeof args.schematicPath !== 'string') throw new Error('schematicPath 必须是字符串');
    const edit = parseEdit(args.edit);
    const result = applyKiCadSchematicEdit({ schematicPath: args.schematicPath, edit, workspaceRoot });
    if (!result.ok) throw new Error(result.error ?? 'KiCad 编辑失败');
    return {
      ok: true,
      summary: result.summary,
      transactionId: result.transactionId,
      committedPaths: result.committedPaths,
      snapshotDir: result.snapshotDir,
    };
  }
  throw new Error(`未知 KiCad 工具：${name}`);
}

function parseEdit(value: unknown): KiCadSchematicEdit {
  if (!value || typeof value !== 'object') throw new Error('edit 必须是对象');
  const record = value as Record<string, unknown>;
  if (record.kind === 'append_annotation') {
    if (typeof record.text !== 'string') throw new Error('append_annotation 需要 text');
    return { kind: 'append_annotation', text: record.text };
  }
  if (record.kind === 'replace_text') {
    if (typeof record.from !== 'string' || typeof record.to !== 'string') {
      throw new Error('replace_text 需要 from/to');
    }
    return { kind: 'replace_text', from: record.from, to: record.to };
  }
  throw new Error('不支持的 edit.kind');
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let request: RpcRequest;
  try { request = JSON.parse(line) as RpcRequest; } catch { return; }
  try {
    if (request.method === 'initialize') {
      send(request.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ai-butler-kicad', version: '0.1.0' } });
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
