/**
 * Provider Registry + fallback 链（OpenSquilla 借鉴，E104）
 * DeepSeek / MiniMax / 智谱 OpenAI 兼容抽象；按角色选 provider，失败按顺序兜底。
 * 旧 env 单家配置（LLM_PRIMARY_* / DEEPSEEK_API_KEY）继续兼容，行为不变。
 */

import { loadEnvFile } from '../config/env.js';
import { PARAMS } from '../config/params.js';
import { readProviderOrder, writeProviderOrder } from '../config/provider-order.js';
import {
  OpenAiCompatibleClient,
  type ChatMessage,
  type CompleteOptions,
  type LLMClient,
} from './llm-client.js';

export type ModelRole = 'light' | 'medium' | 'heavy' | 'vision';

export const MODEL_ROLES: readonly ModelRole[] = ['light', 'medium', 'heavy', 'vision'];

export interface ProviderProfile {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  models: Record<ModelRole, string>;
}

interface ProviderDef {
  id: string;
  label: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  modelEnvPrefix: string;
  defaultModels: Record<ModelRole, string>;
}

const PROVIDER_DEFS: readonly ProviderDef[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    modelEnvPrefix: 'DEEPSEEK',
    defaultModels: {
      light: 'deepseek-chat',
      medium: 'deepseek-chat',
      heavy: 'deepseek-chat',
      vision: 'deepseek-chat',
    },
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    apiKeyEnv: 'MINIMAX_API_KEY',
    baseUrlEnv: 'MINIMAX_BASE_URL',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    modelEnvPrefix: 'MINIMAX',
    defaultModels: {
      light: 'MiniMax-M2.7-highspeed',
      medium: 'MiniMax-M2.7',
      heavy: 'MiniMax-M3',
      vision: 'MiniMax-M2.7',
    },
  },
  {
    id: 'zhipu',
    label: '智谱',
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrlEnv: 'ZHIPU_BASE_URL',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelEnvPrefix: 'ZHIPU',
    defaultModels: {
      light: 'glm-5-turbo',
      medium: 'glm-5.2',
      heavy: 'glm-5.3',
      vision: 'glm-5.2',
    },
  },
];

export const DEFAULT_PROVIDER_ORDER = 'deepseek,minimax,zhipu';

function roleModelEnvKey(prefix: string, role: ModelRole): string {
  return `${prefix}_${role.toUpperCase()}_MODEL`;
}

/** P-129/P-130：fallback 链总预算按档分级——light 短预算（分类等轻任务），heavy 放宽到推理模型可完成；medium 沿用 [P-116] 基准。 */
export function resolveFallbackBudgetMs(role: ModelRole): number {
  return role === 'light'
    ? PARAMS.llmFallbackBudgetLightMs
    : role === 'heavy'
      ? PARAMS.llmFallbackBudgetHeavyMs
      : PARAMS.llmFallbackTotalBudgetMs;
}

function resolveTimeoutMs(
  role: ModelRole,
  env: Record<string, string | undefined>,
  override?: number,
): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) return override;
  const raw =
    role === 'light'
      ? env.LLM_CLASSIFY_TIMEOUT_MS
      : role === 'medium'
        ? env.LLM_MEDIUM_TIMEOUT_MS
        : role === 'heavy'
          ? env.LLM_SYNTHESIZE_TIMEOUT_MS
          : env.VLM_TIMEOUT_MS;
  const value = Number(raw ?? '');
  return Number.isFinite(value) && value > 0 ? value : role === 'light' ? 1750 : 30000;
}

function buildProviderProfile(def: ProviderDef, env: Record<string, string | undefined>): ProviderProfile | null {
  const apiKey = (env[def.apiKeyEnv] ?? '').trim();
  if (!apiKey) return null;
  const models = {} as Record<ModelRole, string>;
  for (const role of MODEL_ROLES) {
    models[role] = (env[roleModelEnvKey(def.modelEnvPrefix, role)] ?? '').trim() || def.defaultModels[role];
  }
  return {
    id: def.id,
    label: def.label,
    apiKey,
    baseUrl: (env[def.baseUrlEnv] ?? '').trim() || def.defaultBaseUrl,
    models,
  };
}

