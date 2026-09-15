/**
 * LLM 客户端入口：OpenAI 兼容客户端 + Provider Registry / fallback 链。
 * 轻/重/视觉客户端签名保持不变；provider 与模型改由 llm-registry 解析。
 */

import { PARAMS } from '../config/params.js';
import type { VLMClient } from '../skills/deps.js';
import {
  defaultRegistry,
  FallbackLLMClient,
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
 * v1.0 S8：生产入口可选 heavy 客户端（LLM 增强路由接线）
 * 已配置 Provider 时返回 heavy 客户端；未配置时返回 undefined——
 * 调用方走纯规则路由（不触发 [P-84] fallback 折扣），避免启动即抛错。
 */
export function createOptionalHeavyClient(): LLMClient | undefined {
  try {
    return createHeavyClient();
  } catch {
    return undefined;
  }
}

/**
 * CLI 生产入口可选 medium 客户端（E278：CLI 默认档对齐 P-105 缺省中档，
 * 避免 heavy 档 v4-pro 在 [P-130] 30s 预算内完不成合成而必现 synthesis_timeout）；
 * 已配置 Provider 时返回 medium 客户端；未配置时返回 undefined——调用方走纯规则路由。
 */
export function createOptionalMediumClient(): LLMClient | undefined {
  try {
    return createClientForRole('medium');
  } catch {
    return undefined;
  }
}

/**
 * 深度报告专用 heavy 客户端（E231）：per-call fallback 预算放开到 [P-13]，
 * 避免被 P-116（对齐 Stage 5 的 18s）提前截断分节生成；未配置 Provider 返回 undefined。
 */
export function createDeepReportHeavyClient(): LLMClient | undefined {
  try {
    return createClientForRole('heavy', { totalBudgetMs: PARAMS.deepReportBudgetMs });
  } catch {
    return undefined;
  }
}

/**
 * Skill 生成专用 heavy 客户端（E238）：per-call fallback 预算放开到 [P-122]，
 * 避免 engineer/content-writer 长文生成被 P-116（对齐 Stage 5 的 18s）提前截断；
 * 单 provider 超时同步对齐 P-122，避免 v4-pro 长报告在默认 30s 被切后
 * 提前兜底到其他 provider；未配置 Provider 返回 undefined。
 */
export function createSkillHeavyClient(): LLMClient | undefined {
  try {
    return createClientForRole('heavy', {
      totalBudgetMs: PARAMS.skillGenerationBudgetMs,
      timeoutMs: PARAMS.skillGenerationBudgetMs,
    });
  } catch {
    return undefined;
  }
}

/**
 * 生产 skill 合成客户端（main/gateway/im 三入口与市场通道共用）：按 skill 名选档。
 * github-reader / archify / layered-arch 属契约式输出型 skill（JSON/结构化渲染为主）：
 * - github-reader：heavy 档 v4-pro 的 <think> 推理块与答案共享 max_tokens，实测合成 ~46s；
 *   medium 更快完成同等契约渲染（E283）。
 * - archify（E358）：一次要出最多 6000 token 的 JSON IR，v4-pro 90s 内偶发回不来
 *   导致整次 0.3 收据（owner 复测短问「画个订单系统的系统架构图」真机复现）；JSON 版式
 *   有本地 validate/repair 兜底，不需要推理档，medium v4-flash 足够。
 * - layered-arch（E364）：一次要出最多 4000 token 的分层 JSON，同 archify 理由走 medium。
 * 但 medium 默认 [P-116] 18s 总预算在 API 抖动/长答案时会把正在生成的答案杀掉
 * （E283 实测 18s 截断触发模板兜底），故这类 skill 合成单独放宽到 [P-122] 90s
 * （与 skill 长文档位同一预算口径，模型仍为 v4-flash；不动全局 [P-116]）。
 * 其余 skill 维持 heavy（E238：长文生成需要 [P-122] 的 90s 预算防截断）。
 */
export function createSkillCompleteClient(skillName: string): LLMClient {
  if (skillName === 'github-reader' || skillName === 'archify' || skillName === 'layered-arch') {
    try {
      return createClientForRole('medium', {
        totalBudgetMs: PARAMS.skillGenerationBudgetMs,
        timeoutMs: PARAMS.skillGenerationBudgetMs,
      });
    } catch {
      // 未配置 medium provider 时回落 heavy 链
    }
  }
  return createSkillHeavyClient() ?? createHeavyClient();
}

/**
 * E343：内容型思维导图大纲合成客户端（xmind_content）——E342 真机冒烟复现
 * medium 档 v4-flash 在「长结构大纲」任务上实际 >18s，被 [P-116] 18s 链总预算强停。
 * 与 E283 github-reader 同一套路：模型仍 medium（v4-flash，成本不变），per-call 预算
 * 放宽到 [P-122] 90s（timeoutMs 同步放宽，防单 provider 30s 超时先切链），不动全局 [P-116]。
 */
export function createXmindOutlineClient(opts?: { preferredProvider?: string }): LLMClient {
  try {
    return createClientForRole('medium', {
      totalBudgetMs: PARAMS.skillGenerationBudgetMs,
      timeoutMs: PARAMS.skillGenerationBudgetMs,
      preferredId: opts?.preferredProvider,
    });
  } catch {
    // 未配置 medium provider 时回落 heavy 链（同 90s 预算）
  }
  return createSkillHeavyClient() ?? createHeavyClient();
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
  // P-153：推理型视觉模型思考耗时偏长，默认放宽到 20s；env VLM_TIMEOUT_MS 仍可覆盖
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.VLM_TIMEOUT_MS ?? PARAMS.vlmTimeoutMs);

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

export interface UsedModelInfo {
  provider: string;
  model: string;
  fallbacks: Array<{ from: string; to: string }>;
}

export function describeUsedModel(client: LLMClient): UsedModelInfo | null {
  if (client instanceof FallbackLLMClient) return client.describe();
  if (client instanceof OpenAiCompatibleClient) {
    return { provider: 'direct', model: client.model, fallbacks: [] };
  }
  return null;
}
