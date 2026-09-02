#!/usr/bin/env node
/**
 * E314：市场 Skill notification-hub 包装（E251 @input 文件通道）
 * 用法：npm run market:notification:hub -- <input.txt>
 * input.txt 内容 = 事件 JSON 数组（内嵌）或事件 JSON/JSONL 文件路径：
 * [{"role":"项目经理","kind":"blocking_report","title":"..."}, ...]
 * 输出按优先级分组的每日通知摘要（§11.3 秘书日报）；失败 exit 1。
 */

import { existsSync, readFileSync } from 'node:fs';

import { parseEventsInput, renderNotificationDigest } from '../src/skills/market/notification-hub.js';
import { NotificationStore } from '../src/notifications/notification-store.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:notification:hub -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    let events = parseEventsInput(inputText);
    if (events.length === 0) {
      const maybePath = inputText.trim();
      if (existsSync(maybePath)) {
        events = parseEventsInput(readFileSync(maybePath, 'utf-8'));
      }
    }
    if (events.length === 0) {
      // E315：无内嵌事件/无路径时读通知库（data/notifications.jsonl，已自动写入裁决/升级/低置信事件）
      const store = new NotificationStore();
      try {
        events = store.recent();
      } finally {
        store.close();
      }
    }
    if (events.length === 0) {
      console.error(JSON.stringify({ ok: false, error: '未解析到事件，请输入 JSON 数组或事件文件路径。' }));
      process.exit(1);
    }
    console.log(renderNotificationDigest(events));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
