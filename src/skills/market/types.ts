/**
 * v1.0 S7：Skill 市场远程化类型（§8.2.3）
 * 官方市场索引 / 远程包校验 / 权限声明门禁 / 安装记录（可卸载、可追溯）。
 */

import type { SkillManifest } from '../install.js';
import type { BrowserActionName } from '../../security/browser-actions.js';

/** 权限声明（§8.2.3 安全边界：高风险权限逐项征求用户确认，与 §10 联动） */
export type SkillPermission = 'none' | 'filesystem' | 'command' | 'network' | 'browser';

/** 高风险权限：安装时逐项征求用户确认，默认拒绝 */
export const HIGH_RISK_PERMISSIONS: ReadonlySet<SkillPermission> = new Set([
  'filesystem',
  'command',
  'network',
  'browser',
]);

/** 官方市场索引条目（来源：GitHub/Gitee 仓库包 / 官方 Skill 市场索引） */
export interface MarketSkillEntry {
  name: string;
  version: string;
  description?: string;
  /** 远程包地址（http/https） */
  sourceUrl: string;
  permissions: SkillPermission[];
}

/** 扩展 manifest：在 install.ts 基础校验上补充执行步骤/验证规则/依赖/权限声明 */
export interface MarketSkillManifest extends SkillManifest {
  steps?: string[];
  verify?: string[];
  deps?: string[];
  /** 显式声明的权限（可为空数组 = 无高风险能力） */
  permissions: SkillPermission[];
  /** E251：声明接收用户输入（当前仅 'query'——查询经输入文件通道 @input 注入，不进入命令行） */
  input?: 'query';
  /** E252：浏览器操作域名白名单（browser 权限必带，未声明拒绝；授权本地持久化可撤销，§8.2.3） */
  domains?: string[];
  /** E252：浏览器操作动作子集（在全局白名单内再收窄，缺省 = 全局白名单，§4.1.5） */
  actions?: BrowserActionName[];
}

export type MarketInstallStatus = 'installed' | 'disabled';

export interface MarketInstallRecord {
  ts: string;
  name: string;
  version: string;
  sourceUrl: string;
  checksum: string;
  permissions: SkillPermission[];
  status: MarketInstallStatus;
}
