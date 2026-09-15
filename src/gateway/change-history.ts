/**
 * E339：projects/ 目录最近变更内存环（§4.1.2 右栏产物区「变更记录」）
 *
 * 只记录 watcher 轮询差量事件（新增/修改/删除），不落盘、不进通知库、不触发 LLM
 * （E328 红线：避免秘书日报摘要噪音与成本）。gateway 进程内跨 UI 刷新保留，进程重启清空；
 * 如需进程重启后仍可查（审计场景），另立 data/ JSONL，勿改动本模块契约。
 */

import type { ProjectChange } from './project-watcher.js';

export interface ProjectChangeRecord extends ProjectChange {
  /** 记录时间戳 ms */
  at: number;
}

/** 内存环上限：最多保留最近 50 条变更记录，超出丢弃最旧 */
export const CHANGE_HISTORY_MAX = 50;

const ring: ProjectChangeRecord[] = [];

/** 记录一批 watcher 差量（新记录压到最前）；无入参不动作 */
export function recordProjectChanges(changes: ProjectChange[], at = Date.now()): void {
  // 倒序 unshift：同一批差量保持入参原序，且整体仍是新批在前
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const change = changes[i];
    ring.unshift({ path: change.path, kind: change.kind, at });
  }
  if (ring.length > CHANGE_HISTORY_MAX) ring.length = CHANGE_HISTORY_MAX;
}

/** 最近变更记录（新→旧），最多 max 条（缺省返回全部保留记录） */
export function listProjectChangeRecords(max = CHANGE_HISTORY_MAX): ProjectChangeRecord[] {
  return ring.slice(0, max).map((item) => ({ ...item }));
}

/** 清空历史（测试/UI 重置用） */
export function clearProjectChangeHistory(): void {
  ring.length = 0;
}
