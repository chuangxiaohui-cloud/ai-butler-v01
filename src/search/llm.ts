/**
 * 轻模型 LLM 客户端（OpenAI 兼容协议，DeepSeek 优先）
 * 供 Stage 2 意图分类 / Query 构造使用，超时遵循 [P-04]。
 */

import { loadEnvFile } from '../config/env.js';

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

export function createLightClient(): LLMClient {
  loadEnvFile();
  const apiKey =
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.LLM_PRIMARY_API_KEY?.trim();
  if (!apiKey) throw new Error('未配置 LLM API Key（DEEPSEEK_API_KEY 或 LLM_PRIMARY_API_KEY）');
  const timeoutMs = Number(process.env.LLM_CLASSIFY_TIMEOUT_MS ?? '500');
  return new OpenAiCompatibleClient({
    baseUrl: process.env.LLM_PRIMARY_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
    apiKey,
    model: process.env.LLM_LIGHT_MODEL?.trim() || 'deepseek-chat',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 500,
  });
}

export function createHeavyClient(): LLMClient {
  loadEnvFile();
  const apiKey =
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.LLM_PRIMARY_API_KEY?.trim();
  if (!apiKey) throw new Error('未配置 LLM API Key（DEEPSEEK_API_KEY 或 LLM_PRIMARY_API_KEY）');
  const timeoutMs = Number(process.env.LLM_SYNTHESIZE_TIMEOUT_MS ?? '8000');
  return new OpenAiCompatibleClient({
    baseUrl: process.env.LLM_PRIMARY_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
    apiKey,
    model: process.env.LLM_HEAVY_MODEL?.trim() || 'deepseek-chat',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000,
  });
}
