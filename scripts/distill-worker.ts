#!/usr/bin/env node
/**
 * v0.2b L1 蒸馏 worker（E6）
 * 从 data/memory.db 的 L0 记录提取长期记忆，写入 ExperienceManager。
 * 用法: npx tsx scripts/distill-worker.ts [--limit N] [--dry-run]
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { distillRecord } from '../src/memory/distill.js';
import { ExperienceManager } from '../src/memory/experience.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'data', 'memory.db');
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv[process.argv.indexOf('--limit') + 1];
const limit = limitArg && Number.isFinite(+limitArg) ? +limitArg : Number.POSITIVE_INFINITY;

async function main(): Promise<void> {
  if (!existsSync(dbPath)) {
    console.error('未找到 data/memory.db');
    process.exit(1);
  }
  const db = new DatabaseSync(dbPath);
  const baseSql = `SELECT id, query, answer, timestamp FROM l0_memory ORDER BY timestamp ASC`;
  const rows = (Number.isFinite(limit)
    ? db.prepare(`${baseSql} LIMIT ?`).all(limit)
    : db.prepare(baseSql).all()) as Array<{
    id: number;
    query: string;
    answer: string;
    timestamp: number;
  }>;
  db.close();

  const exp = new ExperienceManager();
  let ok = 0;
  let distilled = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const memories = await distillRecord({ query: row.query, answer: row.answer });
    if (memories.length === 0) {
      failed.push(`l0:${row.id}`);
      continue;
    }
    for (let i = 0; i < memories.length; i++) {
      const mem = memories[i];
      exp.add({
        id: `l0:${row.id}:${i}`,
        skillName: 'memory-distill',
        content: mem.content,
        keywords: mem.keywords,
        createdAt: row.timestamp,
        lastUsedAt: row.timestamp,
      });
      distilled += 1;
    }
    ok += 1;
  }
  exp.close();

  console.log(`处理 ${rows.length} 条 L0，提取 ${distilled} 条记忆，成功 ${ok} 条，无提取 ${failed.length} 条`);
  if (failed.length > 0) {
    console.log(`无提取样例（前 5）：${failed.slice(0, 5).join(', ')}`);
  }
}

await main();
