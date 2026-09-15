/**
 * E401：项目 MCP 画像是只读盘点形成的证据缓存，不是模型可自由补全的命令清单。
 */

import { isJsonSerializable } from './safety.js';

export const PROJECT_PROFILE_SCHEMA_VERSION = 1 as const;

export const PROJECT_PROFILE_SOURCES = [
  'model_candidate',
  'cache',
  'tool_probe',
  'project_file',
  'user_confirmed',
] as const;

export type ProjectProfileSource = (typeof PROJECT_PROFILE_SOURCES)[number];

export interface ProjectToolRef {
  agentId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ProjectProfileEvidence {
  source: ProjectProfileSource;
  evidenceRef: string | null;
  observedAt: number;
}

export interface ProjectPlatformCapability {
  agentId: string;
  platform: string;
  build: ProjectToolRef | null;
  evidence: ProjectProfileEvidence;
}

export interface ProjectMcpProfile {
  schemaVersion: typeof PROJECT_PROFILE_SCHEMA_VERSION;
  projectId: string;
  projectRoot: string;
  platform: string | null;
  chip: string | null;
  targets: string[];
  selectedTarget: string | null;
  capabilities: ProjectPlatformCapability[];
  build: ProjectToolRef | null;
  flash: ProjectToolRef | null;
  serial: { port: string | null; baud: number | null } | null;
  sdkRoot: string | null;
  template: string | null;
  provenance: Record<string, ProjectProfileEvidence>;
  verifiedAt: number | null;
}

export type ProjectProfileValidation =
  | { ok: true; profile: ProjectMcpProfile }
  | { ok: false; reason: string };

const ROOT_KEYS = new Set([
  'schemaVersion',
  'projectId',
  'projectRoot',
  'platform',
  'chip',
  'targets',
  'selectedTarget',
  'capabilities',
  'build',
  'flash',
  'serial',
  'sdkRoot',
  'template',
  'provenance',
  'verifiedAt',
]);

const SOURCE_PRIORITY: Record<ProjectProfileSource, number> = {
  model_candidate: 0,
  cache: 1,
  tool_probe: 2,
  project_file: 3,
  user_confirmed: 4,
};

export function shouldReplaceProfileValue(
  currentSource: ProjectProfileSource,
  nextSource: ProjectProfileSource,
): boolean {
  return SOURCE_PRIORITY[nextSource] > SOURCE_PRIORITY[currentSource];
}

export function validateProjectMcpProfile(value: unknown): ProjectProfileValidation {
  if (!isRecord(value)) return invalid('profile 必须是对象');

  const unexpectedKey = Object.keys(value).find((key) => !ROOT_KEYS.has(key));
  if (unexpectedKey) return invalid(`不支持字段 ${unexpectedKey}；禁止保存裸命令或未登记扩展字段`);
  if (value.schemaVersion !== PROJECT_PROFILE_SCHEMA_VERSION) return invalid('schemaVersion 必须为 1');
  if (!isNonEmptyString(value.projectId) || !isNonEmptyString(value.projectRoot)) {
    return invalid('projectId 与 projectRoot 必须为非空字符串');
  }
  for (const key of ['platform', 'chip', 'sdkRoot', 'template'] as const) {
    if (value[key] !== null && typeof value[key] !== 'string') return invalid(`${key} 必须为字符串或 null`);
  }
  if (!Array.isArray(value.targets) || value.targets.some((target) => !isNonEmptyString(target))) {
    return invalid('targets 必须是非空字符串数组');
  }
  if (new Set(value.targets).size !== value.targets.length) return invalid('targets 不允许重复');
  if (value.selectedTarget !== null && !isNonEmptyString(value.selectedTarget)) {
    return invalid('selectedTarget 必须为非空字符串或 null');
  }
  if (typeof value.selectedTarget === 'string' && !value.targets.includes(value.selectedTarget)) {
    return invalid('selectedTarget 必须存在于 targets');
  }
  if (!Array.isArray(value.capabilities) || value.capabilities.some((item) => !isCapability(item))) {
    return invalid('capabilities 必须是平台能力数组');
  }
  const capabilityIds = value.capabilities.map((item) => item.agentId);
  if (new Set(capabilityIds).size !== capabilityIds.length) return invalid('capabilities.agentId 不允许重复');
  for (const key of ['build', 'flash'] as const) {
    if (value[key] !== null && !isToolRef(value[key])) return invalid(`${key} 必须为结构化工具引用或 null`);
  }
  if (value.serial !== null && !isSerial(value.serial)) return invalid('serial 必须包含 port/baud 或为 null');
  if (!isRecord(value.provenance)) return invalid('provenance 必须是对象');
  for (const [key, evidence] of Object.entries(value.provenance)) {
    if (!isEvidence(evidence)) return invalid(`provenance.${key} 不是有效证据`);
  }
  for (const key of ['build', 'flash'] as const) {
    if (value[key] === null) continue;
    const evidence = value.provenance[key];
    if (!isEvidence(evidence)) return invalid(`${key} 缺少来源证据`);
    if (evidence.source === 'model_candidate') return invalid(`model_candidate 不能授权 ${key}`);
  }
  if (value.verifiedAt !== null && !isTimestamp(value.verifiedAt)) {
    return invalid('verifiedAt 必须为非负时间戳或 null');
  }

  return { ok: true, profile: value as unknown as ProjectMcpProfile };
}

function isCapability(value: unknown): value is ProjectPlatformCapability {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 4 || !keys.every((key) => key === 'agentId' || key === 'platform' || key === 'build' || key === 'evidence')) return false;
  if (!isNonEmptyString(value.agentId) || !isNonEmptyString(value.platform) || !isEvidence(value.evidence)) return false;
  if (value.build !== null && !isToolRef(value.build)) return false;
  return value.build === null || value.evidence.source !== 'model_candidate';
}

function isToolRef(value: unknown): value is ProjectToolRef {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 3
    && keys.every((key) => key === 'agentId' || key === 'toolName' || key === 'args')
    && isNonEmptyString(value.agentId)
    && isNonEmptyString(value.toolName)
    && isRecord(value.args)
    && isJsonSerializable(value.args);
}

function isSerial(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2
    && keys.every((key) => key === 'port' || key === 'baud')
    && (value.port === null || typeof value.port === 'string')
    && (value.baud === null || (Number.isInteger(value.baud) && Number(value.baud) > 0));
}

function isEvidence(value: unknown): value is ProjectProfileEvidence {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 3
    && keys.every((key) => key === 'source' || key === 'evidenceRef' || key === 'observedAt')
    && PROJECT_PROFILE_SOURCES.includes(value.source as ProjectProfileSource)
    && (value.evidenceRef === null || typeof value.evidenceRef === 'string')
    && isTimestamp(value.observedAt);
}

function isTimestamp(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(reason: string): ProjectProfileValidation {
  return { ok: false, reason };
}
