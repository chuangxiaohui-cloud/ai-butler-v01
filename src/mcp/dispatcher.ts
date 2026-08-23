/**
 * v1.0 S3：子 Agent 调度器（§11.1 失败处理矩阵）
 * 选择可用子 Agent（工具前缀精确匹配 > 类别 > 任意）→ 调用（心跳 [P-41] 超时）
 * → 失败按重试次数重试（确定性 [P-44] / 非确定性 [P-45]，指数退避基数 [P-46]）
 * → 重试耗尽降级到同类别备用子 Agent → 仍失败返回可审计错误。
 * 取消信号在调用与退避之间生效；返回一律标记 untrusted。
 */

import { PARAMS } from '../config/params.js';
import type { McpClient } from './types.js';
import type { SubAgentCategory, SubAgentMeta } from './types.js';
import { validateMcpCall } from './safety.js';

export type McpOpKind = 'compile' | 'flash' | 'filegen' | 'tool';

export interface DispatchOptions {
  /** 目标工具名（含前缀）；按前缀匹配子 Agent */
  toolName?: string;
  args?: Record<string, unknown>;
  /** 限定类别内调度与降级 */
  category?: SubAgentCategory;
  /** 操作类型，决定默认超时（§11.1.3：[P-38]/[P-39]/[P-40]；缺省 [P-41] 心跳） */
  opKind?: McpOpKind;
  /** true → 重试 [P-44]（确定性操作）；false → 重试 [P-45]（非确定性） */
  deterministic?: boolean;
  /** 覆盖默认重试次数 */
  retryCount?: number;
  /** 覆盖操作类型默认超时 */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface DispatchResult {
  ok: boolean;
  agentId: string;
  output: string;
  untrusted: true;
  attempts: number;
  elapsedMs: number;
  degraded: boolean;
  timedOut?: boolean;
  error?: string;
}

export interface DispatcherOpts {
  /** 覆盖 [P-46] 退避基数（测试可调小） */
  backoffBaseMs?: number;
}

export class SubAgentDispatcher {
  constructor(
    private readonly metas: SubAgentMeta[],
    private readonly clients: Map<string, McpClient>,
    private readonly opts: DispatcherOpts = {},
  ) {}

  async dispatch(task: string, options: DispatchOptions = {}): Promise<DispatchResult> {
    void task;
    const start = Date.now();
    const candidates = this.pickCandidates(options);
    if (candidates.length === 0) {
      return {
        ok: false,
        agentId: '',
        output: '',
        untrusted: true,
        attempts: 0,
        elapsedMs: 0,
        degraded: false,
        error: '没有可用的子 Agent',
      };
    }

    const retryCount =
      options.retryCount ??
      (options.deterministic ? PARAMS.subAgentRetryDeterministic : PARAMS.subAgentRetryNonDeterministic);
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs(options.opKind);
    const backoffBaseMs = this.opts.backoffBaseMs ?? PARAMS.subAgentBackoffBaseMs;

    let attempts = 0;
    let lastError = '';
    let lastTimedOut = false;

    for (let index = 0; index < candidates.length; index++) {
      const meta = candidates[index];
      const client = this.clients.get(meta.id);
      if (!client) continue;
      // 降级时若请求工具名不属于该 agent 前缀，回退到其默认 run 工具
      const requested = options.toolName;
      const toolName =
        requested && requested.startsWith(meta.toolPrefix) ? requested : `${meta.toolPrefix}run`;
      const validation = validateMcpCall(meta, toolName, options.args ?? {});
      if (!validation.ok) {
        lastError = validation.reason ?? '白名单校验失败';
        continue;
      }
      const maxAttempts = 1 + retryCount;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (options.signal?.aborted) {
          return {
            ok: false,
            agentId: meta.id,
            output: '',
            untrusted: true,
            attempts,
            elapsedMs: Date.now() - start,
            degraded: index > 0,
            error: '已取消',
          };
        }
        attempts++;
        try {
          const result = await client.callTool(toolName, options.args ?? {}, timeoutMs);
          if (result.ok) {
            return {
              ok: true,
              agentId: meta.id,
              output: result.output,
              untrusted: true,
              attempts,
              elapsedMs: Date.now() - start,
              degraded: index > 0,
            };
          }
          lastError = result.error ?? `工具调用失败（${meta.id}）`;
          lastTimedOut = result.timedOut ?? false;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
        if (attempt < maxAttempts - 1) {
          await sleep(backoffBaseMs * Math.pow(2, attempt));
        }
      }
      // 当前子 Agent 重试耗尽 → 降级下一个候选
    }

    return {
      ok: false,
      agentId: candidates[candidates.length - 1]?.id ?? '',
      output: '',
      untrusted: true,
      attempts,
      elapsedMs: Date.now() - start,
      degraded: candidates.length > 1,
      timedOut: lastTimedOut,
      error: lastError || '子 Agent 执行失败',
    };
  }

  private pickCandidates(options: DispatchOptions): SubAgentMeta[] {
    const available = this.metas.filter(
      (meta) => meta.available && this.clients.has(meta.id),
    );
    if (options.toolName) {
      const byPrefix = available.filter((meta) => options.toolName!.startsWith(meta.toolPrefix));
      if (byPrefix.length > 0) {
        // 精确前缀优先；同类别可用 agent 作为降级候选（§11.1.4 换备用执行单元）
        const lead = byPrefix[0]!;
        const sameCategory = available.filter(
          (meta) => meta.category === lead.category && !byPrefix.includes(meta),
        );
        return [...byPrefix, ...sameCategory];
      }
      // 显式指定了工具名但无任何 agent 前缀匹配：诚实失败，不悄悄换工具
      return [];
    }
    if (options.category) {
      const byCategory = available.filter((meta) => meta.category === options.category);
      if (byCategory.length > 0) return byCategory;
    }
    return available;
  }
}

function defaultTimeoutMs(opKind: McpOpKind | undefined): number {
  switch (opKind) {
    case 'compile':
      return PARAMS.compileTimeoutMs;
    case 'flash':
      return PARAMS.flashTimeoutMs;
    case 'filegen':
      return PARAMS.fileGenTimeoutMs;
    default:
      return PARAMS.subAgentHeartbeatMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
