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
import { resolveRealToolName } from './types.js';
import type {
  SubAgentArtifact,
  SubAgentEvidence,
  SubAgentFailure,
  SubAgentHandoff,
  SubAgentPlanStep,
  SubAgentProgressEvent,
  SubAgentRunStatus,
  SubAgentTaskRef,
} from './contract.js';

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
  /** 结构化进度观察；观察方异常不得中断实际任务 */
  onProgress?: (event: SubAgentProgressEvent) => void;
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
  task: SubAgentTaskRef;
  status: SubAgentRunStatus;
  plan: SubAgentPlanStep[];
  progress: SubAgentProgressEvent[];
  artifacts: SubAgentArtifact[];
  evidence: SubAgentEvidence[];
  failure?: SubAgentFailure;
  handoff: SubAgentHandoff;
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
    const start = Date.now();
    const taskRef: SubAgentTaskRef = {
      description: task,
      ...(options.toolName ? { requestedTool: options.toolName } : {}),
      ...(options.category ? { category: options.category } : {}),
    };
    const plan: SubAgentPlanStep[] = [
      { id: 'select_agent', title: '选择可用子 Agent', status: 'pending' },
      { id: 'validate_call', title: '校验工具与参数白名单', status: 'pending' },
      { id: 'execute_tool', title: '执行 MCP 工具并收集结果', status: 'pending' },
    ];
    const progress: SubAgentProgressEvent[] = [];
    const evidence: SubAgentEvidence[] = [];
    const emit = (
      phase: SubAgentProgressEvent['phase'],
      message: string,
      detail: Pick<SubAgentProgressEvent, 'agentId' | 'attempt'> = {},
    ) => {
      const event: SubAgentProgressEvent = {
        phase,
        message,
        elapsedMs: Date.now() - start,
        ...detail,
      };
      progress.push(event);
      try {
        options.onProgress?.(event);
      } catch {
        // 进度观察方不属于执行链，异常不得改变任务结果。
      }
    };
    const finish = (input: {
      ok: boolean;
      agentId: string;
      output?: string;
      attempts: number;
      degraded: boolean;
      status: SubAgentRunStatus;
      timedOut?: boolean;
      failure?: SubAgentFailure;
    }): DispatchResult => ({
      ok: input.ok,
      agentId: input.agentId,
      output: input.output ?? '',
      untrusted: true,
      attempts: input.attempts,
      elapsedMs: Date.now() - start,
      degraded: input.degraded,
      ...(input.timedOut ? { timedOut: true } : {}),
      ...(input.failure ? { error: input.failure.message, failure: input.failure } : {}),
      task: taskRef,
      status: input.status,
      plan,
      progress,
      artifacts: input.output
        ? [{ kind: 'text', content: input.output, untrusted: true }]
        : [],
      evidence,
      handoff: input.failure
        ? {
            required: true,
            reason: input.failure.message,
            nextAction: input.failure.code === 'cancelled'
              ? '确认任务范围后重新发起。'
              : '检查对应软件、MCP 配置和安全授权，或交由用户处理。',
          }
        : { required: false },
    });

    emit('planned', `已接收任务：${task}`);
    plan[0]!.status = 'running';
    const candidates = this.pickCandidates(options);
    if (candidates.length === 0) {
      plan[0]!.status = 'failed';
      plan[1]!.status = 'skipped';
      plan[2]!.status = 'skipped';
      const failure: SubAgentFailure = {
        code: 'no_agent',
        message: '没有可用的子 Agent',
        retryable: false,
      };
      emit('failed', failure.message);
      return finish({
        ok: false,
        agentId: '',
        attempts: 0,
        degraded: false,
        status: 'failed',
        failure,
      });
    }
    plan[0]!.status = 'completed';
    plan[1]!.status = 'running';
    emit('running', `已选择 ${candidates[0]!.id}`, { agentId: candidates[0]!.id });

    const retryCount =
      options.retryCount ??
      (options.deterministic ? PARAMS.subAgentRetryDeterministic : PARAMS.subAgentRetryNonDeterministic);
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs(options.opKind);
    const backoffBaseMs = this.opts.backoffBaseMs ?? PARAMS.subAgentBackoffBaseMs;

    let attempts = 0;
    let lastError = '';
    let lastOutput = '';
    let lastTimedOut = false;
    let lastFailureCode: SubAgentFailure['code'] = 'tool_error';

    for (let index = 0; index < candidates.length; index++) {
      const meta = candidates[index];
      const client = this.clients.get(meta.id);
      if (!client) continue;
      // 降级时若请求工具名不属于该 agent 前缀，回退到默认工具（E240：defaultTool 或 run）
      const requested = options.toolName;
      const internalToolName =
        requested && requested.startsWith(meta.toolPrefix)
          ? requested
          : (meta.defaultTool ?? `${meta.toolPrefix}run`);
      const validation = validateMcpCall(meta, internalToolName, options.args ?? {});
      if (!validation.ok) {
        lastError = validation.reason ?? '白名单校验失败';
        lastFailureCode = 'validation_error';
        continue;
      }
      // E240：内部名 → 真实 MCP 工具名（allowedTools 白名单在 validateMcpCall 内已校验）
      const realToolName = resolveRealToolName(meta, internalToolName);
      if (!realToolName) {
        lastError = `工具 ${internalToolName} 无真实工具名映射`;
        lastFailureCode = 'validation_error';
        continue;
      }
      plan[1]!.status = 'completed';
      plan[2]!.status = 'running';
      if (index > 0) emit('degraded', `降级到备用子 Agent ${meta.id}`, { agentId: meta.id });
      const maxAttempts = 1 + retryCount;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (options.signal?.aborted) {
          plan[2]!.status = 'skipped';
          const failure: SubAgentFailure = {
            code: 'cancelled',
            message: '已取消',
            retryable: true,
          };
          emit('cancelled', failure.message, { agentId: meta.id, attempt: attempts });
          return finish({
            ok: false,
            agentId: meta.id,
            attempts,
            degraded: index > 0,
            status: 'cancelled',
            failure,
          });
        }
        attempts++;
        emit(attempt === 0 ? 'running' : 'retrying', `调用 ${meta.id}.${realToolName}`, {
          agentId: meta.id,
          attempt: attempts,
        });
        evidence.push({
          kind: 'mcp_tool_call',
          agentId: meta.id,
          toolName: realToolName,
          attempt: attempts,
          untrusted: true,
        });
        try {
          const callArgs =
            options.args && Object.keys(options.args).length > 0
              ? options.args
              : (meta.defaultArgs ?? {});
          const result = await client.callTool(realToolName, callArgs, timeoutMs, options.signal);
          if (result.ok) {
            plan[2]!.status = 'completed';
            emit('completed', `${meta.id} 执行完成`, { agentId: meta.id, attempt: attempts });
            return finish({
              ok: true,
              agentId: meta.id,
              output: result.output,
              attempts,
              degraded: index > 0,
              status: 'succeeded',
            });
          }
          if (result.cancelled) {
            plan[2]!.status = 'failed';
            const failure: SubAgentFailure = {
              code: 'cancelled',
              message: result.error ?? '已取消',
              retryable: true,
            };
            emit('cancelled', failure.message, { agentId: meta.id, attempt: attempts });
            return finish({
              ok: false,
              agentId: meta.id,
              output: result.output,
              attempts,
              degraded: index > 0,
              status: 'cancelled',
              failure,
            });
          }
          lastError = result.error ?? `工具调用失败（${meta.id}）`;
          lastOutput = result.output;
          lastTimedOut = result.timedOut ?? false;
          lastFailureCode = lastTimedOut ? 'timeout' : 'tool_error';
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          lastFailureCode = 'tool_error';
        }
        if (attempt < maxAttempts - 1) {
          await sleep(backoffBaseMs * Math.pow(2, attempt));
        }
      }
      // 当前子 Agent 重试耗尽 → 降级下一个候选
    }

    if (plan[1]!.status === 'running') plan[1]!.status = 'failed';
    plan[2]!.status = plan[2]!.status === 'pending' ? 'skipped' : 'failed';
    const failure: SubAgentFailure = {
      code: lastFailureCode,
      message: lastError || '子 Agent 执行失败',
      retryable: lastFailureCode === 'timeout' || lastFailureCode === 'tool_error',
    };
    emit('failed', failure.message, { agentId: candidates[candidates.length - 1]?.id });
    return finish({
      ok: false,
      agentId: candidates[candidates.length - 1]?.id ?? '',
      attempts,
      degraded: candidates.length > 1,
      timedOut: lastTimedOut,
      output: lastOutput,
      status: 'failed',
      failure,
    });
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
