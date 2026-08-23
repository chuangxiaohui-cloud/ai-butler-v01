/**
 * v1.0 S7：市场 Skill 安装器（§8.2.3 远程安装）
 * 流程：拉取远程包（http/https + 大小上限）→ 扩展 manifest 校验 → 与市场条目
 * name/version 一致性 → 高风险权限逐项 confirm（默认拒绝，§8.2.3 安全边界 / §10 联动）
 * → SHA-256 checksum → 原子落盘 data/market-skills/<name>/manifest.json → 记录 JSONL。
 * 卸载 = 标记 disabled（保留安装记录与文件，不静默删除，复用 §8.2.2 冷存语义）。
 * 真实 handler 可执行能力接入需过 §10 文件沙箱与命令白名单，骨架阶段不落盘执行源码。
 */

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateMarketManifest } from './manifest.js';
import { MarketStore } from './store.js';
import { HIGH_RISK_PERMISSIONS, type MarketInstallRecord, type MarketSkillEntry, type SkillPermission } from './types.js';

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text: string }>;

/** 权限确认回调：返回 true 表示用户同意该权限；默认拒绝 */
export type PermissionConfirmer = (permission: SkillPermission) => boolean | Promise<boolean>;

export const DEFAULT_PACKAGE_MAX_BYTES = 64 * 1024;

export interface MarketInstallerDeps {
  store?: MarketStore;
  fetchFn?: FetchLike;
  confirm?: PermissionConfirmer;
  /** 安装目录（测试注入；默认 data/market-skills） */
  installRoot?: string;
  maxBytes?: number;
}

export interface InstallOutcome {
  ok: boolean;
  record?: MarketInstallRecord;
  error?: string;
  /** 未获用户确认的高风险权限（门禁拒绝时列出） */
  deniedPermissions?: SkillPermission[];
}

export class MarketInstaller {
  private readonly store: MarketStore;
  private readonly fetchFn: FetchLike;
  private readonly confirm: PermissionConfirmer;
  private readonly installRoot: string;
  private readonly maxBytes: number;

  constructor(deps: MarketInstallerDeps = {}) {
    this.store = deps.store ?? new MarketStore();
    this.fetchFn = deps.fetchFn ?? defaultFetch();
    this.confirm = deps.confirm ?? (() => false);
    this.installRoot = deps.installRoot ?? join(process.cwd(), 'data', 'market-skills');
    this.maxBytes = deps.maxBytes ?? DEFAULT_PACKAGE_MAX_BYTES;
  }

  async install(entry: MarketSkillEntry): Promise<InstallOutcome> {
    let text: string;
    try {
      text = await this.fetchPackage(entry.sourceUrl);
    } catch (err) {
      return { ok: false, error: `拉取 Skill 包失败：${err instanceof Error ? err.message : String(err)}` };
    }
    let manifest;
    try {
      manifest = validateMarketManifest(JSON.parse(text));
    } catch (err) {
      return { ok: false, error: `Skill manifest 校验失败：${err instanceof Error ? err.message : String(err)}` };
    }
    // 权限范围一致性：包声明的权限不得超出市场条目声明（索引是策展方，包不得自提权限）
    const unknownPermission = manifest.permissions.find((permission) => !entry.permissions.includes(permission));
    if (manifest.name !== entry.name || manifest.version !== entry.version || unknownPermission !== undefined) {
      return { ok: false, error: '包 manifest 与市场条目不一致（name/version/权限必须匹配）' };
    }
    const risky = manifest.permissions.filter((permission) => HIGH_RISK_PERMISSIONS.has(permission));
    const denied: SkillPermission[] = [];
    for (const permission of risky) {
      let accepted = false;
      try {
        accepted = await this.confirm(permission);
      } catch {
        accepted = false;
      }
      if (!accepted) denied.push(permission);
    }
    if (denied.length > 0) {
      return { ok: false, error: '高风险权限未获用户确认，安装中止', deniedPermissions: denied };
    }
    try {
      const checksum = sha256(text);
      const skillDir = join(this.installRoot, manifest.name);
      mkdirSync(skillDir, { recursive: true });
      const target = join(skillDir, 'manifest.json');
      writeFileSync(`${target}.tmp`, text, 'utf-8');
      renameSync(`${target}.tmp`, target);
      const record: MarketInstallRecord = {
        ts: new Date().toISOString(),
        name: manifest.name,
        version: manifest.version,
        sourceUrl: entry.sourceUrl,
        checksum,
        permissions: manifest.permissions,
        status: 'installed',
      };
      this.store.record(record);
      return { ok: true, record };
    } catch (err) {
      return { ok: false, error: `安装落盘失败：${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** 卸载：标记 disabled，保留安装记录与文件（§8.2.2 冷存不删、§8.2.3 不静默删除） */
  async uninstall(name: string): Promise<{ ok: boolean; error?: string }> {
    const latest = this.store.latest(name);
    if (!latest || latest.status !== 'installed') {
      return { ok: false, error: '未找到已安装的市场 Skill 或已卸载' };
    }
    this.store.markDisabled(name);
    return { ok: true };
  }

  private async fetchPackage(url: string): Promise<string> {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Skill 包 URL 必须是 http/https');
    }
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (Buffer.byteLength(response.text, 'utf-8') > this.maxBytes) {
      throw new Error(`Skill 包超过大小上限 ${this.maxBytes} 字节`);
    }
    return response.text;
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

function defaultFetch(): FetchLike {
  return async (url) => {
    const response = await fetch(url);
    return { ok: response.ok, status: response.status, text: await response.text() };
  };
}
