#!/usr/bin/env node
/**
 * E193 上下文压缩真实冒烟（bench:B-20260822-05）：
 * 1) 轻模型压缩 2 轮合成对话 → 「实体/决策/未决」摘要
 * 2) SessionContextStore 全链路：append 8 轮 → compactIfNeeded 触发压缩
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLightClient } from '../src/search/llm.js';
import { SessionContextStore, compressTurns, VERBATIM_WINDOW_TURNS } from '../src/memory/session-context.js';

const llm = createLightClient({ timeoutMs: 8000 });

const turns = [
  { id: 'a', role: 'user', text: '项目用 STM32F103C8T6，主频 72MHz，要画 PCB，用 KiCad 还是 Altium？', ts: new Date().toISOString() },
  { id: 'b', role: 'assistant', text: '建议 KiCad：开源免费、库全，一人公司不需要 Altium 授权成本。', ts: new Date().toISOString() },
  { id: 'c', role: 'user', text: '那就定 KiCad 6，I2C 上拉电阻选 4.7k 还是 10k？', ts: new Date().toISOString() },
  { id: 'd', role: 'assistant', text: '400kHz 下 4.7k 更稳，10k 省电但边沿慢；选 4.7k，总线电容大时再看。', ts: new Date().toISOString() },
];

const t0 = Date.now();
const summary = await compressTurns(turns, llm);
const elapsed = Date.now() - t0;
console.log(`[1/2] 轻模型压缩 ${turns.length} 轮（${elapsed}ms）:`);
console.log(summary);
const markers = ['实体', '决策', '未决'].filter((m) => summary.includes(m));
console.log(`标记命中: ${markers.join('/') || '无'} | 关键实体: ${summary.includes('STM32') || summary.includes('KiCad') || summary.includes('4.7k')}`);

const dir = mkdtempSync(join(tmpdir(), 'e193-bench-'));
const store = new SessionContextStore({ dir });
try {
  for (let i = 0; i < 8; i += 1) {
    await store.append('bench-c1', i % 2 === 0 ? 'user' : 'assistant', `第${i + 1}轮：${i % 2 === 0 ? '问题' : '回答'} 内容 ${i + 1}`);
  }
  const t1 = Date.now();
  const ctx = await store.compactIfNeeded('bench-c1', llm);
  const elapsed2 = Date.now() - t1;
  console.log(`[2/2] 全链路：append 8 轮 → compactIfNeeded（${elapsed2}ms）`);
  console.log(`窗口保留: ${ctx?.turns.length ?? 0}/${VERBATIM_WINDOW_TURNS} 轮 | 摘要前 120 字: ${ctx?.summary?.slice(0, 120) ?? '无'}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
