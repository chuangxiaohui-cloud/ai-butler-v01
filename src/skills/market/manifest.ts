/**
 * v1.0 S7：市场 Skill 包 manifest 校验（§8.2.3 安装校验）
 * 复用 install.ts 的 name/version/triggers 基础校验，强制显式声明 permissions
 * （可为空数组，缺声明即拒绝），steps/verify/deps 可选但必须是非空字符串数组。
 */

import { validateSkillManifest } from '../install.js';
import type { MarketSkillManifest, SkillPermission } from './types.js';

const PERMISSION_SET: ReadonlySet<string> = new Set(['none', 'filesystem', 'command', 'network', 'browser']);

export function validateMarketManifest(input: unknown): MarketSkillManifest {
  const base = validateSkillManifest(input);
  const m = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(m.permissions)) {
    throw new Error('Skill 必须显式声明 permissions（可为空数组，高风险权限需用户确认）');
  }
  const permissions: SkillPermission[] = [];
  for (const permission of m.permissions) {
    if (typeof permission !== 'string' || !PERMISSION_SET.has(permission)) {
      throw new Error(`非法权限声明：${String(permission)}`);
    }
    permissions.push(permission as SkillPermission);
  }
  const stringArray = (field: string): string[] | undefined => {
    if (m[field] === undefined) return undefined;
    if (!Array.isArray(m[field])) throw new Error(`Skill ${field} 必须是数组`);
    return (m[field] as unknown[]).map((value) => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Skill ${field} 只允许非空字符串`);
      }
      return value.trim();
    });
  };
  return {
    ...base,
    steps: stringArray('steps'),
    verify: stringArray('verify'),
    deps: stringArray('deps'),
    permissions,
  };
}
