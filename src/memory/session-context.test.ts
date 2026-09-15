/**
 * §8.3 会话上下文压缩单测（E193）
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

test('session: 跨实例并发 append 不丢更新（H5 跨进程锁回归）', async () => {
  const d = freshDir();
  const storeA = new SessionContextStore({ dir: d });
  const storeB = new SessionContextStore({ dir: d });
  await Promise.all([
    ...Array.from({ length: 5 }, (_, i) => storeA.append('c1', 'user', `A${i}`)),
    ...Array.from({ length: 5 }, (_, i) => storeB.append('c1', 'assistant', `B${i}`)),
  ]);
  const ctx = await storeA.load('c1');
  assert.ok(ctx, '会话文件应存在');
  assert.equal(ctx.turns.length, 10, '两实例并发 append 应无丢失');
  const texts = ctx.turns.map((t) => t.text);
  assert.ok(texts.includes('A0') && texts.includes('B4'), '两实例的轮次都应保留');
});

test('session: 原子写后无 tmp/锁残留（H5）', async () => {
  const d = freshDir();
  const store = new SessionContextStore({ dir: d });
  await store.append('c1', 'user', '第一轮');
  await store.append('c1', 'assistant', '回答');
  const files = readdirSync(d).sort();
  assert.deepEqual(files, ['c1.json'], `目录应只剩 c1.json，实际：${files.join(', ')}`);
  const ctx = await store.load('c1');
  assert.equal(ctx?.turns.length, 2);
});

test('session: 陈旧锁文件可被夺锁恢复（崩溃残留）', async () => {
  const d = freshDir();
  const store = new SessionContextStore({ dir: d });
  const lockPath = join(d, 'c1.json.lock');
  writeFileSync(lockPath, '99999\n', 'utf-8');
  const past = new Date(Date.now() - 60_000);
  utimesSync(lockPath, past, past);
  await store.append('c1', 'user', 'x');
  const ctx = await store.load('c1');
  assert.equal(ctx?.turns.length, 1);
  assert.ok(!readdirSync(d).includes('c1.json.lock'), '操作结束后锁应被移除');
});
test('session: 摘要存储受上限约束，保留最新段（P14）', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  const ctx = ctxOf(VERBATIM_WINDOW_TURNS + 2);
  ctx.summary = 'A'.repeat(700);
  await store.save('c1', ctx);
  const llm = new FakeLLM();
  const next = await store.compact('c1', llm);
  assert.ok(next);
  assert.ok(next.summary!.length <= 600);
  // 最新压缩段保留（尾部截断，不再丢 601 字符后的信息）
  assert.ok(next.summary!.includes('实体：STM32F103C8T6'));
});

test('session: buildSessionNotes 只注入逐字窗口轮次（P14 硬顶）', () => {
  const turns: SessionTurn[] = [];
  for (let i = 0; i < 12; i += 1) {
    turns.push(turn(i % 2 === 0 ? 'user' : 'assistant', `第${i + 1}轮`));
  }
  const ctx: SessionContext = { conversationId: 'c1', turns, summary: null, updatedAt: '' };
  const notes = buildSessionNotes(ctx);
  assert.equal(notes.length, VERBATIM_WINDOW_TURNS);
  assert.ok(notes[0].includes('第8轮'));
});

test('session: buildRecentMemory 只保留最近窗口配对（P14 硬顶）', () => {
  const turns: SessionTurn[] = [];
  for (let i = 0; i < 14; i += 1) {
    turns.push(turn('user', `q${i}`));
    turns.push(turn('assistant', `a${i}`));
  }
  const pairs = buildRecentMemory({
    conversationId: 'c1',
    turns,
    summary: null,
    updatedAt: '',
  });
  assert.equal(pairs.length, VERBATIM_WINDOW_TURNS);
  assert.deepEqual(pairs[pairs.length - 1], { query: 'q13', answer: 'a13' });
});

test('session: 已解决的最近情绪话题退出活跃上下文并返回人格素材', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  await store.append('c1', 'user', '最近工作压力很大，晚上总是失眠');
  await store.append('c1', 'assistant', '先试试把睡前工作清单放下。');
  await store.append('c1', 'user', '我好多了，谢谢你');
  await store.append('c1', 'assistant', '那就好，今晚早点休息。');

  const material = await store.resolveLatestLifeTopic('c1', '我好多了，谢谢你');
  const ctx = await store.load('c1');
  assert.equal(material, '用户已解决的情绪话题：最近工作压力很大，晚上总是失眠');
  assert.deepEqual(ctx?.turns, []);
});

test('session: 无明确解决信号或最近话题为技术内容时不移出', async () => {
  const store = new SessionContextStore({ dir: freshDir() });
  await store.append('c1', 'user', 'STM32 当前版本需要升级');
  await store.append('c1', 'assistant', '建议先核对发行说明。');
  await store.append('c1', 'user', '已经解决了');
  await store.append('c1', 'assistant', '收到。');

  assert.equal(await store.resolveLatestLifeTopic('c1', '已经解决了'), null);
  assert.equal((await store.load('c1'))?.turns.length, 4);
  assert.equal(await store.resolveLatestLifeTopic('c1', '继续看看'), null);
});
