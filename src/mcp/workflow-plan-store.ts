/**
 * E412：领域工作流计划持久化。挂起时落盘指纹；批准恢复须指纹一致，漂移则拒绝。
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { DomainWorkflowPlan } from './domain-workflow.js';
import { fingerprintDomainWorkflowPlan } from './workflow-plan-fingerprint.js';

export type WorkflowPlanRecordStatus =
  | 'pending_approval'
  | 'active'
  | 'done'
  | 'cancelled'
  | 'failed';

export interface WorkflowPlanRecord {
  id: string;
  fingerprint: string;
  query: string;
  projectId: string;
  status: WorkflowPlanRecordStatus;
  plan: DomainWorkflowPlan;
  createdAt: number;
  updatedAt: number;
}

export type WorkflowPlanResumeResult =
  | { ok: true; record: WorkflowPlanRecord }
  | { ok: false; reason: 'not_found' | 'fingerprint_mismatch' | 'not_resumable'; message: string };

const RECORD_LIMIT = 200;

export class WorkflowPlanStore {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), 'data', 'mcp-workflow-plans.jsonl')) {
    this.filePath = filePath;
  }

  savePending(input: {
    query: string;
    plan: DomainWorkflowPlan;
    id?: string;
    now?: number;
  }): WorkflowPlanRecord {
    const now = input.now ?? Date.now();
    const fingerprint = fingerprintDomainWorkflowPlan(input.plan);
    const existing = this.findByFingerprint(fingerprint);
    if (existing && existing.status === 'pending_approval') {
      existing.query = input.query;
      existing.plan = input.plan;
      existing.updatedAt = now;
      this.writeAll(this.readAll().map((item) => (item.id === existing.id ? existing : item)));
      return existing;
    }
    const record: WorkflowPlanRecord = {
      id: input.id ?? randomUUID(),
      fingerprint,
      query: input.query,
      projectId: input.plan.projectId,
      status: 'pending_approval',
      plan: input.plan,
      createdAt: now,
      updatedAt: now,
    };
    const all = this.readAll();
    all.push(record);
    this.writeAll(all);
    return record;
  }

  findByFingerprint(fingerprint: string): WorkflowPlanRecord | null {
    const matches = this.readAll()
      .filter((item) => item.fingerprint === fingerprint)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return matches[0] ?? null;
  }

  findResumableByQuery(query: string): WorkflowPlanRecord | null {
    const matches = this.readAll()
      .filter((item) => item.query === query && item.status === 'pending_approval')
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return matches[0] ?? null;
  }

  /**
   * 批准恢复：必须用当前重算计划的指纹与挂起记录比对。
   * 漂移（工程画像/节点变化）→ 拒绝，强制重新挂起批准。
   */
  verifyForResume(
    fingerprint: string,
    currentPlan: DomainWorkflowPlan,
  ): WorkflowPlanResumeResult {
    const record = this.findByFingerprint(fingerprint);
    if (!record) {
      return {
        ok: false,
        reason: 'not_found',
        message: '未找到对应工作流计划指纹；请重新生成计划并再次批准。',
      };
    }
    if (record.status !== 'pending_approval' && record.status !== 'active') {
      return {
        ok: false,
        reason: 'not_resumable',
        message: `计划状态为 ${record.status}，不能恢复执行。`,
      };
    }
    const current = fingerprintDomainWorkflowPlan(currentPlan);
    if (current !== fingerprint || current !== record.fingerprint) {
      return {
        ok: false,
        reason: 'fingerprint_mismatch',
        message: '工作流计划指纹已漂移（节点/工具/参数变化）；拒绝静默恢复，请重新批准。',
      };
    }
    return { ok: true, record };
  }

  markActive(fingerprint: string, now = Date.now()): boolean {
    return this.mutate(fingerprint, (record) => {
      record.status = 'active';
      record.updatedAt = now;
    });
  }

  markDone(fingerprint: string, now = Date.now()): boolean {
    return this.mutate(fingerprint, (record) => {
      record.status = 'done';
      record.updatedAt = now;
    });
  }

  markCancelled(fingerprint: string, now = Date.now()): boolean {
    return this.mutate(fingerprint, (record) => {
      record.status = 'cancelled';
      record.updatedAt = now;
    });
  }

  markFailed(fingerprint: string, now = Date.now()): boolean {
    return this.mutate(fingerprint, (record) => {
      record.status = 'failed';
      record.updatedAt = now;
    });
  }

  list(): WorkflowPlanRecord[] {
    return this.readAll();
  }

  private mutate(fingerprint: string, fn: (record: WorkflowPlanRecord) => void): boolean {
    const all = this.readAll();
    const target = all
      .filter((item) => item.fingerprint === fingerprint)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!target) return false;
    fn(target);
    this.writeAll(all);
    return true;
  }

  private readAll(): WorkflowPlanRecord[] {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const out: WorkflowPlanRecord[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          out.push(JSON.parse(trimmed) as WorkflowPlanRecord);
        } catch {
          // skip
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  private writeAll(records: WorkflowPlanRecord[]): void {
    const trimmed = records.slice(-RECORD_LIMIT);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${trimmed.map((item) => JSON.stringify(item)).join('\n')}${trimmed.length ? '\n' : ''}`, 'utf-8');
    renameSync(tmp, this.filePath);
  }
}
