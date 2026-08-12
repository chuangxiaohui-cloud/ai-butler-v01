#!/usr/bin/env node
/**
 * v0.2a WP0：Tavily 真实调用验证
 * 用法: npm run tavily:verify -- "查询1" "查询2"（默认两条）
 */
import { loadEnvFile } from '../src/config/env.js';
import { tavilyProvider } from '../src/search/providers/tavily.js';

const queries =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['今天A股行情', 'STM32F103C8T6 最大主频是多少'];
const timeoutMs = Number(process.env.TAVILY_TIMEOUT_MS ?? '3000');

loadEnvFile();
console.log(`[warmup] Tavily 验证开始，${queries.length} 条 query，超时 ${timeoutMs}ms\n`);
for (const query of queries) {
  const r = await tavilyProvider.search(query, { timeoutMs });
  console.log(
    JSON.stringify(
      {
        query,
        ok: r.ok,
        latencyMs: r.latencyMs,
        results: r.results.length,
        answer: r.answer?.slice(0, 200) ?? null,
        error: r.error ?? null,
      },
      null,
      2,
    ),
  );
}
console.log('\n[warmup] Tavily 验证完成');
