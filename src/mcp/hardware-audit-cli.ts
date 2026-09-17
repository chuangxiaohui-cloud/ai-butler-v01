/**
 * E427：硬件门禁审计只读 CLI（data/hardware-audit.jsonl）。
 * 用法：npm run hardware:audit -- [--limit N] [--action flash|serial_read] [--allowed true|false]
 */

import { join } from 'node:path';

import { HardwareAuditStore, type HardwareAuditRecord } from './hardware-audit.js';

export interface HardwareAuditCliDeps {
  cwd?: string;
  auditPath?: string;
  store?: HardwareAuditStore;
}

export interface HardwareAuditCliOutcome {
  exit: number;
  output: unknown;
}

const USAGE =
  '用法：npm run hardware:audit -- [--limit N] [--action flash|serial_read] [--allowed true|false]';

function argValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  if (inline !== undefined && inline !== '') return inline;
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function resolveStore(deps: HardwareAuditCliDeps): HardwareAuditStore {
  if (deps.store) return deps.store;
  const cwd = deps.cwd ?? process.cwd();
  const path = deps.auditPath ?? join(cwd, 'data', 'hardware-audit.jsonl');
  return new HardwareAuditStore(path);
}

export function runHardwareAuditCli(
  args: string[],
  deps: HardwareAuditCliDeps = {},
): HardwareAuditCliOutcome {
  const limitRaw = argValue(args, 'limit');
  const limit = limitRaw === undefined ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1) {
    return {
      exit: 1,
      output: { ok: false, error: `--limit 需为正整数（当前 ${limitRaw}）`, hint: USAGE },
    };
  }

  const actionRaw = argValue(args, 'action');
  if (actionRaw !== undefined && actionRaw !== 'flash' && actionRaw !== 'serial_read') {
    return {
      exit: 1,
      output: { ok: false, error: `--action 仅支持 flash|serial_read（当前 ${actionRaw}）`, hint: USAGE },
    };
  }

  const allowedRaw = argValue(args, 'allowed');
  let allowedFilter: boolean | undefined;
  if (allowedRaw !== undefined) {
    if (allowedRaw === 'true') allowedFilter = true;
    else if (allowedRaw === 'false') allowedFilter = false;
    else {
      return {
        exit: 1,
        output: { ok: false, error: `--allowed 仅支持 true|false（当前 ${allowedRaw}）`, hint: USAGE },
      };
    }
  }

  const store = resolveStore(deps);
  try {
    let events: HardwareAuditRecord[] = store.list();
    if (actionRaw) {
      events = events.filter((e) => e.action === actionRaw);
    }
    if (allowedFilter !== undefined) {
      events = events.filter((e) => e.allowed === allowedFilter);
    }
    const sliced = events.slice(-limit).reverse();
    return {
      exit: 0,
      output: {
        ok: true,
        total: events.length,
        shown: sliced.length,
        events: sliced,
        hint: events.length === 0 ? '尚无硬件门禁审计记录。' : undefined,
      },
    };
  } finally {
    store.close();
  }
}
