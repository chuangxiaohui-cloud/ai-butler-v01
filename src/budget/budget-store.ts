/**
 * E308：预算闭环存储（SQLite data/budget.db）
 * append-only 事件账本：allocate（拨款/设预算）与 spend（支出）事件，
 * 余额 = 拨款合计 - 支出合计（§2.1 老板资源分配 / §5 预算唯一权威）。
 * 老板「查预算」与秘书记账共用同一份账本；显式入账，不做隐式猜测回写。
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export type BudgetKind = 'allocate' | 'spend';

export interface BudgetEvent {
  id: number;
  scope: string;
  kind: BudgetKind;
  amount: number;
  note: string;
  createdAt: number;
}

export interface AddBudgetInput {
  scope: string;
  kind: BudgetKind;
  amount: number;
  note?: string;
  createdAt?: number;
}

export interface BudgetSummaryRow {
  scope: string;
  allocated: number;
  spent: number;
  balance: number;
}

/** 仓库 data/budget.db（import.meta.url 锚定，独立于 runner 沙箱 cwd） */
const REPO_BUDGET_DB = join(fileURLToPath(new URL('../../', import.meta.url)), 'data', 'budget.db');

export function budgetDbPath(): string {
  return process.env.BUDGET_DB_PATH ?? REPO_BUDGET_DB;
}

export class BudgetStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = budgetDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budget_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('allocate','spend')),
        amount REAL NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_budget_events_scope ON budget_events(scope, created_at);
    `);
  }

  /** 追加一条事件（拨款或支出）；返回落库后的完整事件 */
  add(input: AddBudgetInput): BudgetEvent {
    const createdAt = input.createdAt ?? Date.now();
    const result = this.db
      .prepare(
        'INSERT INTO budget_events (scope, kind, amount, note, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        input.scope,
        input.kind,
        input.amount,
        input.note ?? '',
        createdAt,
      );
    return {
      id: Number(result.lastInsertRowid),
      scope: input.scope,
      kind: input.kind,
      amount: input.amount,
      note: input.note ?? '',
      createdAt,
    };
  }

  /** 按 scope 汇总：拨款合计 / 支出合计 / 余额（余额可负，诚实展示） */
  summary(scope?: string): BudgetSummaryRow[] {
    if (scope !== undefined) {
      const row = this.summaryRow(scope);
      return row ? [row] : [];
    }
    const rows = this.db
      .prepare(
        `SELECT scope,
          COALESCE(SUM(CASE WHEN kind = 'allocate' THEN amount ELSE 0 END), 0) AS allocated,
          COALESCE(SUM(CASE WHEN kind = 'spend' THEN amount ELSE 0 END), 0) AS spent
         FROM budget_events GROUP BY scope ORDER BY scope`,
      )
      .all() as Array<{ scope: string; allocated: number; spent: number }>;
    return rows.map((r) => ({
      scope: r.scope,
      allocated: r.allocated,
      spent: r.spent,
      balance: r.allocated - r.spent,
    }));
  }

  /** 最近事件（时间倒序），供查询/审计展示 */
  recent(limit = 20): BudgetEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM budget_events ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<{
      id: number;
      scope: string;
      kind: string;
      amount: number;
      note: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      kind: r.kind as BudgetKind,
      amount: r.amount,
      note: r.note,
      createdAt: r.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }

  private summaryRow(scope: string): BudgetSummaryRow | null {
    const r = this.db
      .prepare(
        `SELECT
          COUNT(*) AS cnt,
          COALESCE(SUM(CASE WHEN kind = 'allocate' THEN amount ELSE 0 END), 0) AS allocated,
          COALESCE(SUM(CASE WHEN kind = 'spend' THEN amount ELSE 0 END), 0) AS spent
         FROM budget_events WHERE scope = ?`,
      )
      .get(scope) as { cnt: number; allocated: number; spent: number } | undefined;
    if (!r || r.cnt === 0) return null;
    return { scope, allocated: r.allocated, spent: r.spent, balance: r.allocated - r.spent };
  }
}
