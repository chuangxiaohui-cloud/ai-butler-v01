import {
  DAY_MS,
  LONG_TERM_AGING_CHECKPOINT_DAYS,
} from './confidence-decay.js';

export type TimeSensitiveMemoryKind = 'inventory' | 'price' | 'version' | 'schedule';

const RULES: Array<[TimeSensitiveMemoryKind, RegExp]> = [
  ['inventory', /库存|现货|缺货|补货|交期/],
  ['price', /价格|报价|单价|采购价|售价/],
  ['version', /当前版本|最新版本|版本号|固件版本|软件版本/],
  ['schedule', /排期|截止日期|交付日期|交付时间|会议时间|开会时间|日程/],
];

/** 保守规则：只给明确会随时间变化的事实加时效元数据。 */
export function classifyTimeSensitiveMemory(content: string): TimeSensitiveMemoryKind | null {
  for (const [kind, pattern] of RULES) {
    if (pattern.test(content)) return kind;
  }
  return null;
}

export function timeSensitiveMemoryExpiresAt(
  kind: TimeSensitiveMemoryKind | null,
  createdAt: number,
): number | null {
  return kind === null
    ? null
    : createdAt + LONG_TERM_AGING_CHECKPOINT_DAYS * DAY_MS;
}

export function isTimeSensitiveMemoryStale(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && now >= expiresAt;
}
