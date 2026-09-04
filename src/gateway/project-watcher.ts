/**
 * E328：projects/ 目录文件变更监听（§4.1 三栏交互 UI 阶段）
 *
 * 复用 listProjectFiles 的遍历口径做低频轮询快照差量：新增/修改/删除 → onChange。
 * 目的：外部工具（编辑器/KiCad/手动/桌面同步）改动 projects/ 时，gateway 据此广播
 * files_changed SSE，让 UI 文件面板自动刷新（/api/ask 写盘后由 ask 链路自行广播，
 * 两者互不影响，重复刷新无害）。
 */

import { basename } from 'node:path';

import { listProjectFiles } from './files.js';

/** 编辑器/Office 临时文件：快照前剔除，避免保存抖动触发无意义刷新 */
const EDITOR_TEMP = /^~\$|^\.~|\.(tmp|swp|lock)$/i;

export interface ProjectFileStamp {
  path: string;
  size: number;
  mtime: number;
}

export interface ProjectChange {
  path: string;
  kind: 'added' | 'modified' | 'removed';
}

/** 取 workspaceRoot 下 projects/ 的文件快照（剔除编辑器临时文件） */
export function snapshotProjects(workspaceRoot = process.cwd()): ProjectFileStamp[] {
  const out: ProjectFileStamp[] = [];
  for (const file of listProjectFiles(workspaceRoot)) {
    if (!file.path.startsWith('projects/')) continue;
    if (EDITOR_TEMP.test(basename(file.path))) continue;
    out.push({ path: file.path, size: file.size, mtime: file.mtime });
  }
  return out;
}

/** 两个快照的差量：added / modified（大小或 mtime 变化）/ removed，按路径排序 */
export function diffSnapshots(
  prev: ProjectFileStamp[],
  next: ProjectFileStamp[],
): ProjectChange[] {
  const prevBy = new Map(prev.map((f) => [f.path, f]));
  const nextBy = new Map(next.map((f) => [f.path, f]));
  const changes: ProjectChange[] = [];
  for (const file of next) {
    const before = prevBy.get(file.path);
    if (!before) {
      changes.push({ path: file.path, kind: 'added' });
    } else if (before.size !== file.size || Math.abs(before.mtime - file.mtime) > 1) {
      changes.push({ path: file.path, kind: 'modified' });
    }
  }
  for (const file of prev) {
    if (!nextBy.has(file.path)) changes.push({ path: file.path, kind: 'removed' });
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return changes;
}

export interface ProjectWatcherOptions {
  /** workspace 根（缺省 process.cwd()），快照取其中 projects/ */
  workspaceRoot?: string;
  /** 轮询间隔 ms（缺省 2000） */
  intervalMs?: number;
  /** 有变更时回调（差量列表按路径排序）；回调抛错不影响后续轮询 */
  onChange: (changes: ProjectChange[]) => void;
}

export interface ProjectWatcher {
  stop(): void;
}

/** 启动 projects/ 变更监听；首轮快照为基线，此前变更不广播 */
export function startProjectWatcher(opts: ProjectWatcherOptions): ProjectWatcher {
  const root = opts.workspaceRoot ?? process.cwd();
  const intervalMs = opts.intervalMs ?? 2000;
  let prev = snapshotProjects(root);
  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    const next = snapshotProjects(root);
    const changes = diffSnapshots(prev, next);
    prev = next;
    if (changes.length === 0) return;
    try {
      opts.onChange(changes);
    } catch {
      // 单次回调失败不中断轮询
    }
  }, intervalMs);
  timer.unref?.();
  return {
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