function buildLegacyProfile(
  role: ModelRole,
  env: Record<string, string | undefined>,
): ProviderProfile | null {
  const apiKey =
    role === 'vision'
      ? ((env.VLM_API_KEY ?? '').trim() || (env.LLM_PRIMARY_API_KEY ?? '').trim())
      : (env.LLM_PRIMARY_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return {
    id: 'legacy',
    label: '默认',
    apiKey,
    baseUrl: (env.LLM_PRIMARY_BASE_URL ?? '').trim() || 'https://api.deepseek.com/v1',
    models: {
      light: (env.LLM_LIGHT_MODEL ?? '').trim() || 'deepseek-chat',
      medium:
        (env.LLM_MEDIUM_MODEL ?? '').trim() ||
        (env.LLM_HEAVY_MODEL ?? '').trim() ||
        'deepseek-chat',
      heavy: (env.LLM_HEAVY_MODEL ?? '').trim() || 'deepseek-chat',
      vision: (env.VLM_MODEL ?? '').trim() || 'gpt-4o-mini',
    },
  };
}

export interface FallbackClientOptions {
  timeoutMs?: number;
  /** P-116 整条 fallback 链总预算（超时即停止兜底，不再 3 家 × 30s 串行） */
  totalBudgetMs?: number;
  preferredId?: string;
  onFallback?: (from: string, to: string, error: unknown) => void;
}

export class FallbackLLMClient implements LLMClient {
  private readonly chain: Array<{ providerId: string; model: string; client: LLMClient }>;
  private readonly onFallback?: (from: string, to: string, error: unknown) => void;
  private readonly totalBudgetMs?: number;
  private lastUsedProviderId: string | null = null;
  private fallbackEvents: Array<{ from: string; to: string }> = [];

  constructor(
    chain: Array<{ providerId: string; model: string; client: LLMClient }>,
    onFallback?: (from: string, to: string, error: unknown) => void,
    totalBudgetMs?: number,
  ) {
    this.chain = chain;
    this.onFallback = onFallback;
    this.totalBudgetMs = totalBudgetMs;
  }

  // P17（架构审计 2026-08-23）：整条 fallback 链共享 [P-116] 总预算——超时即 abort 并
  // 停止后续兜底，最坏不再 3 家 × 30s = 90s；预算按每次 complete 独立起算，成功后清 timer。
  async complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string> {
    let lastError: unknown;
    const budgetMs = this.totalBudgetMs;
    const deadline = budgetMs !== undefined && budgetMs > 0 ? Date.now() + budgetMs : null;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budgetReject =
      deadline !== null
        ? new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error(`LLM fallback 链总预算 ${budgetMs}ms 超时`));
            }, budgetMs);
          })
        : null;
    try {
      for (let i = 0; i < this.chain.length; i++) {
        const { providerId, client } = this.chain[i];
        if (deadline !== null && Date.now() >= deadline) break;
        try {
          this.lastUsedProviderId = providerId;
          const attempt = client.complete(
            messages,
            deadline !== null ? { ...opts, signal: controller.signal } : opts,
          );
          return await (budgetReject !== null ? Promise.race([attempt, budgetReject]) : attempt);
        } catch (err) {
          lastError = err;
          if (deadline !== null && Date.now() >= deadline) break;
          if (i < this.chain.length - 1) {
            const to = this.chain[i + 1].providerId;
            this.fallbackEvents.push({ from: providerId, to });
            this.onFallback?.(providerId, to, err);
          }
        }
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    throw lastError ?? new Error('无可用 LLM Provider');
  }

  describe(): { provider: string; model: string; fallbacks: Array<{ from: string; to: string }> } | null {
    const current =
      this.chain.find((c) => c.providerId === this.lastUsedProviderId) ?? this.chain[0];
    if (!current) return null;
    return {
      provider: current.providerId,
      model: current.model,
      fallbacks: [...this.fallbackEvents],
    };
  }
}

