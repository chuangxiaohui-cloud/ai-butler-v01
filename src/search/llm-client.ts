/**
 * OpenAI 兼容 LLM 客户端（与 provider 选择解耦，供 registry/fallback 复用）。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface LLMClient {
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}

export interface OpenAiCompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
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
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const resp = await fetch(`${this.opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens,
          response_format: opts.json ? { type: 'json_object' } : undefined,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`LLM HTTP ${resp.status}: ${detail.slice(0, 120)}`);
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('LLM 返回空内容');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}
