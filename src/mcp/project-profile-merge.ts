/** E407：项目画像字段级证据合并；不以写入顺序覆盖更高可信来源。 */

import {
  shouldReplaceProfileValue,
  validateProjectMcpProfile,
  type ProjectMcpProfile,
  type ProjectPlatformCapability,
  type ProjectProfileEvidence,
} from './project-profile.js';

const MERGE_FIELDS = ['platform', 'chip', 'targets', 'selectedTarget', 'build', 'flash', 'serial', 'sdkRoot', 'template'] as const;

export function mergeProjectMcpProfiles(current: ProjectMcpProfile, incoming: ProjectMcpProfile): ProjectMcpProfile {
  const currentValidation = validateProjectMcpProfile(current);
  const incomingValidation = validateProjectMcpProfile(incoming);
  if (!currentValidation.ok) throw new TypeError(`现有画像无效：${currentValidation.reason}`);
  if (!incomingValidation.ok) throw new TypeError(`新画像无效：${incomingValidation.reason}`);
  if (current.projectId !== incoming.projectId || current.projectRoot !== incoming.projectRoot) {
    throw new TypeError('只能合并同一 projectId/projectRoot 的画像');
  }
  const merged: ProjectMcpProfile = {
    ...current,
    provenance: { ...current.provenance },
    capabilities: mergeCapabilities(current.capabilities, incoming.capabilities),
    verifiedAt: Math.max(current.verifiedAt ?? 0, incoming.verifiedAt ?? 0) || null,
  };
  for (const field of MERGE_FIELDS) {
    const nextEvidence = incoming.provenance[field];
    if (!nextEvidence) continue;
    const currentEvidence = merged.provenance[field];
    if (!currentEvidence || evidenceWins(currentEvidence, nextEvidence)) {
      assignField(merged, field, incoming[field]);
      merged.provenance[field] = nextEvidence;
    }
  }
  const verifiedTargets = [
    ...(isVerifiedTargetEvidence(current.provenance.targets) ? current.targets : []),
    ...(isVerifiedTargetEvidence(incoming.provenance.targets) ? incoming.targets : []),
  ];
  if (verifiedTargets.length > 0) merged.targets = [...new Set(verifiedTargets)];
  if (merged.selectedTarget && !merged.targets.includes(merged.selectedTarget)) merged.selectedTarget = null;
  const validation = validateProjectMcpProfile(merged);
  if (!validation.ok) throw new TypeError(`合并画像无效：${validation.reason}`);
  return validation.profile;
}

function isVerifiedTargetEvidence(evidence: ProjectProfileEvidence | undefined): boolean {
  return evidence?.source === 'tool_probe'
    || evidence?.source === 'project_file'
    || evidence?.source === 'user_confirmed';
}

function evidenceWins(current: ProjectProfileEvidence, incoming: ProjectProfileEvidence): boolean {
  return shouldReplaceProfileValue(current.source, incoming.source)
    || (current.source === incoming.source && incoming.observedAt > current.observedAt);
}

function mergeCapabilities(current: ProjectPlatformCapability[], incoming: ProjectPlatformCapability[]): ProjectPlatformCapability[] {
  const byAgent = new Map(current.map((item) => [item.agentId, item]));
  for (const item of incoming) {
    const previous = byAgent.get(item.agentId);
    if (!previous || evidenceWins(previous.evidence, item.evidence)) byAgent.set(item.agentId, item);
  }
  return [...byAgent.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));
}

function assignField<K extends typeof MERGE_FIELDS[number]>(profile: ProjectMcpProfile, field: K, value: ProjectMcpProfile[K]): void {
  (profile[field] as ProjectMcpProfile[K]) = value;
}
