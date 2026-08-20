/**
 * BOM Change 备注解析与合并：
 * Delete / Add / BOM change to / R188,R190 --> 0R 等历史变更合并进 BOM。
 */

import type { BomRow } from './index.js';

const DESIGNATOR_RE =
  /^(?:SW|CON|TP|R|C|L|D|Q|U|Y|J|X|F|T|K|P)\d{1,4}$/i;

const TYPE_BY_PREFIX: Record<string, string> = {
  R: '电阻',
  C: '电容',
  L: '电感',
  D: '二极管',
  Q: '三极管/MOS',
  U: 'IC',
  Y: '晶振',
  J: '连接器',
  X: '连接器',
  F: '保险丝',
  T: '变压器',
  K: '开关',
  SW: '开关',
  CON: '连接器',
  TP: '测试点',
  P: '测试点',
};

export interface BomChangeNote {
  action: 'change' | 'delete' | 'add';
  designators: string[];
  value?: string;
}

function designatorType(designator: string): string {
  const prefix = designator.match(/^([A-Z]+)/)?.[1] ?? '';
  return TYPE_BY_PREFIX[prefix] ?? prefix;
}

export function splitDesignators(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[\s,，;；/]+/)
    .map((s) => s.trim())
    .filter((s) => DESIGNATOR_RE.test(s));
}

function cleanValue(value: string): string {
  return value
    .trim()
    .replace(/[，,;；]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBomChangeNotes(text: string): BomChangeNote[] {
  const notes: BomChangeNote[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const deleteMatch = line.match(/\bDelete\s+(.+)/i);
    if (deleteMatch) {
      const designators = splitDesignators(deleteMatch[1]);
      if (designators.length > 0) {
        notes.push({ action: 'delete', designators });
      }
      continue;
    }

    const changeMatch = line.match(/(?:BOM\s+change\s+to|BOM\s+change)\s+(.+)$/i);
    if (changeMatch) {
      const designators = splitDesignators(line.slice(0, changeMatch.index));
      const value = cleanValue(changeMatch[1]);
      if (designators.length > 0 && value) {
        notes.push({
          action: /^(?:NC|OPEN|DNP)$/i.test(value) ? 'delete' : 'change',
          designators,
          value,
        });
      }
      continue;
    }

    const arrowMatch = line.match(/(.+?)\s*-->\s*(.+)/);
    if (arrowMatch) {
      const designators = splitDesignators(arrowMatch[1]);
      const value = cleanValue(arrowMatch[2]);
      if (designators.length > 0 && value) {
        notes.push({
          action: /^(?:NC|OPEN|DNP)$/i.test(value) ? 'delete' : 'change',
          designators,
          value,
        });
      }
      continue;
    }

    const addMatch = line.match(/\bAdd\s+(.+)/i);
    if (addMatch) {
      const designators = splitDesignators(
        addMatch[1].replace(/\b(?:Close|to|for)\b.*$/i, ''),
      );
      if (designators.length > 0) {
        notes.push({ action: 'add', designators });
      }
    }
  }
  return notes;
}

export function applyBomChangeNotes(
  rows: BomRow[],
  notes: BomChangeNote[],
): BomRow[] {
  const byDesignator = new Map<string, { type: string; value: string; package: string }>();
  for (const row of rows) {
    for (const des of row.designators) {
      byDesignator.set(des.toUpperCase(), {
        type: row.type,
        value: row.value,
        package: row.package,
      });
    }
  }
  for (const note of notes) {
    for (const raw of note.designators) {
      const des = raw.toUpperCase();
      if (note.action === 'delete') {
        byDesignator.delete(des);
        continue;
      }
      const existing = byDesignator.get(des);
      if (existing) {
        if (note.value) existing.value = note.value;
      } else if (note.action === 'change' || note.action === 'add') {
        byDesignator.set(des, {
          type: designatorType(des),
          value: note.value ?? '',
          package: '',
        });
      }
    }
  }

  const groups = new Map<string, BomRow>();
  for (const [designator, info] of byDesignator) {
    const key = `${info.type}|${info.value.toLowerCase()}|${info.package.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.designators.push(designator);
      existing.quantity += 1;
    } else {
      groups.set(key, {
        type: info.type,
        value: info.value,
        package: info.package,
        designators: [designator],
        quantity: 1,
      });
    }
  }
  return [...groups.values()];
}
