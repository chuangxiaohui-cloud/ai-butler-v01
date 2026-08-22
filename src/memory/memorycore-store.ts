/**
 * MemoryCoreStore（v0.2b，§8.4 同接口同 schema）
 * 通过 MemoryCore sidecar HTTP API 读写 L0；切换 = 配置项。
 *
 * 身份隔离（SEV-1.1）：team/agent/user 三元组由调用方提供，禁止硬编码。
 * - 业务调用：构造时传入 identity（来自已登录会话 / AuthContext）。
 * - CLI / 测试：显式传入或在 env 提供 MEMORY_CORE_TEAM_ID/_AGENT_ID/_USER_ID。
 */

import type { MemoryRecord, MemoryStore } from './store.js';

export interface MemoryCoreIdentity {
  teamId: string;
  agentId: string;
  userId: string;
}

const ENDPOINT = process.env.MEMORY_CORE_ENDPOINT ?? 'http://127.0.0.1:8420';
const API_KEY = process.env.TDAI_GATEWAY_API_KEY ?? 'local-dev-key';
const SERVICE_ID = process.env.TDAI_SERVICE_ID ?? 'ai-butler';
const TIMEOUT_MS = 3000; // [P-42]

function readIdentityFromEnv(): MemoryCoreIdentity | null {
  const teamId = process.env.MEMORY_CORE_TEAM_ID?.trim();
  const agentId = process.env.MEMORY_CORE_AGENT_ID?.trim();
  const userId = process.env.MEMORY_CORE_USER_ID?.trim();
  if (!teamId || !agentId || !userId) return null;
  return { teamId, agentId, userId };
}

interface ConversationItem {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface ApiEnvelope<T> {
  code: number;
  message?: string;
  request_id?: string;
  data: T;
}

export class MemoryCoreStore implements MemoryStore {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly identity: MemoryCoreIdentity;

  constructor(
    identity: MemoryCoreIdentity | null,
    endpoint = ENDPOINT,
    timeoutMs = TIMEOUT_MS,
  ) {
    if (!identity) {
      throw new Error(
        'MemoryCoreStore 缺少身份三元组：构造时必须传入 { teamId, agentId, userId }（来自会话/AuthContext 或显式 env）。',
      );
    }
    if (!identity.teamId || !identity.agentId || !identity.userId) {
      throw new Error('MemoryCoreStore 身份三元组任一字段为空，存在越权风险。');
    }
    this.identity = identity;
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(`${this.endpoint}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'x-tdai-service-id': SERVICE_ID,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`MemoryCore HTTP ${resp.status}: ${detail.slice(0, 200)}`);
      }
      const envelope = (await resp.json()) as ApiEnvelope<T>;
      if (envelope.code !== 0) throw new Error(envelope.message ?? 'MemoryCore 业务错误');
      return envelope.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async put(record: MemoryRecord): Promise<string> {
    const data = await this.post<{ accepted_ids: string[]; total_count: number }>(
      '/v3/conversation/add',
      {
        team_id: this.identity.teamId,
        agent_id: this.identity.agentId,
        user_id: this.identity.userId,
        session_id: record.session_id,
        messages: [
          { role: 'user', content: record.query },
          { role: 'assistant', content: record.answer },
        ],
      },
    );
    return data.accepted_ids[0] ?? `${record.session_id}:${Date.now()}`;
  }

  async recall(sessionId: string, limit = 10): Promise<MemoryRecord[]> {
    const wanted = Math.min(Math.max(limit * 2, 20), 500);
    let messages: ConversationItem[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    while (messages.length < wanted && messages.length < total) {
      const page = await this.post<{ messages: ConversationItem[]; total: number }>(
        '/v3/conversation/query',
        {
          team_id: this.identity.teamId,
          agent_id: this.identity.agentId,
          user_id: this.identity.userId,
          session_id: sessionId,
          limit: 100,
          offset,
        },
      );
      messages = [...messages, ...page.messages];
      total = page.total;
      offset += 100;
    }
    const records: MemoryRecord[] = [];
    const ordered = [...messages].sort(
      (a, b) => Date.parse(a.timestamp ?? '0') - Date.parse(b.timestamp ?? '0'),
    );
    for (let i = 0; i < ordered.length; i++) {
      const msg = ordered[i];
      const prev = ordered[i - 1];
      if (msg.role === 'assistant' && prev?.role === 'user') {
        // SEV-1.1：原代码把 confidence 硬写为 1（伪造）。MemoryCore 回放不携带
        // 评分，回填为中性 0（"未评分"）而非假装权威；下游若需要打分由
        // synthesize 阶段重新评估。
        records.push({
          session_id: sessionId,
          query: prev.content,
          answer: msg.content,
          confidence: 0,
          evidence_hash: msg.id ?? '',
          timestamp: msg.timestamp ? Date.parse(msg.timestamp) : Date.now(),
        });
      }
    }
    return records.slice(-limit);
  }

  async forget(sessionId: string): Promise<void> {
    await this.post<{ deleted_count: number }>('/v3/conversation/delete', {
      team_id: this.identity.teamId,
      agent_id: this.identity.agentId,
      user_id: this.identity.userId,
      session_id: sessionId,
    });
  }
}

/**
 * 默认工厂：CLI / 批处理场景使用。要求显式 env，禁止匿名默认。
 * Gateway 应直接 new MemoryCoreStore(session.identity)。
 */
export function defaultMemoryCoreStore(): MemoryCoreStore {
  const identity = readIdentityFromEnv();
  if (!identity) {
    throw new Error(
      'defaultMemoryCoreStore 需在 env 中显式设置 MEMORY_CORE_TEAM_ID / _AGENT_ID / _USER_ID；' +
        '业务入口应改为基于会话身份构造 MemoryCoreStore。',
    );
  }
  return new MemoryCoreStore(identity);
}