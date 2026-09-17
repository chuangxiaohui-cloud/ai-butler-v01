import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { DomainWorkflowPlan } from './domain-workflow.js';
import {
  fingerprintDomainWorkflowPlan,
  shortPlanFingerprint,
} from './workflow-plan-fingerprint.js';
import { WorkflowPlanStore } from './workflow-plan-store.js';

function samplePlan(overrides: Partial<DomainWorkflowPlan> = {}): DomainWorkflowPlan {
  return {
    id: 'mcp-entry-demo',
    projectId: 'proj-demo',
    completedRevisionCycles: 0,
    nodes: [{
      id: 'build',
      kind: 'build',
      title: '构建 Keil 工程',
      inputRefs: ['project_profile'],
      outputKind: 'build_diagnostics',
      agentId: 'keil',
      toolName: 'keil.BuildProject',
      args: { projectPath: 'projects/a.uvprojx', target: 'Debug' },
      targetFiles: ['projects'],
      risk: 'build',
      acceptance: 'ok',
      onFailure: 'revise',
    }],
    ...overrides,
  };
}

test('E412: 相同计划指纹稳定，args 变化则漂移', () => {
  const a = fingerprintDomainWorkflowPlan(samplePlan());
  const b = fingerprintDomainWorkflowPlan(samplePlan());
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.equal(shortPlanFingerprint(a).length, 12);

  const changed = samplePlan();
  changed.nodes[0]!.args = { projectPath: 'projects/a.uvprojx', target: 'Release' };
  assert.notEqual(fingerprintDomainWorkflowPlan(changed), a);

  // title 不参与指纹
  const titled = samplePlan();
  titled.nodes[0]!.title = '别的标题';
  assert.equal(fingerprintDomainWorkflowPlan(titled), a);
});

test('E412: 挂起落盘后可按指纹恢复；漂移拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-plan-'));
  try {
    const store = new WorkflowPlanStore(join(dir, 'plans.jsonl'));
    const plan = samplePlan();
    const saved = store.savePending({ query: '请编译 Keil 工程 projects/a.uvprojx', plan });
    assert.equal(saved.status, 'pending_approval');
    assert.equal(saved.fingerprint, fingerprintDomainWorkflowPlan(plan));

    const ok = store.verifyForResume(saved.fingerprint, plan);
    assert.equal(ok.ok, true);

    const drifted = samplePlan({
      nodes: [{
        id: 'build',
        kind: 'project_inventory',
        title: '构建 Keil 工程',
        inputRefs: ['project_profile'],
        outputKind: 'project_profile',
        agentId: 'keil',
        toolName: 'keil.InspectProjectProfile',
        args: { projectPath: 'projects/a.uvprojx' },
        targetFiles: ['projects'],
        risk: 'read_only',
        acceptance: 'ok',
        onFailure: 'handoff',
      }],
    });
    const bad = store.verifyForResume(saved.fingerprint, drifted);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, 'fingerprint_mismatch');

    assert.equal(store.markCancelled(saved.fingerprint), true);
    const cancelled = store.verifyForResume(saved.fingerprint, plan);
    assert.equal(cancelled.ok, false);
    if (!cancelled.ok) assert.equal(cancelled.reason, 'not_resumable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E412: 同指纹重复挂起幂等更新 query', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-plan-idem-'));
  try {
    const store = new WorkflowPlanStore(join(dir, 'plans.jsonl'));
    const plan = samplePlan();
    const first = store.savePending({ query: '编译一次', plan });
    const second = store.savePending({ query: '再编译一次', plan });
    assert.equal(first.id, second.id);
    assert.equal(second.query, '再编译一次');
    assert.equal(store.list().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
