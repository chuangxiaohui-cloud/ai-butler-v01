/**
 * Skill: quote-compare（vendor_db 本地报价库）
 * 报价对比执行层：查询本地供应商报价，返回对比与最低价。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

const SEED_QUOTES = [
  ['LCSC', 'STM32F103C8T6', 8.5, 10, 3, '现货'],
  ['Mouser', 'STM32F103C8T6', 12.6, 1, 7, '海外仓'],
  ['DigiKey', 'STM32F103C8T6', 13.2, 1, 9, '海外仓'],
  ['LCSC', 'ESP32-C3-MINI-1', 9.8, 5, 2, '现货'],
  ['Taobao 授权店', 'ESP32-C3-MINI-1', 11.5, 2, 1, '国内现货'],
] as const;

export function createQuoteCompareSkill(
  opts?: { dbPath?: string },
): ExecutableSkill & { close(): void } {
  const dbPath =
    opts?.dbPath ??
    process.env.QUOTES_DB_PATH ??
    join(process.cwd(), 'data', 'quotes.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT NOT NULL,
      part TEXT NOT NULL,
      unit_price REAL NOT NULL,
      moq INTEGER NOT NULL,
      lead_days INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS c FROM vendor_quotes').get() as { c: number };
  if (count.c === 0) {
    const insert = db.prepare(
      `INSERT INTO vendor_quotes (vendor, part, unit_price, moq, lead_days, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const row of SEED_QUOTES) insert.run(...row);
  }

  const skill: ExecutableSkill = {
    name: 'quote-compare',
    version: '0.1.0',
    triggers: ['报价', '对比', '供应商', '价格', 'quote'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const mode = typeof input.params?.mode === 'string' ? input.params.mode : '';
      if (mode !== 'compare_vendor_quotes' && !/对比|报价/.test(input.query)) {
        return {
          result: { error: 'unknown_mode' },
          confidence: 0.2,
          followUpAction: '请提供需要对比报价的型号。',
        };
      }
      const part = input.query.match(/[A-Z][A-Z0-9-]{3,}/)?.[0] ?? null;
      if (!part) {
        return {
          result: { error: 'missing_part' },
          confidence: 0.3,
          followUpAction: '请补充具体型号，例如“STM32F103C8T6”。',
        };
      }
      const rows = db
        .prepare(
          'SELECT vendor, part, unit_price, moq, lead_days, note FROM vendor_quotes WHERE part = ? ORDER BY unit_price ASC',
        )
        .all(part);
      if (rows.length === 0) {
        return {
          result: { part, quotes: [], lowest: null, note: '报价库暂无该型号数据' },
          confidence: 0.5,
          followUpAction: '可以把供应商报价贴给我，我帮你整理成对比表。',
        };
      }
      return {
        result: {
          part,
          quotes: rows,
          lowest: rows[0],
          count: rows.length,
        },
        confidence: 0.85,
        followUpAction: '需要按 MOQ/交期再筛选，或导出成对比表吗？',
      };
    },
  };
  return Object.assign(skill, { close: () => db.close() });
}
