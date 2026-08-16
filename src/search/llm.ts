/**
 * LLM 客户端入口：OpenAI 兼容客户端 + Provider Registry / fallback 链。
 * 轻/重/视觉客户端签名保持不变；provider 与模型改由 llm-registry 解析。
 */

import type { VLMClient } from '../skills/deps.js';
import {
  defaultRegistry,
  type ModelRole,
  type ProviderProfile,
  type FallbackClientOptions,
} from './llm-registry.js';
import type {
  ChatMessage,
  CompleteOptions,
  LLMClient,
  OpenAiCompatibleClientOptions,
} from './llm-client.js';
import { OpenAiCompatibleClient } from './llm-client.js';

export type { ChatMessage, CompleteOptions, LLMClient, OpenAiCompatibleClientOptions };
export { OpenAiCompatibleClient };
export type { ModelRole, ProviderProfile, FallbackClientOptions } from './llm-registry.js';

export function createClientForRole(
  role: ModelRole,
  opts?: FallbackClientOptions & { timeoutMs?: number },
): LLMClient {
  return defaultRegistry().createForRole(role, opts);
}

export function createLightClient(opts?: { timeoutMs?: number }): LLMClient {
  return createClientForRole('light', opts);
}

export function createHeavyClient(): LLMClient {
  return createClientForRole('heavy');
}

/**
 * 视觉模型适配器（Week 3 契约落地）
 * VLMClient：image 必须是 data URL；返回纯文本。
 */
export function createVisionClient(opts?: { timeoutMs?: number }): VLMClient {
  const profile = defaultRegistry().resolveProfile('vision');
  if (!profile) {
    throw new Error('未配置 VLM API Key（VLM_API_KEY 或 LLM_PRIMARY_API_KEY）');
  }
  const baseUrl = profile.baseUrl;
  const apiKey = profile.apiKey;
  const model = profile.models.vision;
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.VLM_TIMEOUT_MS ?? '8000');

  return async (input, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const content = input.image
        ? [
            { type: 'text', text: input.prompt },
            { type: 'image_url', image_url: { url: input.image } },
          ]
        : input.prompt;
      const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
          temperature: 0,
          max_tokens: options.maxTokens,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`VLM HTTP ${resp.status}: ${detail.slice(0, 120)}`);
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const contentOut = data.choices?.[0]?.message?.content;
      if (typeof contentOut !== 'string' || !contentOut.trim()) {
        throw new Error('VLM 返回空内容');
      }
      return contentOut.trim();
    } finally {
      clearTimeout(timer);
    }
  };
}

export function resolveVisionProfile(): ProviderProfile | null {
  return defaultRegistry().resolveProfile('vision');
}
