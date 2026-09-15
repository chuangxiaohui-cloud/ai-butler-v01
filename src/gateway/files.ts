/**
 * 产物文件扫描（E116）
 * 只扫描沙箱允许根目录：projects/ sandbox/ outputs/ data/datasheets/。
 */

import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'fs';
import { isAbsolute, join, relative, sep } from 'path';

import { parseXmindBuffer, treeToOutlineText, type MindNode } from '../skills/pm-xmind/format.js';

export interface ProjectFile {
  path: string;
  size: number;
  mtime: number;
  kind: string;
}

/** E337：只读预览同样只允许这些沙箱根目录 */
export const SCAN_ROOTS = ['projects', 'sandbox', 'outputs', 'data/datasheets'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'build', 'dist']);

/** 编辑器/Office 临时文件：列表剔除，避免 ~$xxx / .tmp 残留污染文件面板（E335） */
export const EDITOR_TEMP = /^~\$|^\.~|\.(tmp|swp|lock)$/i;

function kindOf(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.kicad_sch') || lower.endsWith('.kicad_pcb')) return '原理图/PCB';
  if (lower.endsWith('.net')) return '网络表';
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'HTML 预览';
  if (lower.endsWith('.zip')) return '打包';
  if (lower.endsWith('.xmind')) return '思维导图'; // E340
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return '文档';
  return '文件';
}

export function listProjectFiles(
  workspaceRoot = process.cwd(),
  maxFiles = 200,
  maxDepth = 6,
): ProjectFile[] {
  const files: ProjectFile[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || files.length >= maxFiles) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (files.length >= maxFiles) return;
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile()) {
        if (EDITOR_TEMP.test(name)) continue;
        files.push({
          path: relative(workspaceRoot, full).split(sep).join('/'),
          size: stat.size,
          mtime: stat.mtimeMs,
          kind: kindOf(name),
        });
      }
    }
  };
  for (const root of SCAN_ROOTS) {
    walk(join(workspaceRoot, root), 0);
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

/** E337：文件面板只读预览结果 */
export type FilePreviewResult =
  // E346：.xmind 预览附带 tree（MindNode 树），UI 用于画可视化导图
  | {
      ok: true;
      path: string;
      size: number;
      preview: string;
      truncated: boolean;
      tree?: MindNode;
    }
  | {
      ok: false;
      error:
        | 'bad_path'
        | 'not_found'
        | 'not_file'
        | 'binary'
        // E345：.xmind 需整体解包，超 [P-151] 无法截断展示，直接拒绝
        | 'too_large'
        // E345：非合法 .xmind（损坏 zip / 缺 content.json / 无根话题）
        | 'bad_xmind';
    };

/** E337/E345/E348：预览路径解析——只允许沙箱根内文件；相对/绝对路径均可（AI 回复里内嵌产物绝对路径时用）。 */
function resolvePreviewPath(
  workspaceRoot: string,
  relPath: string,
): { ok: true; full: string; norm: string } | { ok: false; error: 'bad_path' } {
  if (!relPath || relPath.includes('\0')) return { ok: false, error: 'bad_path' };
  const norm = relPath.replace(/\\/g, '/');
  const eq = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const rootPrefixes = SCAN_ROOTS.map((r) =>
    eq(join(workspaceRoot, r).replace(/\\/g, '/')),
  );
  if (isAbsolute(norm)) {
    // E348：绝对路径仅当位于沙箱根内才放行（读回 AI 回复里的产物路径），否则按穿越拒绝
    if (norm.split('/').includes('..')) return { ok: false, error: 'bad_path' };
    const inside = rootPrefixes.find(
      (prefix) => eq(norm) === prefix || eq(norm).startsWith(`${prefix}/`),
    );
    if (!inside) return { ok: false, error: 'bad_path' };
    return { ok: true, full: norm, norm };
  }
  const segments = norm.split('/').filter((s) => s.length > 0);
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    return { ok: false, error: 'bad_path' };
  }
  if (!SCAN_ROOTS.includes(segments[0])) return { ok: false, error: 'bad_path' };
  return { ok: true, full: join(workspaceRoot, ...segments), norm };
}

