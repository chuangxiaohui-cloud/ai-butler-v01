/**
 * §8.3 会话上下文分层压缩（E193）
 * 同一会话内：逐字窗口（[P-29] 5 轮）完整保留；窗口外轮次由轻模型压缩为
 * 「实体 + 决策 + 未决事项」摘要；触发为 [P-29] 轮数或 [P-109] token 预算双触发。
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { ChatMessage, LLMClient } from '../search/llm.js';

export const VERBATIM_WINDOW_TURNS = 5; // [P-29] 逐字窗口轮数
export const CONTEXT_TOKEN_BUDGET = 6000; // [P-109] 会话上下文 token 预算（压缩触发硬约束）
export const COMPACT_MAX_TOKENS = 300; // 压缩摘要输出上限（轻模型 max_tokens）
export const COMPACT_TIMEOUT_MS = 8000; // 压缩调用超时（轻模型，独立于主对话预算）
const SUMMARY_INJECT_CAP = 600; // 摘要注入截断长度（字符）

export interface SessionTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}

export interface SessionContext {
  conversationId: string;
  turns: SessionTurn[];
  summary: string | null;
  updatedAt: string;
}

/** 粗略 token 估算：中文为主约 2 字符/token，取 ceil(len/2)；仅用于压缩触发，非精确计量 */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 2);
}

function safeId(conversationId: string): string {
  return conversationId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'default';
}

