/**
 * Provider Registry + fallback 链（OpenSquilla 借鉴，E104）
 * DeepSeek / MiniMax / 智谱 OpenAI 兼容抽象；按角色选 provider，失败按顺序兜底。
 * 旧 env 单家配置（LLM_PRIMARY_* / DEEPSEEK_API_KEY）继续兼容，行为不变。
 */

import { loadEnvFile } from '../config/env.js';
import { PARAMS } from '../config/params.js';
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
      light: 'MiniMax-M2.7',
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
  return Number.isFinite(value) && value > 0 ? value : role === 'light' ? 2000 : 30000;
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
  preferredId?: string;
  onFallback?: (from: string, to: string, error: unknown) => void;
}

export class FallbackLLMClient implements LLMClient {
  private readonly chain: Array<{ providerId: string; model: string; client: LLMClient }>;
  private readonly onFallback?: (from: string, to: string, error: unknown) => void;
  private lastUsedProviderId: string | null = null;
  private fallbackEvents: Array<{ from: string; to: string }> = [];

  constructor(
    chain: Array<{ providerId: string; model: string; client: LLMClient }>,
    onFallback?: (from: string, to: string, error: unknown) => void,
  ) {
    this.chain = chain;
    this.onFallback = onFallback;
  }

  async complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string> {
    let lastError: unknown;
    for (let i = 0; i < this.chain.length; i++) {
      const { providerId, client } = this.chain[i];
      try {
        this.lastUsedProviderId = providerId;
        return await client.complete(messages, opts);
      } catch (err) {
        lastError = err;
        if (i < this.chain.length - 1) {
          const to = this.chain[i + 1].providerId;
          this.fallbackEvents.push({ from: providerId, to });
          this.onFallback?.(providerId, to, err);
        }
      }
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

  constructor(env: Record<string, string | undefined> = process.env) {
    loadEnvFile();
    this.env = env;
  }

  listProfiles(role: ModelRole): ProviderProfile[] {
    const order = (this.env.LLM_PROVIDER_ORDER ?? DEFAULT_PROVIDER_ORDER)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const profiles: ProviderProfile[] = [];
    const seen = new Set<string>();
    for (const id of order) {
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
    const chain = profiles.map((p) => ({
      providerId: p.id,
      model: p.models[role],
      client: new OpenAiCompatibleClient({
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        model: p.models[role],
        timeoutMs,
      }),
    }));
    if (chain.length === 1) return chain[0].client;
    return new FallbackLLMClient(chain, opts.onFallback);
  }
}

export function defaultRegistry(): LlmProviderRegistry {
  return new LlmProviderRegistry();
}
