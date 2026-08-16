/**
 * 产物文件扫描（E116）
 * 只扫描沙箱允许根目录：projects/ sandbox/ outputs/ data/datasheets/。
 */

import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

export interface ProjectFile {
  path: string;
  size: number;
  mtime: number;
  kind: string;
}

const ROOTS = ['projects', 'sandbox', 'outputs', 'data/datasheets'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'build', 'dist']);

function kindOf(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.kicad_sch') || lower.endsWith('.kicad_pcb')) return '原理图/PCB';
  if (lower.endsWith('.net')) return '网络表';
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.zip')) return '打包';
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
        files.push({
          path: relative(workspaceRoot, full).split(sep).join('/'),
          size: stat.size,
          mtime: stat.mtimeMs,
          kind: kindOf(name),
        });
      }
    }
  };
  for (const root of ROOTS) {
    walk(join(workspaceRoot, root), 0);
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}
