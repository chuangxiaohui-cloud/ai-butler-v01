/**
 * v1.0 S3：MCP 客户端（stdio JSON-RPC 2.0 最小集）
 * MCP 标准协议子集：initialize → tools/list → tools/call，行分隔 JSON。
 * 启动超时 [P-57]、调用/心跳超时 [P-41]；子进程退出时未决请求全部 reject。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PARAMS } from '../config/params.js';
import type { McpCallResult, McpClient, McpTool } from './types.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

let nextId = 0;

export class StdioMcpClient implements McpClient {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly rl: ReturnType<typeof createInterface>;
  private readonly pending = new Map<number, PendingRequest>();
  private initialized = false;

  constructor(
    command: string[],
    private readonly opts: { heartbeatMs?: number; startTimeoutMs?: number } = {},
  ) {
    if (command.length === 0) throw new Error('MCP 客户端需要启动命令');
    this.proc = spawn(command[0], command.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => this.handleLine(line));
    this.proc.stderr.on('data', () => {
      // stderr 仅作诊断，协议错误走 JSON-RPC error 响应
    });
    this.proc.on('exit', () => {
      for (const req of this.pending.values()) {
        req.reject(new Error('MCP 子进程退出'));
      }
      this.pending.clear();
    });
  }

  /** MCP 握手（initialize）：等待 protocolVersion/capabilities，启动超时 [P-57] */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // E240：MCP 规范 initialize 必填 clientInfo（真实 server 如 windows-mcp 用 pydantic 严格校验，缺字段直接拒绝）
    await this.request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ai-butler', version: '0.1.0' } }, this.startTimeout());
    this.initialized = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = (await this.request('tools/list', {}, this.heartbeat())) as {
      tools?: McpTool[];
    };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpCallResult> {
    await this.initialize();
    const started = Date.now();
    try {
      const result = (await this.request('tools/call', { name, arguments: args }, timeoutMs ?? this.heartbeat())) as {
        content?: Array<{ type?: string; text?: string }>;
        isError?: boolean;
      };
      const text = (result?.content ?? [])
        .map((item) => item?.text ?? '')
        .join('\n');
      return {
        ok: !result?.isError,
        output: text,
        untrusted: true,
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      const timedOut = err instanceof Error && /超时/.test(err.message);
      return {
        ok: false,
        output: '',
        untrusted: true,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
        timedOut,
      };
    }
  }

  close(): void {
    this.rl.close();
    this.proc.kill();
  }

  private heartbeat(): number {
    return this.opts.heartbeatMs ?? PARAMS.subAgentHeartbeatMs;
  }

  private startTimeout(): number {
    return this.opts.startTimeoutMs ?? PARAMS.subAgentStartTimeoutMs;
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onTimeout = () => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时（${method}，${timeoutMs}ms）`));
      };
      timer = setTimeout(onTimeout, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          if (timer !== undefined) clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          if (timer !== undefined) clearTimeout(timer);
          reject(reason);
        },
      });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: { id?: number; result?: unknown; error?: { message?: string } } | null = null;
    try {
      message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
    } catch {
      return; // 忽略非 JSON 行（协议外输出）
    }
    if (message.id === undefined) return;
    const req = this.pending.get(message.id);
    if (!req) return;
    this.pending.delete(message.id);
    if (message.error) {
      req.reject(new Error(message.error.message ?? 'MCP 错误'));
    } else {
      req.resolve(message.result);
    }
  }
}
