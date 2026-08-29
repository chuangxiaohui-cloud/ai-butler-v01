/**
 * 运行时看门狗：统计最近窗口内 synthesis_timeout 占比（E282）。
 * 订阅 data/trajectory.jsonl 的 answer 事件，占比 ≥ [P-141] 时返回 toolNotice 告警，
 * 把「单测全绿但 provider 抖动反复翻车」的环境噪音在用户侧显式化。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PARAMS } from '../config/params.js';

export interface SynthesisHealthSnapshot {
  windowMs: number;
  answers: number;
  timeouts: number;
  ratio: number;
}

export interface WatchdogCheckOptions {
  filePath?: string;
  windowMs?: number;
  minRatio?: number;
  now?: number;
}

export interface WatchdogResult extends SynthesisHealthSnapshot {
  triggered: boolean;
  message?: string;
}

export function checkSynthesisHealth(opts: WatchdogCheckOptions = {}): WatchdogResult {
  const filePath = opts.filePath ?? join(process.cwd(), 'data', 'trajectory.jsonl');
  const windowMs = opts.windowMs ?? PARAMS.watchdogWindowMs; // [P-140]
  const minRatio = opts.minRatio ?? PARAMS.watchdogTimeoutRatio; // [P-141]
  const now = opts.now ?? Date.now();
  const since = now - windowMs;
  const snapshot = countAnswers(readLines(filePath), since, windowMs);
  if (snapshot.answers === 0) {
    return { ...snapshot, triggered: false };
  }
  const triggered = snapshot.ratio >= minRatio;
  return {
    ...snapshot,
    triggered,
    ...(triggered
      ? {
          message: `运行时看门狗：窗口内 ${snapshot.timeouts}/${snapshot.answers} 次回答发生 synthesis_timeout（${Math.round(
            snapshot.ratio * 100,
          )}%），建议检查 LLM provider 或切换更快档位。`,
        }
      : {}),
  };
}

function readLines(filePath: string): string[] {
  try {
    return readFileSync(filePath, 'utf-8').split('\n');
  } catch {
    return [];
  }
}

function countAnswers(lines: string[], since: number, windowMs: number): SynthesisHealthSnapshot {
  let answers = 0;
  let timeouts = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let event: { type?: unknown; timestamp?: unknown; answer?: { gateTriggered?: unknown } };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue; // 轨迹损坏行不阻塞看门狗
    }
    if (event.type !== 'answer' || typeof event.timestamp !== 'number' || event.timestamp < since) {
      continue;
    }
    answers += 1;
    if (event.answer?.gateTriggered === 'synthesis_timeout') timeouts += 1;
  }
  return {
    windowMs,
    answers,
    timeouts,
    ratio: answers > 0 ? timeouts / answers : 0,
  };
}
