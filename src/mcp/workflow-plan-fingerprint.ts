/**
 * E412：领域工作流计划指纹。对节点契约做稳定序列化后取 SHA-256，供批准恢复校验。
 */

import { createHash } from 'node:crypto';

import type { DomainWorkflowNode, DomainWorkflowPlan } from './domain-workflow.js';

/** 只纳入影响执行语义的字段；title/acceptance 变化不改变指纹，避免文案微调阻断恢复 */
function canonicalizeNode(node: DomainWorkflowNode): unknown {
  return {
    id: node.id,
    kind: node.kind,
    agentId: node.agentId,
    toolName: node.toolName,
    args: sortJson(node.args),
    targetFiles: [...node.targetFiles].sort(),
    inputRefs: [...node.inputRefs],
    outputKind: node.outputKind,
    risk: node.risk,
    onFailure: node.onFailure,
    ...(node.parallelGroup ? { parallelGroup: node.parallelGroup } : {}),
    ...(node.dependsOn && node.dependsOn.length > 0
      ? { dependsOn: [...node.dependsOn].sort() }
      : {}),
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortJson(record[key]);
    }
    return out;
  }
  return value;
}

export function canonicalizeDomainWorkflowPlan(plan: DomainWorkflowPlan): string {
  const body = {
    projectId: plan.projectId,
    completedRevisionCycles: plan.completedRevisionCycles,
    nodes: plan.nodes.map(canonicalizeNode),
  };
  return JSON.stringify(body);
}

export function fingerprintDomainWorkflowPlan(plan: DomainWorkflowPlan): string {
  return createHash('sha256').update(canonicalizeDomainWorkflowPlan(plan), 'utf8').digest('hex');
}

export function shortPlanFingerprint(fingerprint: string, len = 12): string {
  return fingerprint.slice(0, Math.max(8, Math.min(len, fingerprint.length)));
}