/** 构建压缩 prompt（实体/决策/未决事项） */
export function buildCompactMessages(turns: SessionTurn[]): ChatMessage[] {
  const transcript = turns
    .map((t, i) => `${i + 1}. ${t.role === 'user' ? '用户' : '助手'}：${t.text}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        '你是对话压缩器。把以下同一会话的早期对话压缩为结构化摘要，只保留三类信息：' +
        '实体（器件型号/参数/人名/项目名）、决策（已确定的选择与理由）、未决事项（待确认/待办）。' +
        '输出格式：「实体：…；决策：…；未决：…」。不超过 300 字，省略寒暄与重复内容。',
    },
    { role: 'user', content: transcript },
  ];
}

/** 用轻模型压缩轮次为摘要；LLM 失败时抛错由调用方静默 */
export async function compressTurns(turns: SessionTurn[], llm: LLMClient): Promise<string> {
  const raw = await llm.complete(buildCompactMessages(turns), { maxTokens: COMPACT_MAX_TOKENS });
  return (raw ?? '').trim().slice(0, 600);
}

/** 注入用：摘要 + 逐字窗口轮次（单条截断，与既有 memoryNotes 风格一致） */
export function buildSessionNotes(ctx: SessionContext | null): string[] {
  if (!ctx) return [];
  const notes: string[] = [];
  if (ctx.summary) notes.push(`【会话摘要（此前轮次）】${ctx.summary.slice(0, SUMMARY_INJECT_CAP)}`);
  for (const t of ctx.turns) {
    notes.push(`${t.role === 'user' ? 'Q' : 'A'}: ${t.text.slice(0, 120)}`);
  }
  return notes;
}

/** 注入用：按 user/assistant 配对还原 Q→A（供工作记忆/路由消歧） */
export function buildRecentMemory(ctx: SessionContext | null): Array<{ query: string; answer: string }> {
  if (!ctx) return [];
  const pairs: Array<{ query: string; answer: string }> = [];
  let pending: string | null = null;
  for (const t of ctx.turns) {
    if (t.role === 'user') pending = t.text;
    else if (t.role === 'assistant' && pending !== null) {
      pairs.push({ query: pending, answer: t.text });
      pending = null;
    }
  }
  return pairs;
}

export class SessionContextStore {
  private readonly dir: string;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly compacting = new Set<string>();

  constructor(options: { dir?: string } = {}) {
    this.dir = options.dir ?? join(process.cwd(), 'data', 'session-context');
  }

  private fileFor(conversationId: string): string {
    return join(this.dir, `${safeId(conversationId)}.json`);
  }

  private async persist(conversationId: string, ctx: SessionContext): Promise<void> {
    try {
      const file = this.fileFor(conversationId);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(ctx, null, 2), 'utf-8');
    } catch {
      // 写失败不阻塞
    }
  }

  /** 同一会话的读改写串行化，避免并发 append/compact 丢更新 */
  private runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(key, next.then(() => undefined, () => undefined));
    return next;
  }

  async load(conversationId: string): Promise<SessionContext | null> {
    try {
      const parsed = JSON.parse(readFileSync(this.fileFor(conversationId), 'utf-8')) as SessionContext;
      if (parsed && typeof parsed.conversationId === 'string' && Array.isArray(parsed.turns)) {
        for (const t of parsed.turns) {
          if (!t.id) t.id = randomUUID();
        }
        return parsed;
      }
    } catch {
      // 首次使用或文件损坏
    }
    return null;
  }

  async save(conversationId: string, ctx: SessionContext): Promise<void> {
    await this.runExclusive(conversationId, () => this.persist(conversationId, ctx));
  }

  async append(conversationId: string, role: SessionTurn['role'], text: string): Promise<void> {
    await this.runExclusive(conversationId, async () => {
      const ctx =
        (await this.load(conversationId)) ??
        ({ conversationId, turns: [], summary: null, updatedAt: new Date().toISOString() } as SessionContext);
      ctx.turns.push({ id: randomUUID(), role, text: text ?? '', ts: new Date().toISOString() });
      ctx.updatedAt = new Date().toISOString();
      await this.persist(conversationId, ctx);
    });
  }

  /** 逐字窗口内轮次（最近 [P-29] 轮） */
  windowTurns(ctx: SessionContext): SessionTurn[] {
    return ctx.turns.slice(-VERBATIM_WINDOW_TURNS);
  }

  /** 应压缩的轮次：窗口外轮次；若窗口本身超 [P-109] token 预算，则最早窗口轮次也移入（token 是硬约束） */
  overflowTurns(ctx: SessionContext): SessionTurn[] {
    if (ctx.turns.length === 0) return [];
    const window = this.windowTurns(ctx);
    const older = ctx.turns.slice(0, ctx.turns.length - window.length);
    const windowTokens = window.reduce((sum, t) => sum + estimateTokens(t.text), 0);
    if (older.length > 0 && windowTokens <= CONTEXT_TOKEN_BUDGET) return older;
    if (windowTokens <= CONTEXT_TOKEN_BUDGET) return [];
    const overflow: SessionTurn[] = [...older];
    const kept: SessionTurn[] = [];
    for (const t of window) {
      const keptTokens = kept.reduce((sum, x) => sum + estimateTokens(x.text), 0);
      if (keptTokens + estimateTokens(t.text) > CONTEXT_TOKEN_BUDGET) overflow.push(t);
      else kept.push(t);
    }
    return overflow;
  }

  /** 需要压缩（有窗口外轮次或超预算） */
  needsCompaction(ctx: SessionContext): boolean {
    return this.overflowTurns(ctx).length > 0;
  }

  /** 压缩窗口外轮次并入摘要；防重入；LLM 压缩在锁外执行，不阻塞 append */
  async compact(conversationId: string, llm: LLMClient): Promise<SessionContext | null> {
    if (this.compacting.has(conversationId)) return null;
    this.compacting.add(conversationId);
    try {
      const ctx = await this.load(conversationId);
      if (!ctx) return null;
      const overflow = this.overflowTurns(ctx);
      if (overflow.length === 0) return ctx;
      const overflowIds = new Set(overflow.map((t) => t.id));
      const compressed = await compressTurns(overflow, llm);
      return await this.runExclusive(conversationId, async () => {
        const fresh = await this.load(conversationId);
        if (!fresh) return null;
        const kept = fresh.turns.filter((t) => !overflowIds.has(t.id));
        const merged = fresh.summary ? `${fresh.summary}\n${compressed}` : compressed;
        const next: SessionContext = {
          ...fresh,
          turns: kept,
          summary: merged,
          updatedAt: new Date().toISOString(),
        };
        await this.persist(conversationId, next);
        return next;
      });
    } finally {
      this.compacting.delete(conversationId);
    }
  }

  /** 便捷入口：有压缩需求才压缩 */
  async compactIfNeeded(conversationId: string, llm: LLMClient): Promise<SessionContext | null> {
    const ctx = await this.load(conversationId);
    if (!ctx || !this.needsCompaction(ctx)) return ctx;
    return this.compact(conversationId, llm);
  }
}
