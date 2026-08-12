/**
 * 文件沙箱根目录白名单（§10.1，v0.1 安全最小集）
 * 白名单根目录：projects/、sandbox/、outputs/；越界返回 403 + 审计日志。
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

export interface SandboxCheck {
  allowed: boolean;
  resolved?: string;
  reason?: string;
}

const DEFAULT_ROOTS = ['projects', 'sandbox', 'outputs'];

export function isPathAllowed(
  requestedPath: string,
  workspaceRoot = process.cwd(),
): SandboxCheck {
  const absolute = resolve(workspaceRoot, requestedPath);
  for (const root of DEFAULT_ROOTS) {
    const rootPath = resolve(workspaceRoot, root);
    if (absolute === rootPath || absolute.startsWith(rootPath + sep)) {
      return { allowed: true, resolved: absolute };
    }
  }
  const extra = (process.env.SANDBOX_ALLOWED_DIRS ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => resolve(workspaceRoot, p));
  if (extra.some((p) => absolute === p || absolute.startsWith(p + sep))) {
    return { allowed: true, resolved: absolute };
  }
  return { allowed: false, reason: '越界路径（不在白名单根目录内）' };
}

export function logSandboxAudit(
  entry: { requestedPath: string; allowed: boolean; reason?: string; ts: string },
  logPath = join(process.cwd(), 'data', 'audit-sandbox.jsonl'),
): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch {
    // 审计日志失败不阻塞主流程
  }
}
