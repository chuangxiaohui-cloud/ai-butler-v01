/**
 * OpenAI 兼容 LLM 客户端（与 provider 选择解耦，供 registry/fallback 复用）。
 */

import { recordUsage } from '../usage/usage-store.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  /** 外部取消信号（P17 fallback 总预算透传），与内部超时合并 */
  signal?: AbortSignal;
  /** E274：finish_reason=length（maxTokens 被思考块/长文耗尽）时抛 LLMLengthTruncatedError，供合成层重试 */
  rejectOnTruncate?: boolean;
  /** 流式输出：开启后请求走 SSE，逐块回调可见内容增量（抑制 <think> 推理块）；返回仍是全量文本 */
  onToken?: (delta: string) => void;
}

export interface LLMClient {
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}

export interface OpenAiCompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  provider?: string;
}

/**
 * deepseek-v4-pro 思考模式会把 <think>…</think> 推理块混入 content；展示层不应透出推理过程。
 * 仅剥离 think 块本身，内容为空（模型只返回推理）时保留原文避免空答案。
 */
export function stripThinkBlock(content: string): string {
  const stripped = content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  return stripped || content.trim();
}

/**
 * E274：输出被 max_tokens 截断（finish_reason=length）。思考模型（deepseek-v4 系列）
 * 的 <think> 块与最终答案共享 max_tokens 预算，800 上限下思考块稍长就会把答案截断
 * 成半句；s5 据此重试更高预算，而不是把残句当答案。
 */
export class LLMLengthTruncatedError extends Error {
  readonly code = 'LLM_LENGTH_TRUNCATED';

  constructor(readonly partial: string) {
    super('LLM 输出达到 max_tokens 上限被截断');
    this.name = 'LLMLengthTruncatedError';
  }
}

export function isLengthTruncated(err: unknown): boolean {
  return err instanceof LLMLengthTruncatedError;
}

/** 流式增量可见化：抑制 <think>…</think> 推理块，与 stripThinkBlock 同一语义（展示层不透出推理）。
 * 推理块只在开头出现，未闭合前缓冲不回调；闭合后剩余增量直接透出。 */
function makeVisibleDeltaEmitter(onToken: (delta: string) => void): (delta: string) => void {
  let pending = '';
  let inThink = false;
  const THINK_OPEN = '<think';
  const THINK_CLOSE = '</think>';
  return (delta: string) => {
    pending += delta;
    if (!inThink) {
      const open = pending.indexOf(THINK_OPEN);
      if (open === -1) {
        onToken(pending);
        pending = '';
      } else {
        if (open > 0) onToken(pending.slice(0, open));
        inThink = true;
        pending = pending.slice(open);
      }
    }
    if (inThink) {
      const close = pending.indexOf(THINK_CLOSE);
      if (close !== -1) {
        inThink = false;
        const tail = pending.slice(close + THINK_CLOSE.length);
        pending = '';
        if (tail) onToken(tail);
      }
    }
  };
}

export class OpenAiCompatibleClient implements LLMClient {
  constructor(private readonly opts: OpenAiCompatibleClientOptions) {}

  get model(): string {
    return this.opts.model;
  }

  get baseUrl(): string {
    return this.opts.baseUrl;
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<string> {
    const controller = new AbortController();
    if (opts.signal?.aborted) controller.abort();
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model: this.opts.model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens,
        response_format: opts.json ? { type: 'json_object' } : undefined,
      };
      if (opts.onToken) {
        body.stream = true;
        // stream_options.include_usage：流式响应末块返回 usage，用量记账不因流式而断
        body.stream_options = { include_usage: true };
      }
      const resp = await fetch(`${this.opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`LLM HTTP ${resp.status}: ${detail.slice(0, 120)}`);
      }
      if (opts.onToken) return this.consumeStream(resp, opts);
      const data = (await resp.json()) as {
        choices?: Array<{
          message?: { content?: unknown };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('LLM 返回空内容');
      if (
        typeof data.usage?.prompt_tokens === 'number' &&
        typeof data.usage.completion_tokens === 'number'
      ) {
        try {
          recordUsage({
            ts: Date.now(),
            provider: this.opts.provider ?? 'openai-compatible',
            model: this.opts.model,
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          });
        } catch {
          // 记账失败不阻塞回复
        }
      }
      if (opts.rejectOnTruncate && data.choices?.[0]?.finish_reason === 'length') {
        throw new LLMLengthTruncatedError(stripThinkBlock(content));
      }
      return stripThinkBlock(content);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /** SSE 流式消费：逐块回调可见增量，累积全量文本；usage 从末块（stream_options.include_usage）记账 */
  private async consumeStream(resp: Response, opts: CompleteOptions): Promise<string> {
    if (!resp.body) throw new Error('LLM 流式响应无 body');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    const emitVisible = makeVisibleDeltaEmitter(opts.onToken!);
    let content = '';
    let finishReason: string | undefined;
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    let buffer = '';
    let finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            finished = true;
            break;
          }
          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{
                delta?: { content?: unknown };
                finish_reason?: string | null;
              }>;
              usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
            };
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              content += delta;
              emitVisible(delta);
            }
            if (chunk.choices?.[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
            if (
              typeof chunk.usage?.prompt_tokens === 'number' &&
              typeof chunk.usage?.completion_tokens === 'number'
            ) {
              usage = {
                prompt_tokens: chunk.usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens,
              };
            }
          } catch {
            // 非 JSON 的 data 行（keep-alive 等）忽略
          }
        }
        if (finished) break;
      }
      if (!content.trim()) throw new Error('LLM 返回空内容');
      if (usage) {
        try {
          recordUsage({
            ts: Date.now(),
            provider: this.opts.provider ?? 'openai-compatible',
            model: this.opts.model,
            promptTokens: usage.prompt_tokens!,
            completionTokens: usage.completion_tokens!,
          });
        } catch {
          // 记账失败不阻塞回复
        }
      }
      if (opts.rejectOnTruncate && finishReason === 'length') {
        throw new LLMLengthTruncatedError(stripThinkBlock(content));
      }
      return stripThinkBlock(content);
    } finally {
      try {
        await reader.cancel();
      } catch {
        // 已关闭的 reader 忽略
      }
    }
  }
}
