#!/usr/bin/env node
/**
 * 诊断 AnySearch 单条 query（WP4 排障用）
 * 用法: npx tsx debug-anysearch.ts "TPS5430 输入电压范围"
 */
import { loadEnvFile } from '../src/config/env.js';
import { anysearchProvider } from '../src/search/providers/anysearch.js';

const query = process.argv[2] ?? 'TPS5430 输入电压范围';
loadEnvFile();
const r = await anysearchProvider.search(query, { timeoutMs: 15_000 });
console.log(
  JSON.stringify(
    {
      provider: r.provider,
      ok: r.ok,
      latencyMs: r.latencyMs,
      error: r.error,
      results: r.results.map((x) => ({ title: x.title, url: x.url })),
    },
    null,
    2,
  ),
);
