import { createInterface } from 'node:readline';
import { relative, resolve } from 'node:path';

import { ProjectProfileStore } from './project-profile-store.js';
import { buildStm32GccProject, discoverStm32GccProjects, inspectStm32GccProject } from './stm32-gcc.js';

interface RpcRequest { id?: number | string; method?: string; params?: Record<string, unknown> }
const argv = process.argv.slice(2);
const valueAfter = (name: string) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const workspaceRoot = resolve(valueAfter('--workspace-root') ?? process.cwd());
const cmakeExecutable = valueAfter('--cmake') ?? process.env.CMAKE_PATH ?? '';
const profileStore = new ProjectProfileStore(resolve(valueAfter('--profile-root') ?? resolve(workspaceRoot, 'data', 'project-profiles')));

const tools = [
  { name: 'DiscoverProjects', description: '只读发现带 STM32/ARM GCC 证据的 CMake 工程', inputSchema: { type: 'object', properties: { root: { type: 'string' } }, required: ['root'], additionalProperties: false } },
  { name: 'InspectProjectProfile', description: '只读盘点 CMake/compile_commands 并保存 STM32-GCC 项目画像；不构建、不烧录', inputSchema: { type: 'object', properties: { root: { type: 'string' } }, required: ['root'], additionalProperties: false } },
  { name: 'BuildProject', description: '固定调用 cmake --build 并解析 GCC 诊断；不烧录', inputSchema: { type: 'object', properties: { root: { type: 'string' }, buildDir: { type: 'string' }, target: { type: 'string' } }, required: ['root', 'buildDir'], additionalProperties: false } },
];

function send(id: RpcRequest['id'], result?: unknown, error?: { code: number; message: string }) {
  if (id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) })}\n`);
}

async function callTool(params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const name = typeof params.name === 'string' ? params.name : '';
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments as Record<string, unknown> : {};
  if (name === 'DiscoverProjects') {
    if (typeof args.root !== 'string') throw new Error('root 必须是字符串');
    const projects = discoverStm32GccProjects(args.root, workspaceRoot).map((path) => relative(workspaceRoot, path));
    return { projects, count: projects.length, platform: 'stm32-gcc-cmake' };
  }
  if (name === 'InspectProjectProfile') {
    if (typeof args.root !== 'string') throw new Error('root 必须是字符串');
    const profile = inspectStm32GccProject({ root: args.root, workspaceRoot, ...(cmakeExecutable ? { cmakeExecutable } : {}) });
    const saved = profileStore.mergeAndSave(profile);
    if (!saved.ok || !saved.path) throw new Error(saved.reason ?? '项目画像写入失败');
    return { profile, profilePath: saved.path };
  }
  if (name === 'BuildProject') {
    if (typeof args.root !== 'string' || typeof args.buildDir !== 'string') throw new Error('root/buildDir 必须是字符串');
    if (!cmakeExecutable) throw new Error('未配置 CMake 路径');
    return await buildStm32GccProject({ root: args.root, buildDir: args.buildDir, ...(typeof args.target === 'string' ? { target: args.target } : {}), cmakeExecutable, workspaceRoot, signal });
  }
  throw new Error(`未知 STM32-GCC 工具：${name}`);
}

const rl = createInterface({ input: process.stdin });
const activeCalls = new Map<number | string, AbortController>();
rl.on('line', (line) => { void (async () => {
  let request: RpcRequest;
  try { request = JSON.parse(line) as RpcRequest; } catch { return; }
  try {
    if (request.method === 'initialize') send(request.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ai-butler-stm32-gcc', version: '0.1.0' } });
    else if (request.method === 'tools/list') send(request.id, { tools });
    else if (request.method === 'tools/call') {
      const controller = new AbortController();
      if (request.id !== undefined) activeCalls.set(request.id, controller);
      try {
        const data = await callTool(request.params ?? {}, controller.signal);
        const failed = request.params?.name === 'BuildProject' && typeof data === 'object' && data !== null && 'ok' in data && data.ok === false;
        send(request.id, { content: [{ type: 'text', text: JSON.stringify(data) }], isError: failed });
      } finally { if (request.id !== undefined) activeCalls.delete(request.id); }
    } else if (request.method === 'notifications/cancelled') {
      const id = request.params?.requestId;
      if (typeof id === 'string' || typeof id === 'number') activeCalls.get(id)?.abort();
    } else if (request.id !== undefined) send(request.id, undefined, { code: -32601, message: `未知方法：${request.method ?? ''}` });
  } catch (error) {
    send(request.id, { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true });
  }
})(); });
