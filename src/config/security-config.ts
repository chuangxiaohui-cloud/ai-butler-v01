/**
 * 安全中心配置持久化（E115）
 * Shell 权限默认关闭；开启后 gateway 才允许终端执行命令。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface SecurityConfig {
  shellEnabled: boolean;
  fileAccess: 'project-only' | 'all';
  externalApiEnabled: boolean;
  illegalEnabled: boolean;
  personalEmergencyEnabled: boolean;
  propertyEmergencyEnabled: boolean;
  allowedCommandPrefixes: string[];
}

const DEFAULT_SECURITY: SecurityConfig = {
  shellEnabled: false,
  fileAccess: 'project-only',
  externalApiEnabled: false,
  illegalEnabled: true,
  personalEmergencyEnabled: true,
  propertyEmergencyEnabled: true,
  allowedCommandPrefixes: [],
};

export function securityConfigPath(root = process.cwd()): string {
  return join(root, 'data', 'security-config.json');
}

export function readSecurityConfig(file = securityConfigPath()): SecurityConfig {
  if (!existsSync(file)) return { ...DEFAULT_SECURITY };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<SecurityConfig>;
    return {
      shellEnabled: raw.shellEnabled === true,
      fileAccess: raw.fileAccess === 'all' ? 'all' : 'project-only',
      externalApiEnabled: raw.externalApiEnabled === true,
      illegalEnabled: raw.illegalEnabled !== false,
      personalEmergencyEnabled: raw.personalEmergencyEnabled !== false,
      propertyEmergencyEnabled: raw.propertyEmergencyEnabled !== false,
      allowedCommandPrefixes: Array.isArray(raw.allowedCommandPrefixes)
        ? raw.allowedCommandPrefixes.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULT_SECURITY };
  }
}

export function writeSecurityConfig(
  config: SecurityConfig,
  file = securityConfigPath(),
): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
