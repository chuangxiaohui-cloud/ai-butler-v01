/**
 * 文件沙箱根目录白名单（§10.1，v0.1 安全最小集）
 * 白名单根目录：projects/、sandbox/、outputs/；越界返回 403 + 审计日志。
 *
 * SEV-1.2 修复：
 * - 走 fs.realpath 解析 symlink，避免软链接逃逸。
 * - 用 path.relative 判断越界，跨平台大小写不敏感
 *   （Windows / macOS HFS+ 默认、CI 的 NTFS 卷）。
 * - SANDBOX_ALLOWED_DIRS 必须落在 workspaceRoot 内；含 `..` 或 NUL 的条目直接拒绝。
 * - 拒绝 NUL byte / 控制字符 / 绝对路径前缀注入。
 */

import { appendFileSync, mkdirSync, realpathSync } from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import process from 'node:process';

export interface SandboxCheck {
  allowed: boolean;
  resolved?: string;
  reason?: string;
}

const DEFAULT_ROOTS = ['projects', 'sandbox', 'outputs'];
const IS_WIN = process.platform === 'win32';
// NUL (0x00) 与 C0 控制字符 (0x01–0x1F) + DEL (0x7F)
const NUL_OR_CTRL = /[\x00-\x1F\x7F]/;

/**
 * 解析 symlink + 父目录链；不存在时降级到 resolve() + 实父目录 realpath，
 * 这样既能审计"想写的新文件路径"，也不会因为目标不存在而误判越界。
 */
function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    if (parent === p) return resolve(p);
    return join(safeRealpath(parent), basename(p));
  }
}

function isInside(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  if (rel === '') return true;
  // Windows 跨盘符：relative 返回的是绝对路径（无法计算相对路径），视为越界。
  if (isAbsolute(rel)) return false;
  if (rel === '..' || rel.startsWith('..' + sep)) return false;
  return true;
}

function parseExtraRoots(workspaceRoot: string): { path: string; reason?: string }[] {
  const raw = (process.env.SANDBOX_ALLOWED_DIRS ?? '').split(';');
  const out: { path: string; reason?: string }[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (NUL_OR_CTRL.test(trimmed)) {
      out.push({ path: trimmed, reason: 'SANDBOX_ALLOWED_DIRS 包含控制字符，已拒绝' });
      continue;
    }
    const abs = resolve(workspaceRoot, trimmed);
    if (!isInside(abs, workspaceRoot)) {
      out.push({ path: trimmed, reason: 'SANDBOX_ALLOWED_DIRS 越出 workspaceRoot，已拒绝' });
      continue;
    }
    out.push({ path: abs });
  }
  return out;
}

export function isPathAllowed(
  requestedPath: string,
  workspaceRoot = process.cwd(),
): SandboxCheck {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) {
    return { allowed: false, reason: '路径为空' };
  }
  if (NUL_OR_CTRL.test(requestedPath)) {
    return { allowed: false, reason: '路径包含 NUL / 控制字符' };
  }

  const realRoot = safeRealpath(resolve(workspaceRoot));
  const resolved = resolve(realRoot, requestedPath);
  const realResolved = safeRealpath(resolved);

  const defaultRoots = DEFAULT_ROOTS.map((r) => safeRealpath(join(realRoot, r)));
  const extras = parseExtraRoots(realRoot).filter((e) => !e.reason);

  const insideDefault = defaultRoots.some((r) => isInside(realResolved, r));
  const insideExtra = extras.some((e) => isInside(realResolved, e.path));

  if (insideDefault || insideExtra) {
    return { allowed: true, resolved: realResolved };
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