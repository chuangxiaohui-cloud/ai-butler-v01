import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { LLMClient } from '../search/llm.js';
import { SessionContextStore } from '../memory/session-context.js';
import { describeSession, handleSlashCommand, parseSlashCommand } from './slash-commands.js';

function tempStore(): { store: SessionContextStore; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'slash-cmd-'));
  return {
    store: new SessionContextStore({ dir }),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const fakeLlm: LLMClient = {
  async complete() {
    return '实体：测试件；决策：已定；未决：待确认';
  },
};

async function seed(store: SessionContextStore, conversationId: string, turns: number): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await store.append(conversationId, i % 2 === 0 ? 'user' : 'assistant', `第 ${i + 1} 轮内容`);
  }
}

test('slash: /compact 与 /context 整行识别（含大小写与尾随空格）', () => {
  assert.deepEqual(parseSlashCommand('/compact'), { name: 'compact', raw: '/compact' });
  assert.deepEqual(parseSlashCommand(' /Context  '), { name: 'context', raw: '/Context' });
  assert.equal(parseSlashCommand('/compact now'), null);
  assert.equal(parseSlashCommand('/help'), null);
  assert.equal(parseSlashCommand('/STM32 引脚图'), null);
  assert.equal(parseSlashCommand('compact'), null);
  assert.equal(parseSlashCommand('/'), null);
  assert.equal(parseSlashCommand(''), null);
});

test('slash: 非斜杠命令返回 null，不进斜杠分支', async () => {
  const { store, cleanup } = tempStore();
  try {
    const res = await handleSlashCommand('STM32F103C8T6 主频是多少', 'c1', { sessionContext: store });
    assert.equal(res, null);
  } finally {
    cleanup();
  }
});

test('slash: /context 无 conversationId 时给出提示', async () => {
  const { store, cleanup } = tempStore();
  try {
    const res = await handleSlashCommand('/context', undefined, { sessionContext: store });
    assert.ok(res);
    assert.equal(res.slash, 'context');
    assert.ok(res.answer.includes('会话 ID'));
    assert.equal(res.gate_triggered, 'none');
  } finally {
    cleanup();
  }
});

test('slash: /context 返回轮次/窗口/摘要/token 状态', async () => {
  const { store, cleanup } = tempStore();
  try {
    await seed(store, 'c1', 8);
    const res = await handleSlashCommand('/context', 'c1', { sessionContext: store });
    assert.ok(res);
    assert.ok(res.answer.includes('8'), res.answer);
    assert.ok(res.answer.includes('逐字窗口'));
    assert.ok(res.answer.includes('待压缩'));
    assert.ok(res.answer.includes('预算'));
  } finally {
    cleanup();
  }
});

test('slash: /compact 压缩窗口外轮次并保留逐字窗口', async () => {
  const { store, cleanup } = tempStore();
  try {
    await seed(store, 'c1', 8);
    const res = await handleSlashCommand('/compact', 'c1', { sessionContext: store, llm: fakeLlm });
    assert.ok(res);
    assert.ok(res.answer.includes('已手动压缩'), res.answer);
    const ctx = await store.load('c1');
    assert.ok(ctx);
    assert.equal(ctx.turns.length, 5, '窗口内 5 轮应保留原文');
    assert.ok(ctx.summary && ctx.summary.includes('实体'), '窗口外轮次应压缩为摘要');
  } finally {
    cleanup();
  }
});

test('slash: /compact 无待压缩内容时如实说明', async () => {
  const { store, cleanup } = tempStore();
  try {
    await seed(store, 'c1', 2);
    const res = await handleSlashCommand('/compact', 'c1', { sessionContext: store, llm: fakeLlm });
    assert.ok(res);
    assert.ok(res.answer.includes('无需压缩'), res.answer);
    const ctx = await store.load('c1');
    assert.ok(ctx && ctx.summary === null, '不压缩不应生成摘要');
  } finally {
    cleanup();
  }
});

test('slash: /compact 空会话提示无需压缩', async () => {
  const { store, cleanup } = tempStore();
  try {
    const res = await handleSlashCommand('/compact', 'c1', { sessionContext: store, llm: fakeLlm });
    assert.ok(res);
    assert.ok(res.answer.includes('暂无轮次'), res.answer);
  } finally {
    cleanup();
  }
});