export class LlmProviderRegistry {
  private readonly env: Record<string, string | undefined>;
  private readonly usesProcessEnv: boolean;

  constructor(env: Record<string, string | undefined> = process.env) {
    loadEnvFile();
    this.env = env;
    this.usesProcessEnv = env === process.env;
  }

  order(): string[] {
    const order = (this.env.LLM_PROVIDER_ORDER ?? DEFAULT_PROVIDER_ORDER)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (order.length > 0) return order;
    if (this.usesProcessEnv) {
      const fileOrder = readProviderOrder();
      if (fileOrder) return fileOrder;
    }
    return DEFAULT_PROVIDER_ORDER.split(',').map((id) => id.trim());
  }

  setOrder(order: string[]): void {
    if (!this.usesProcessEnv) {
      throw new Error('仅运行时 registry 支持持久化 provider 顺序');
    }
    writeProviderOrder(order);
  }

  listStatuses(): Array<{
    id: string;
    label: string;
    configured: boolean;
    models: Record<ModelRole, string>;
  }> {
    return PROVIDER_DEFS.map((def) => {
      const profile = buildProviderProfile(def, this.env);
      return {
        id: def.id,
        label: def.label,
        configured: profile !== null,
        models: profile?.models ?? def.defaultModels,
      };
    });
  }

  listProfiles(role: ModelRole): ProviderProfile[] {
    const profiles: ProviderProfile[] = [];
    const seen = new Set<string>();
    for (const id of this.order()) {
      const def = PROVIDER_DEFS.find((d) => d.id === id);
      if (!def || seen.has(def.id)) continue;
      const profile = buildProviderProfile(def, this.env);
      if (profile) {
        profiles.push(profile);
        seen.add(profile.id);
      }
    }
    if (profiles.length === 0) {
      const legacy = buildLegacyProfile(role, this.env);
      if (legacy) profiles.push(legacy);
    }
    return profiles;
  }

  resolveProfile(role: ModelRole, preferredId?: string): ProviderProfile | null {
    const profiles = this.listProfiles(role);
    if (preferredId) {
      const preferred = profiles.find((p) => p.id === preferredId);
      if (preferred) return preferred;
    }
    return profiles[0] ?? null;
  }

  createForRole(role: ModelRole, opts: FallbackClientOptions = {}): LLMClient {
    let profiles = this.listProfiles(role).slice(0, PARAMS.providerFallbackMax);
    if (profiles.length === 0) {
      throw new Error(`未配置 ${role} 模型 Provider（DEEPSEEK_API_KEY 或 LLM_PRIMARY_API_KEY）`);
    }
    if (opts.preferredId) {
      const preferred = profiles.find((p) => p.id === opts.preferredId);
      if (preferred) {
        profiles = [preferred, ...profiles.filter((p) => p.id !== preferred.id)];
      }
    }
    const timeoutMs = resolveTimeoutMs(role, this.env, opts.timeoutMs);
    const fallbackBudgetMs = resolveFallbackBudgetMs(role);
    const chain = profiles.map((p) => ({
      providerId: p.id,
      model: p.models[role],
      client: new OpenAiCompatibleClient({
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        model: p.models[role],
        timeoutMs,
        provider: p.id,
      }),
    }));
    if (chain.length === 1) return chain[0].client;
    return new FallbackLLMClient(
      chain,
      opts.onFallback,
      opts.totalBudgetMs ?? fallbackBudgetMs,
    );
  }
}

// P3（架构审计 2026-08-23）：defaultRegistry 改为模块级惰性单例——process.env 为活引用，
// 每次 createForRole 仍实时读取 key/model/超时，但不再每次 new Registry + loadEnvFile + 读 provider-order。
let cachedDefaultRegistry: LlmProviderRegistry | null = null;

export function defaultRegistry(): LlmProviderRegistry {
  if (!cachedDefaultRegistry) cachedDefaultRegistry = new LlmProviderRegistry();
  return cachedDefaultRegistry;
}
