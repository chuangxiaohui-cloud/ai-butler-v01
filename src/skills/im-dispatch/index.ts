/**
 * Skill: im-dispatch（消息待发送队列）
 * 真实 IM 未接入前，先把消息写入本地 outbox，状态 pending。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

export function createImDispatchSkill(
  opts?: { dbPath?: string },
): ExecutableSkill & { close(): void } {
  const dbPath =
    opts?.dbPath ??
    process.env.MESSAGES_DB_PATH ??
    join(process.cwd(), 'data', 'messages.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
  `);

  const skill: ExecutableSkill = {
    name: 'im-dispatch',
    version: '0.1.0',
    triggers: ['发消息', '发给', '转发', '发送', '通知', '飞书', '微信', 'QQ'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const mode = typeof input.params?.mode === 'string' ? input.params.mode : '';
      if (mode !== 'send_message' && !/发消息|发给|转发|发送|通知/.test(input.query)) {
        return {
          result: { error: 'unknown_mode' },
          confidence: 0.2,
          followUpAction: '请说明发给谁、发什么内容。',
        };
      }
      const recipient =
        input.query.match(/(?:发给|发送给|给|通知)\s*([^\s，。；,!！]+)/)?.[1]?.trim() ??
        '联系人';
      const content =
        input.query
          .replace(/帮我|请|发消息给|发送给|发给|给|通知|说|告诉|老张/g, '')
          .trim() || '（未指定内容）';
      const now = Date.now();
      const inserted = db
        .prepare(
          `INSERT INTO message_outbox (recipient, content, status, created_at)
           VALUES (?, ?, 'pending', ?)`,
        )
        .run(recipient, content, now);
      return {
        result: {
          ok: true,
          recipient,
          content,
          status: 'pending',
          outboxId: String(inserted.lastInsertRowid),
        },
        confidence: 0.7,
        followUpAction: '真实 IM 未接入，消息已进入待发送队列；接入微信/飞书后我会自动发出。',
      };
    },
  };
  return Object.assign(skill, { close: () => db.close() });
}
