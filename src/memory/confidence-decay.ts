/**
 * 共享置信度衰减逻辑（Week 4）
 * ExperienceManager / SkillLifecycle / UserContextStore 共用同一份实现。
 */

import { PARAMS } from '../config/params.js';

export type FactSource = 'user_explicit' | 'inferred' | 'corrected';

export const DAY_MS = 24 * 3600 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export function daysIdle(last: number, now: number): number {
  return Math.max(0, (now - last) / DAY_MS);
}

export function weeksIdle(last: number, now: number): number {
  return Math.max(0, (now - last) / WEEK_MS);
}

export function isColdAfter(last: number, now: number, coldDays: number): boolean {
  return now - last > coldDays * DAY_MS;
}

/** ExperienceManager / SkillLifecycle 原有周衰减，抽成共享后行为不变。 */
export function weeklyDecayConfidence(
  base: number,
  last: number,
  now: number,
  factorPerWeek = 0.9,
  floor = 0.1,
): number {
  return Math.max(floor, base * Math.pow(factorPerWeek, weeksIdle(last, now)));
}

/** 长期记忆事实衰减：30/90 天两档，user_explicit / corrected 减半应用。 */
export function decayedConfidence(
  base: number,
  daysIdleValue: number,
  source: FactSource,
  cfg = PARAMS,
): number {
  const halfRate = source !== 'inferred';
  const apply = (factor: number) => (halfRate ? 1 - (1 - factor) / 2 : factor);
  if (daysIdleValue >= 90) return base * apply(cfg.decayFactor90d);
  if (daysIdleValue >= 30) return base * apply(cfg.decayFactor30d);
  return base;
}

export const shouldArchive = (confidence: number) =>
  confidence < PARAMS.archiveThreshold;

export const injectable = (confidence: number) =>
  confidence >= PARAMS.injectMinConfidence;
