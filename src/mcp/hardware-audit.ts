/**
 * E411：硬件门禁审计（append-only）。记录允许/拒绝证据，不执行硬件动作。
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { appendJsonl, closeJsonl } from '../log/jsonl.js';
import type { HardwareGateDecision } from './hardware-capability.js';

export interface HardwareAuditRecord {
  ts: string;
  allowed: boolean;
  action: HardwareGateDecision['action'];
  reason?: HardwareGateDecision['reason'];
  message: string;
  deviceId: string | null;
  port: string | null;
  firmwareSha256: string | null;
  timeoutMs: number;
}

export class HardwareAuditStore {
  private readonly filePath: string;
  private readonly records: HardwareAuditRecord[] = [];

  constructor(filePath = join(process.cwd(), 'data', 'hardware-audit.jsonl')) {
    this.filePath = filePath;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          this.records.push(JSON.parse(trimmed) as HardwareAuditRecord);
        } catch {
          // skip
        }
      }
    } catch {
      // empty
    }
  }

  append(decision: HardwareGateDecision): HardwareAuditRecord {
    const record: HardwareAuditRecord = {
      ts: new Date().toISOString(),
      allowed: decision.allowed,
      action: decision.action,
      reason: decision.reason,
      message: decision.message,
      deviceId: decision.audit.deviceId,
      port: decision.audit.port,
      firmwareSha256: decision.audit.firmwareSha256,
      timeoutMs: decision.timeoutMs,
    };
    this.records.push(record);
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendJsonl(this.filePath, JSON.stringify(record));
    return record;
  }

  list(): HardwareAuditRecord[] {
    return [...this.records];
  }

  close(): void {
    closeJsonl(this.filePath);
  }
}
