#!/usr/bin/env node
/**
 * 多源质量统计 CLI
 * 用法: npm run sources:stats
 */

import { SearchSourceStats } from '../src/search/source-stats.js';

const stats = new SearchSourceStats();
try {
  const rows = stats.summary();
  if (rows.length === 0) {
    console.log('暂无搜索源质量数据。');
    return;
  }
  for (const r of rows) {
    const okRate = r.calls > 0 ? r.okCalls / r.calls : 0;
    const avgMs = r.calls > 0 ? Math.round(r.totalMs / r.calls) : 0;
    console.log(`${r.source} | ${r.intent} | n=${r.calls} | ok=${r.okCalls} (${(okRate * 100).toFixed(1)}%) | avg=${avgMs}ms`);
  }
} finally {
  stats.close();
}
