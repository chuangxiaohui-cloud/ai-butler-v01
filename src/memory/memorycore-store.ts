/**
 * MemoryCoreStore（v0.2b，§8.4 同接口同 schema）
 * 通过 MemoryCore sidecar HTTP API 读写 L0；切换 = 配置项。
 */

import type { MemoryRecord, MemoryStore } from './store.js';

const ENDPOINT = process.env.MEMORY_CORE_ENDPOINT ?? 'http://127.0.0.1:8420';
const API_KEY = process.env.TDAI_GATEWAY_API_KEY ?? 'local-dev-key';
const SERVICE_ID = process.env.TDAI_SERVICE_ID ?? 'ai-butler';
const TEAM_ID = 'ai-butler';
const AGENT_ID = 'secretary';
const USER_ID = 'laozhang';
const TIMEOUT_MS = 3000; // [P-42]

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

  constructor(endpoint = ENDPOINT, timeoutMs = TIMEOUT_MS) {
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
        team_id: TEAM_ID,
        agent_id: AGENT_ID,
        user_id: USER_ID,
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
          team_id: TEAM_ID,
          agent_id: AGENT_ID,
          user_id: USER_ID,
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
        records.push({
          session_id: sessionId,
          query: prev.content,
          answer: msg.content,
          confidence: 1,
          evidence_hash: msg.id ?? '',
          timestamp: msg.timestamp ? Date.parse(msg.timestamp) : Date.now(),
        });
      }
    }
    return records.slice(-limit);
  }

  async forget(sessionId: string): Promise<void> {
    await this.post<{ deleted_count: number }>('/v3/conversation/delete', {
      team_id: TEAM_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      session_id: sessionId,
    });
  }
}

export function defaultMemoryCoreStore(): MemoryCoreStore {
  return new MemoryCoreStore();
}
