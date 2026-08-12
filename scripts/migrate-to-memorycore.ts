#!/usr/bin/env node
/**
 * v0.2b WP1：把 data/memory.db 的 L0 记录迁移到 MemoryCore sidecar。
 * 用法: npx tsx scripts/migrate-to-memorycore.ts [--dry-run]
 */

import { copyFileSync, existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { MemoryCoreStore } from '../src/memory/memorycore-store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'data', 'memory.db');
const backupPath = join(root, 'data', 'memory.db.bak-v0.2b');
const dryRun = process.argv.includes('--dry-run');
const reset = process.argv.includes('--reset');

interface L0Row {
  session_id: string;
  query: string;
  answer: string;
  confidence: number;
  evidence_hash: string;
  timestamp: number;
}

async function main(): Promise<void> {
  if (!existsSync(dbPath)) {
    console.error('未找到 data/memory.db');
    process.exit(1);
  }
  const db = new DatabaseSync(dbPath);
  const rows = db
    .prepare(
      `SELECT session_id, query, answer, confidence, evidence_hash, timestamp
       FROM l0_memory ORDER BY timestamp ASC`,
    )
    .all() as L0Row[];
  db.close();

  console.log(`源 L0 记录：${rows.length} 条`);
  if (dryRun) {
    console.log('[dry-run] 不执行迁移');
    return;
  }

  if (!existsSync(backupPath)) {
    copyFileSync(dbPath, backupPath);
    console.log(`已备份: ${backupPath}`);
  }

  const store = new MemoryCoreStore(undefined, 15_000);
  const sessions = [...new Set(rows.map((r) => r.session_id))];
  if (reset) {
    for (const session of sessions) {
      await store.forget(session);
      console.log(`已清空 session: ${session}`);
    }
  }

  let ok = 0;
  const failed: Array<{ session_id: string; query: string; error: string }> = [];
  for (const row of rows) {
    try {
      await store.put({
        session_id: row.session_id,
        query: row.query,
        answer: row.answer,
        confidence: row.confidence,
        evidence_hash: row.evidence_hash,
        timestamp: row.timestamp,
      });
      ok += 1;
    } catch (err) {
      failed.push({ session_id: row.session_id, query: row.query.slice(0, 60), error: (err as Error).message });
    }
  }

  console.log(`迁移成功：${ok}/${rows.length}`);
  if (failed.length > 0) {
    console.log('失败明细：');
    for (const f of failed.slice(0, 20)) console.log(`  ${f.session_id} ${f.query} → ${f.error}`);
    process.exitCode = 1;
    return;
  }

  let totalRecalled = 0;
  for (const session of sessions) {
    const records = await store.recall(session, 10_000);
    totalRecalled += records.length;
    console.log(`校验 ${session}: 迁移 ${rows.filter((r) => r.session_id === session).length} → 召回 ${records.length}`);
  }
  if (totalRecalled !== rows.length) {
    console.error(`零丢失校验失败：源 ${rows.length}，召回 ${totalRecalled}`);
    process.exitCode = 1;
  } else {
    console.log('零丢失校验通过');
  }
}

await main();