test('slash: /compact LLM 失败时以可读错误返回', async () => {
  const failingLlm: LLMClient = {
    async complete() {
      throw new Error('mock 压缩失败');
    },
  };
  const { store, cleanup } = tempStore();
  try {
    await seed(store, 'c1', 8);
    const res = await handleSlashCommand('/compact', 'c1', { sessionContext: store, llm: failingLlm });
    assert.ok(res);
    assert.ok(res.answer.includes('执行失败'), res.answer);
    assert.ok(res.answer.includes('mock 压缩失败'), res.answer);
    const ctx = await store.load('c1');
    assert.equal(ctx?.turns.length, 8, '压缩失败不应动原轮次');
  } finally {
    cleanup();
  }
});

test('slash: describeSession 空会话返回全零占位', () => {
  const { store, cleanup } = tempStore();
  try {
    const report = describeSession(null, store);
    assert.equal(report.turns, 0);
    assert.equal(report.budget, 6000); // [P-109]
    assert.equal(report.needsCompaction, false);
  } finally {
    cleanup();
  }
});
test('slash: /cost 整行识别且大小写不敏感', () => {
  assert.deepEqual(parseSlashCommand('/cost'), { name: 'cost', raw: '/cost' });
  assert.deepEqual(parseSlashCommand(' /Cost  '), { name: 'cost', raw: '/Cost' });
  assert.equal(parseSlashCommand('/cost today'), null, '整行匹配，不接受参数');
});

test('slash: /cost 无 conversationId 也可输出全局成本报告', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slash-cost-'));
  const usageFile = join(dir, 'usage.jsonl');
  const budgetFile = join(dir, 'usage-budget.json');
  // 今日可计价记录（deepseek-v4-flash 单价见 model-pricing），确保报告非空
  writeFileSync(
    usageFile,
    `${JSON.stringify({ ts: Date.now(), provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 1_000_000, completionTokens: 100_000, cacheHitTokens: 800_000, cacheMissTokens: 200_000 })}\n`,
    'utf-8',
  );
  writeFileSync(budgetFile, JSON.stringify({ dailyBudgetCny: 5, monthlyBudgetCny: 150 }), 'utf-8');
  try {
    const store = new SessionContextStore({ dir: join(dir, 'ctx') });
    const res = await handleSlashCommand('/cost', undefined, {
      sessionContext: store,
      costOptions: { usageFile, budgetFile },
    });
    assert.ok(res);
    assert.equal(res.slash, 'cost');
    assert.ok(res.answer.includes('AI 运营成本'), res.answer);
    assert.ok(res.answer.includes('今日'), res.answer);
    assert.ok(res.answer.includes('本月'), res.answer);
    assert.ok(res.answer.includes('预算 ¥5'), res.answer);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('slash: /cost 携带 conversationId 时同样可用（全局只读）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slash-cost-cid-'));
  const usageFile = join(dir, 'usage.jsonl');
  writeFileSync(usageFile, '', 'utf-8');
  try {
    const store = new SessionContextStore({ dir: join(dir, 'ctx') });
    const res = await handleSlashCommand('/cost', 'c1', {
      sessionContext: store,
      costOptions: { usageFile },
    });
    assert.ok(res);
    assert.equal(res.slash, 'cost');
    assert.ok(res.answer.includes('AI 运营成本'), res.answer);
    assert.ok(res.answer.includes('调用: 0 次'), res.answer);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('slash: /cost 数据源异常时以可读 answer 兜底不抛错', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slash-cost-fail-'));
  try {
    const res = await handleSlashCommand('/cost', 'c1', {
      sessionContext: new SessionContextStore({ dir: join(dir, 'ctx') }),
      costOptions: { usageFile: dir }, // 目录而非文件 → 读取抛错，应被兜底
    });
    assert.ok(res);
    assert.equal(res.slash, 'cost');
    assert.ok(res.answer.includes('执行失败'), res.answer);
    assert.equal(res.confidence, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});