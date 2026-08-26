/**
 * v1.0 S7：市场 Skill 包 manifest 校验（§8.2.3 安装校验）
 * 复用 install.ts 的 name/version/triggers 基础校验，强制显式声明 permissions
 * （可为空数组，缺声明即拒绝），steps/verify/deps 可选但必须是非空字符串数组。
 */

import { validateSkillManifest } from '../install.js';
import { BROWSER_ACTION_SET, type BrowserActionName } from '../../security/browser-actions.js';
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
  // E252：domains（browser 权限必带）+ actions（动作子集收窄，§8.2.3/§4.1.5）
  let domains: string[] | undefined;
  if (m.domains !== undefined) {
    if (!Array.isArray(m.domains) || m.domains.length === 0) {
      throw new Error('Skill domains 必须是非空字符串数组');
    }
    domains = m.domains.map((value) => {
      if (typeof value !== 'string') throw new Error('Skill domains 只允许字符串');
      const domain = value.trim().toLowerCase();
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
        throw new Error(`非法域名：${value}（仅允许 www.example.com 形式，子域匹配自动覆盖）`);
      }
      return domain;
    });
  }
  let actions: BrowserActionName[] | undefined;
  if (m.actions !== undefined) {
    if (!Array.isArray(m.actions) || m.actions.length === 0) {
      throw new Error('Skill actions 必须是非空字符串数组');
    }
    actions = m.actions.map((value) => {
      if (typeof value !== 'string' || !BROWSER_ACTION_SET.has(value)) {
        throw new Error(`非法动作声明：${String(value)}（白名单：goto/click/type/select/scroll/hover/wait/download）`);
      }
      return value as BrowserActionName;
    });
  }
  const hasBrowser = permissions.includes('browser');
  const hasCommand = permissions.includes('command');
  if (hasBrowser && hasCommand) {
    throw new Error('browser 与 command 权限互斥（浏览器操作 Skill 不执行命令步骤）');
  }
  if (hasBrowser && (domains === undefined || domains.length === 0)) {
    throw new Error('browser 权限必须声明非空 domains 域名白名单（§8.2.3，未声明拒绝执行）');
  }
  if (hasCommand && domains !== undefined) {
    throw new Error('command 权限禁止携带 domains（与浏览器操作互斥）');
  }
  if (actions !== undefined && !hasBrowser) {
    throw new Error('actions 仅在 browser 权限 Skill 中允许（动作子集收窄，§4.1.5）');
  }
  if (m.input !== undefined && m.input !== 'query') {
    throw new Error(`非法 input 声明：${String(m.input)}（仅支持 'query'）`);
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
    domains,
    actions,
    input: m.input === 'query' ? 'query' : undefined,
  };
}
