/**
 * §8.3 会话上下文压缩单测（E193）
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../search/llm.js';
import {
  CONTEXT_TOKEN_BUDGET,
  VERBATIM_WINDOW_TURNS,
  buildCompactMessages,
  buildRecentMemory,
  buildSessionNotes,
  compressTurns,
  estimateTokens,
  SessionContextStore,
  type SessionContext,
  type SessionTurn,
} from './session-context.js';

class FakeLLM implements LLMClient {
  calls: Array<ChatMessage[]> = [];

  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return '实体：STM32F103C8T6；决策：选型定为 F103 系列；未决：主频超频待确认。';
  }
}

let dir = '';
let turnSeq = 0;
function freshDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'session-context-'));
  return dir;
}

function turn(role: SessionTurn['role'], text: string): SessionTurn {
  turnSeq += 1;
  return {
    id: `t${turnSeq}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    ts: new Date().toISOString(),
  };
}

function ctxOf(n: number): SessionContext {
  const turns: SessionTurn[] = [];
  for (let i = 0; i < n; i += 1) {
    turns.push(turn(i % 2 === 0 ? 'user' : 'assistant', `第${i + 1}轮对话内容 ${i + 1}`));
  }
  return { conversationId: 'c1', turns, summary: null, updatedAt: new Date().toISOString() };
}

test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('session: estimateTokens 粗估界', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcdefghij'), 5);
  assert.equal(estimateTokens('一二三四五'), 3);
});

test('session: buildCompactMessages 含三类信息与轮次转写', () => {
  const msgs = buildCompactMessages([turn('user', 'q1'), turn('assistant', 'a1')]);
  const system = msgs[0].content;
  assert.ok(system.includes('实体'));
  assert.ok(system.includes('决策'));
  assert.ok(system.includes('未决'));
  assert.ok(msgs[1].content.includes('用户：q1'));
  assert.ok(msgs[1].content.includes('助手：a1'));
});

test('session: compressTurns 走 LLM 并裁剪', async () => {
  const llm = new FakeLLM();
  const out = await compressTurns([turn('user', 'q')], llm);
  assert.ok(out.includes('实体：STM32F103C8T6'));
  assert.equal(llm.calls.length, 1);
});

test('session: append/load/save 持久化往返', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  await store.append('c1', 'user', '你好');
  await store.append('c1', 'assistant', '你好，我在。');
  const ctx = await store.load('c1');
  assert.ok(ctx);
  assert.equal(ctx.conversationId, 'c1');
  assert.equal(ctx.turns.length, 2);
  assert.equal(ctx.turns[0].role, 'user');
  assert.equal(ctx.summary, null);
});

test('session: load 损坏文件返回 null', async () => {
  const dir2 = freshDir();
  const store = new SessionContextStore({ dir: dir2 });
  await store.append('c1', 'user', 'x');
  // 手工破坏
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir2, 'c1.json'), '{bad json', 'utf-8');
  const ctx = await store.load('c1');
  assert.equal(ctx, null);
});

test('session: windowTurns 只保留最近 [P-29] 轮', () => {
  const store = new SessionContextStore();
  const ctx = ctxOf(VERBATIM_WINDOW_TURNS + 2);
  const window = store.windowTurns(ctx);
  assert.equal(window.length, VERBATIM_WINDOW_TURNS);
  assert.ok(!window.some((t) => t.text.includes('第1轮') || t.text.includes('第2轮')));
  assert.ok(window[0].text.includes('第3轮'));
});

test('session: overflowTurns 窗口外轮次', () => {
  const store = new SessionContextStore();
  const ctx = ctxOf(VERBATIM_WINDOW_TURNS + 2);
  const overflow = store.overflowTurns(ctx);
  assert.equal(overflow.length, 2);
  assert.ok(overflow[0].text.includes('第1轮'));
  assert.equal(store.needsCompaction(ctx), true);
});

test('session: overflowTurns 无窗口外且未超预算 → 空', () => {
  const store = new SessionContextStore();
  assert.deepEqual(store.overflowTurns(ctxOf(3)), []);
  assert.equal(store.needsCompaction(ctxOf(3)), false);
});

test('session: token 预算硬约束——窗口超 [P-109] 时最早轮次移入压缩', () => {
  const store = new SessionContextStore();
  const ctx: SessionContext = { conversationId: 'c1', turns: [], summary: null, updatedAt: '' };
  for (let i = 0; i < 4; i += 1) {
    ctx.turns.push(turn('user', 'x'.repeat(CONTEXT_TOKEN_BUDGET * 2)));
  }
  const overflow = store.overflowTurns(ctx);
  assert.ok(overflow.length > 0);
});

test('session: compact 压缩窗口外轮次并合并摘要', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  const ctx = ctxOf(VERBATIM_WINDOW_TURNS + 2);
  await store.save('c1', ctx);
  const llm = new FakeLLM();
  const next = await store.compact('c1', llm);
  assert.ok(next);
  assert.ok(next.summary!.includes('实体：STM32F103C8T6'));
  assert.equal(next.turns.length, VERBATIM_WINDOW_TURNS);
  // 二次压缩（无新溢出）不重复调用 LLM
  await store.compact('c1', llm);
  assert.equal(llm.calls.length, 1);
});

test('session: 防重入——并发 compact 只压一次', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  await store.save('c1', ctxOf(VERBATIM_WINDOW_TURNS + 2));
  const llm = new FakeLLM();
  const [a, b] = await Promise.all([store.compact('c1', llm), store.compact('c1', llm)]);
  assert.equal(llm.calls.length, 1);
  assert.ok(a || b); // 至少一个返回压缩结果
});

test('session: append 后 compactIfNeeded 全链路', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  const llm = new FakeLLM();
  for (let i = 0; i < 8; i += 1) {
    await store.append('c1', i % 2 === 0 ? 'user' : 'assistant', `第${i + 1}轮`);
  }
  const ctx = await store.compactIfNeeded('c1', llm);
  assert.ok(ctx);
  assert.ok(ctx.summary);
  assert.equal(ctx.turns.length, VERBATIM_WINDOW_TURNS);
});

test('session: buildSessionNotes 摘要 + 窗口轮次注入', () => {
  const ctx: SessionContext = { conversationId: 'c1', turns: [turn('user', '最近问题')], summary: '实体：A；决策：B', updatedAt: '' };
  const notes = buildSessionNotes(ctx);
  assert.ok(notes[0].includes('【会话摘要（此前轮次）】实体：A；决策：B'));
  assert.ok(notes[1].includes('Q: 最近问题'));
});

test('session: buildRecentMemory 按 user/assistant 配对', () => {
  const ctx: SessionContext = {
    conversationId: 'c1',
    turns: [turn('user', 'q1'), turn('assistant', 'a1'), turn('user', 'q2')],
    summary: null,
    updatedAt: '',
  };
  const pairs = buildRecentMemory(ctx);
  assert.deepEqual(pairs, [
    { query: 'q1', answer: 'a1' },
  ]);
});