/** E337/E345：预览文件 stat——必须存在且是常规文件。 */
function statPreviewFile(
  full: string,
): { ok: true; size: number } | { ok: false; error: 'not_found' | 'not_file' } {
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return { ok: false, error: 'not_found' };
  }
  if (!stat.isFile()) return { ok: false, error: 'not_file' };
  return { ok: true, size: stat.size };
}

/**
 * E337：只读读回沙箱根内文本文件（≤ maxBytes，超长截断；含 NUL 视为二进制拒绝）。
 * 防路径穿越：拒绝绝对路径、`.`/`..` 段、非沙箱根开头。
 */
export function readTextFilePreview(
  workspaceRoot: string,
  relPath: string,
  maxBytes: number,
): FilePreviewResult {
  const resolved = resolvePreviewPath(workspaceRoot, relPath);
  if (!resolved.ok) return resolved;
  const { full, norm } = resolved;
  const stat = statPreviewFile(full);
  if (!stat.ok) return stat;
  const truncated = stat.size > maxBytes;
  const toRead = Math.min(stat.size, maxBytes + 1);
  const buf = Buffer.alloc(toRead);
  if (toRead > 0) {
    let fd: number | undefined;
    try {
      fd = openSync(full, 'r');
      let offset = 0;
      while (offset < toRead) {
        const n = readSync(fd, buf, offset, toRead - offset, offset);
        if (n <= 0) break;
        offset += n;
      }
    } catch {
      return { ok: false, error: 'not_found' };
    } finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // 关闭失败可忽略
        }
      }
    }
  }
  if (buf.includes(0)) return { ok: false, error: 'binary' };
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return { ok: true, path: norm, size: stat.size, preview: slice.toString('utf8'), truncated };
}

/**
 * E354：只读读回沙箱根内 .html/.htm 整文件（供文件面板 iframe 渲染，不截断）。
 * 与 E337 preview 同防护口径（resolvePreviewPath / statPreviewFile）；
 * 仅放行 HTML 扩展名，避免 raw 端点成为任意文件下载口；超大直接拒绝。
 */
export function readHtmlArtifactRaw(
  workspaceRoot: string,
  relPath: string,
  maxBytes = 16 * 1024 * 1024,
):
  | { ok: true; buffer: Buffer; path: string; size: number }
  | { ok: false; error: 'bad_path' | 'not_found' | 'not_file' | 'not_html' | 'too_large' } {
  const resolved = resolvePreviewPath(workspaceRoot, relPath);
  if (!resolved.ok) return resolved;
  const normLower = resolved.norm.toLowerCase();
  if (!normLower.endsWith('.html') && !normLower.endsWith('.htm')) {
    return { ok: false, error: 'not_html' };
  }
  const stat = statPreviewFile(resolved.full);
  if (!stat.ok) return stat;
  if (stat.size > maxBytes) return { ok: false, error: 'too_large' };
  let buffer: Buffer;
  try {
    buffer = readFileSync(resolved.full);
  } catch {
    return { ok: false, error: 'not_found' };
  }
  return { ok: true, buffer, path: resolved.norm, size: stat.size };
}

/**
 * E345：只读读回沙箱根内 .xmind（zip）的文本大纲（中心主题 + WBS 编号行）。
 * zip 需整体解包后才能读出结构，故超过 maxBytes 直接拒绝（不做截断展示）；
 * 路径防护与文本预览同口径（resolvePreviewPath / statPreviewFile）。
 */
export async function readXmindFilePreview(
  workspaceRoot: string,
  relPath: string,
  maxBytes: number,
): Promise<FilePreviewResult> {
  const resolved = resolvePreviewPath(workspaceRoot, relPath);
  if (!resolved.ok) return resolved;
  const stat = statPreviewFile(resolved.full);
  if (!stat.ok) return stat;
  if (stat.size > maxBytes) return { ok: false, error: 'too_large' };
  let buf: Buffer;
  try {
    buf = readFileSync(resolved.full);
  } catch {
    return { ok: false, error: 'not_found' };
  }
  const root = await parseXmindBuffer(buf);
  if (!root) return { ok: false, error: 'bad_xmind' };
  return {
    ok: true,
    path: resolved.norm,
    size: stat.size,
    preview: treeToOutlineText(root),
    truncated: false,
    tree: root,
  };
}
