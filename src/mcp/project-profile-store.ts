/** E403：项目 MCP 画像的本地证据缓存；文件名只由规范化工程根派生。 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateProjectMcpProfile,
  type ProjectMcpProfile,
  type ProjectProfileValidation,
} from './project-profile.js';
import { mergeProjectMcpProfiles } from './project-profile-merge.js';

const REPO_PROFILE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'project-profiles',
);

const PROJECT_ID_RE = /^project-[a-f0-9]{16}$/;

export interface ProjectProfileSaveResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

export type ProjectProfilePlanningResult = ProjectProfileValidation & {
  staleFields?: string[];
  reprobeRequired?: boolean;
};

export function deriveProjectId(projectRoot: string): string {
  const normalized = normalizeProjectRoot(projectRoot);
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `project-${digest}`;
}

export class ProjectProfileStore {
  constructor(private readonly root = REPO_PROFILE_ROOT) {}

  pathFor(projectId: string): string | null {
    return PROJECT_ID_RE.test(projectId) ? join(this.root, `${projectId}.json`) : null;
  }

  save(profile: ProjectMcpProfile): ProjectProfileSaveResult {
    const validation = validateProjectMcpProfile(profile);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    if (profile.projectId !== deriveProjectId(profile.projectRoot)) {
      return { ok: false, reason: 'projectId 与规范化 projectRoot 不匹配' };
    }
    const path = this.pathFor(profile.projectId);
    if (!path) return { ok: false, reason: 'projectId 格式非法' };
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
    try {
      mkdirSync(this.root, { recursive: true });
      writeFileSync(temporary, `${JSON.stringify(profile, null, 2)}\n`, 'utf-8');
      renameSync(temporary, path);
      return { ok: true, path };
    } catch (error) {
      rmSync(temporary, { force: true });
      return { ok: false, reason: `项目画像写入失败：${errorText(error)}` };
    }
  }

  mergeAndSave(profile: ProjectMcpProfile): ProjectProfileSaveResult {
    const existing = this.load(profile.projectId);
    if (!existing.ok) {
      if (existing.reason !== '项目画像不存在') return { ok: false, reason: existing.reason };
      return this.save(profile);
    }
    try {
      return this.save(mergeProjectMcpProfiles(existing.profile, profile));
    } catch (error) {
      return { ok: false, reason: errorText(error) };
    }
  }

  load(projectId: string): ProjectProfileValidation {
    const path = this.pathFor(projectId);
    if (!path) return { ok: false, reason: 'projectId 格式非法' };
    if (!existsSync(path)) return { ok: false, reason: '项目画像不存在' };
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return { ok: false, reason: '项目画像 JSON 损坏' };
    }
    const validation = validateProjectMcpProfile(raw);
    if (!validation.ok) return validation;
    if (validation.profile.projectId !== projectId) {
      return { ok: false, reason: '画像内容与文件 projectId 不匹配' };
    }
    if (deriveProjectId(validation.profile.projectRoot) !== projectId) {
      return { ok: false, reason: 'projectId 与规范化 projectRoot 不匹配' };
    }
    return validation;
  }

  loadForPlanning(projectId: string, minimumObservedAt: number): ProjectProfilePlanningResult {
    if (!Number.isFinite(minimumObservedAt) || minimumObservedAt < 0) {
      return { ok: false, reason: 'minimumObservedAt 必须是非负时间戳' };
    }
    const loaded = this.load(projectId);
    if (!loaded.ok) return loaded;
    const staleFields = Object.entries(loaded.profile.provenance)
      .filter(([, evidence]) => evidence.observedAt < minimumObservedAt)
      .map(([field]) => field);
    if (staleFields.length === 0) {
      return { ok: true, profile: loaded.profile, staleFields: [], reprobeRequired: false };
    }
    const stale = new Set(staleFields);
    const profile: ProjectMcpProfile = {
      ...loaded.profile,
      platform: stale.has('platform') ? null : loaded.profile.platform,
      chip: stale.has('chip') ? null : loaded.profile.chip,
      targets: stale.has('targets') ? [] : [...loaded.profile.targets],
      selectedTarget: stale.has('selectedTarget') || stale.has('targets') ? null : loaded.profile.selectedTarget,
      build: stale.has('build') ? null : loaded.profile.build,
      flash: stale.has('flash') ? null : loaded.profile.flash,
      serial: stale.has('serial') ? null : loaded.profile.serial,
      sdkRoot: stale.has('sdkRoot') ? null : loaded.profile.sdkRoot,
      template: stale.has('template') ? null : loaded.profile.template,
      capabilities: loaded.profile.capabilities.map((item) => item.evidence.observedAt < minimumObservedAt
        ? { ...item, build: null }
        : item),
      provenance: { ...loaded.profile.provenance },
    };
    return { ok: true, profile, staleFields, reprobeRequired: true };
  }
}

function normalizeProjectRoot(projectRoot: string): string {
  const normalized = resolve(projectRoot).replaceAll('\\', '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
