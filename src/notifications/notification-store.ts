/**
 * E315：通知枢纽自动写入（§11.3 秘书日报 / §4.1 右栏通知区）
 * append-only JSONL data/notifications.jsonl：pipeline 在「人类裁决 / 困难升级 / 低置信」时
 * 自动写入通知事件（老板风险裁决请求 / 升级 / 低置信），notification-hub 读取聚合每日摘要。
 * 复用 P15 JSONL 追加工具（句柄复用 + 轮转 + 读缓存），事件 schema 与市场 Skill HubEvent 一致。
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';
import type { HubEvent } from '../skills/market/notification-hub.js';

/** 仓库 data/notifications.jsonl（import.meta.url 锚定，独立于 runner 沙箱 cwd） */
const REPO_NOTIFICATION_LOG = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'data',
  'notifications.jsonl',
);

export function notificationLogPath(): string {
  return process.env.NOTIFICATION_LOG_PATH ?? REPO_NOTIFICATION_LOG;
}

export interface NotificationEntry extends HubEvent {
  id: string;
  /** 事件来源：decision（裁决/升级/低置信）/ skill（角色 Skill 输出） */
  source: 'decision' | 'skill';
  createdAt: number;
}

function parseEntry(line: string): NotificationEntry | null {
  try {
    const entry = JSON.parse(line) as NotificationEntry;
    return entry && typeof entry.id === 'string' ? entry : null;
  } catch {
    return null;
  }
}

export class NotificationStore {
  private readonly file: string;

  constructor(filePath = notificationLogPath()) {
    this.file = filePath;
  }

  /** 写入一条通知事件（缺省 source=decision、ts=写入时刻 ISO） */
  add(event: HubEvent & { source?: 'decision' | 'skill' }): NotificationEntry {
    const createdAt = Date.now();
    const entry: NotificationEntry = {
      ...event,
      source: event.source ?? 'decision',
      id: event.id ?? randomUUID(),
      createdAt,
      ts: event.ts ?? new Date(createdAt).toISOString(),
    };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  recent(limit = 20): NotificationEntry[] {
    return readJsonlCached(this.file, parseEntry).slice(-limit);
  }

  close(): void {
    closeJsonl(this.file);
  }
}

/** E316：角色 Skill 输出事件自动入通知库（source=skill；写入失败不阻塞 Skill 主流程） */
export function emitSkillNotification(event: {
  role: string;
  kind: string;
  title: string;
  detail?: string;
}): void {
  try {
    const store = new NotificationStore();
    try {
      store.add({ ...event, source: 'skill' });
    } finally {
      store.close();
    }
  } catch {
    // 通知写入失败不阻塞 Skill 主流程
  }
}
