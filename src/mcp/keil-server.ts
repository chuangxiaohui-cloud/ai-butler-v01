import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import { buildKeilProject, discoverKeilProjects, inspectKeilProjectProfile, listKeilTargets, relativeKeilProjects } from './keil.js';
import { ProjectProfileStore } from './project-profile-store.js';

interface RpcRequest {
  jsonrpc?: string;
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
const keilExecutable = valueAfter('--uv4') ?? process.env.KEIL_UV4_PATH ?? '';
const profileStore = new ProjectProfileStore(
  resolve(valueAfter('--profile-root') ?? resolve(workspaceRoot, 'data', 'project-profiles')),
);

const tools = [
  {
    name: 'InspectProjectProfile',
    description: '只读盘点 .uvprojx、target/device 与已配置 UV4，并写入内部项目画像证据缓存；不编译、不烧录',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'ListTargets',
    description: '只读解析工作区内现存 .uvprojx 的 target 名称；不修改工程',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'DiscoverProjects',
    description: '在工作区沙箱目录内递归发现 Keil .uvprojx 工程（只读）',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string' } },
      required: ['root'],
      additionalProperties: false,
    },
  },
  {
    name: 'BuildProject',
    description: '调用 Keil UV4 编译工作区内现存 .uvprojx，解析 warning/error；不烧录、不改工程',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        target: { type: 'string' },
      },
      required: ['projectPath'],
      additionalProperties: false,
    },
  },
];

function send(id: RpcRequest['id'], result?: unknown, error?: { code: number; message: string }) {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
}

async function callTool(params: Record<string, unknown>, signal?: AbortSignal) {
  const name = typeof params.name === 'string' ? params.name : '';
  const args = params.arguments && typeof params.arguments === 'object'
    ? params.arguments as Record<string, unknown>
    : {};
  if (name === 'DiscoverProjects') {
    if (typeof args.root !== 'string') throw new Error('root 必须是字符串');
    const projects = discoverKeilProjects(args.root, workspaceRoot);
    return { projects: relativeKeilProjects(projects, workspaceRoot), count: projects.length };
  }
  if (name === 'InspectProjectProfile') {
    if (typeof args.projectPath !== 'string') throw new Error('projectPath 必须是字符串');
    const profile = inspectKeilProjectProfile({
      projectPath: args.projectPath,
      workspaceRoot,
      executable: keilExecutable,
    });
    const saved = profileStore.mergeAndSave(profile);
    if (!saved.ok || !saved.path) throw new Error(saved.reason ?? '项目画像写入失败');
    return { profile, profilePath: saved.path };
  }
  if (name === 'BuildProject') {
    if (typeof args.projectPath !== 'string') throw new Error('projectPath 必须是字符串');
    if (!keilExecutable) throw new Error('未配置 Keil UV4 路径');
    return await buildKeilProject({
      projectPath: args.projectPath,
      ...(typeof args.target === 'string' ? { target: args.target } : {}),
      executable: keilExecutable,
      workspaceRoot,
      signal,
    });
  }
  if (name === 'ListTargets') {
    if (typeof args.projectPath !== 'string') throw new Error('projectPath 必须是字符串');
    const targets = listKeilTargets(args.projectPath, workspaceRoot);
    return { projectPath: args.projectPath, targets, count: targets.length };
  }
  throw new Error(`未知 Keil 工具：${name}`);
}

const rl = createInterface({ input: process.stdin });
const activeCalls = new Map<number | string, AbortController>();
rl.on('line', (line) => {
  void (async () => {
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
    } catch {
      return;
    }
    if (request.method === 'notifications/cancelled') {
      const requestId = request.params?.requestId;
      if (typeof requestId === 'number' || typeof requestId === 'string') activeCalls.get(requestId)?.abort();
      return;
    }
    try {
      if (request.method === 'initialize') {
        send(request.id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'ai-butler-keil', version: '0.1.0' },
        });
      } else if (request.method === 'tools/list') {
        send(request.id, { tools });
      } else if (request.method === 'tools/call') {
        const controller = new AbortController();
        if (request.id !== undefined) activeCalls.set(request.id, controller);
        try {
          const data = await callTool(request.params ?? {}, controller.signal);
          const buildFailed = request.params?.name === 'BuildProject' &&
            typeof data === 'object' && data !== null && 'ok' in data && data.ok === false;
          send(request.id, { content: [{ type: 'text', text: JSON.stringify(data) }], isError: buildFailed });
        } finally {
          if (request.id !== undefined) activeCalls.delete(request.id);
        }
      } else if (request.id !== undefined) {
        send(request.id, undefined, { code: -32601, message: `未知方法：${request.method ?? ''}` });
      }
    } catch (err) {
      send(request.id, {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      });
    }
  })();
});
