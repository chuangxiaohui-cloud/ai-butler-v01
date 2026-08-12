/**
 * 规则① fact_consistency 事实一致性校验（§6.5.5）
 * 只校验数值/版本/日期；仲裁顺序：官方源 > 多数一致 > 都无则记 0 并触发门控。
 */

import { isOfficialForQuery } from './authority.js';

export interface ExtractedValue {
  attribute: string;
  unit: string;
  min: number | null;
  max: number | null;
  text: string;
}

export interface ValueConflict {
  attribute: string;
  unit: string;
  urls: string[];
  values: string[];
}

export interface Rule1Result {
  conflicts: ValueConflict[];
  factConsistency: Map<string, number>;
  gated: boolean;
}

const RANGE_PATTERN = /(\d+(?:\.\d+)?)\s*(?:-|~|至|到)\s*(\d+(?:\.\d+)?)\s*(V|v|伏|MHz|kHz|Hz|A|mA|uA|μA|W|mW|%|℃)/g;
const SINGLE_PATTERN = /(\d+(?:\.\d+)?)\s*(V|v|伏|MHz|kHz|Hz|A|mA|uA|μA|W|mW|%|℃)/g;

function normalizeValueText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function normalizeUnit(unit: string): string {
  return unit.toLowerCase() === '伏' ? 'v' : unit.toLowerCase();
}

export function extractValueRanges(text: string): ExtractedValue[] {
  const out: ExtractedValue[] = [];
  for (const match of text.matchAll(RANGE_PATTERN)) {
    out.push({
      attribute: 'value',
      unit: normalizeUnit(match[3]),
      min: Number(match[1]),
      max: Number(match[2]),
      text: match[0],
    });
  }
  if (out.length === 0) {
    for (const match of text.matchAll(SINGLE_PATTERN)) {
      out.push({
        attribute: 'value',
        unit: normalizeUnit(match[2]),
        min: Number(match[1]),
        max: Number(match[1]),
        text: match[0],
      });
    }
  }
  return out;
}

export function resolveFactConsistency(
  items: Array<{ url: string; title: string; content: string; query: string }>,
): Rule1Result {
  const conflicts: ValueConflict[] = [];
  const scores = new Map<string, number>();
  const valuesByUrl = new Map<string, ExtractedValue[]>();

  for (const item of items) {
    valuesByUrl.set(item.url, extractValueRanges(`${item.title} ${item.content}`));
  }

  let gated = false;
  const groups = new Map<string, Array<{ url: string; value: ExtractedValue }>>();
  for (const item of items) {
    for (const value of valuesByUrl.get(item.url) ?? []) {
      const key = `${value.attribute}|${value.unit}`;
      const group = groups.get(key) ?? [];
      group.push({ url: item.url, value });
      groups.set(key, group);
    }
  }

  for (const [key, rawEntries] of groups) {
    if (rawEntries.length < 2) continue;
    const [attribute, unit] = key.split('|');
    const seen = new Set<string>();
    const entries = rawEntries.filter((e) => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });
    const valueTexts = [...new Set(entries.map((e) => normalizeValueText(e.value.text)))];
    if (valueTexts.length < 2) continue;

    conflicts.push({
      attribute,
      unit,
      urls: entries.map((e) => e.url),
      values: [...new Set(entries.map((e) => e.value.text))],
    });

    const query = items[0]?.query ?? '';
    const officialEntries = entries.filter((e) => isOfficialForQuery(e.url, query));
    if (officialEntries.length > 0) {
      const officialValues = [
        ...new Set(officialEntries.map((e) => normalizeValueText(e.value.text))),
      ];
      if (officialValues.length > 1) {
        gated = true;
        for (const e of officialEntries) scores.set(e.url, 0);
        for (const e of entries) if (!officialEntries.includes(e)) scores.set(e.url, 0);
      } else {
        const winner = officialValues[0];
        for (const e of entries) {
          if (
            !officialEntries.includes(e) &&
            normalizeValueText(e.value.text) !== winner
          ) {
            scores.set(e.url, 0);
          }
        }
      }
      continue;
    }

    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = normalizeValueText(e.value.text);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const maxCount = Math.max(...counts.values());
    const winners = [...counts.entries()].filter(([, n]) => n === maxCount).map(([k]) => k);
    if (winners.length > 1) {
      gated = true;
      for (const e of entries) scores.set(e.url, 0);
    } else {
      const winner = winners[0];
      for (const e of entries) {
        if (normalizeValueText(e.value.text) !== winner) scores.set(e.url, 0);
      }
    }
  }

  for (const item of items) {
    if (!scores.has(item.url)) scores.set(item.url, 1);
  }
  return { conflicts, factConsistency: scores, gated };
}
