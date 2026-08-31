/**
 * Skill: schematic-bom（生活助手：PDF 原理图 → 元器件 BOM）
 * 从 PDF 文本/OCR 中提取元件位号与参数，按 值+封装 聚合生成 CSV BOM。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { guardSkillOutputPath } from '../../security/sandbox.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { RawFileLike, SkillDeps } from '../deps.js';
import {
  extractCoordinateBomRows,
  extractPdfSymbolPages,
} from './coordinates.js';
import { applyBomChangeNotes, parseBomChangeNotes } from './changes.js';

export interface BomRow {
  type: string;
  value: string;
  package: string;
  designators: string[];
  quantity: number;
}

const DESIGNATOR_RE =
  /\b((?:SW|CON|TP|R|C|L|D|Q|U|Y|J|X|F|T|K|P)\d{1,4})\b/gi;
const PACKAGE_RE =
  /\b(0603|0402|0805|1206|1210|2512|SOT-?\d+|SOP-?\d+|LQFP-?\d+|QFP-?\d+|QFN-?\d+|DIP-?\d+|BGA-?\d+|TO-?\d+|MELF)\b/i;

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

function designatorType(designator: string): string {
  const prefix = designator.match(/^([A-Z]+)/)?.[1] ?? '';
  return TYPE_BY_PREFIX[prefix] ?? prefix;
}

function cleanValue(token: string | undefined): string {
  if (!token) return '';
  const value = token
    .trim()
    .replace(/^[：:=\-]+|[：:=\-]+$/g, '')
    .replace(/[，,；;]/g, '');
  if (!value) return '';
  if (/^(R|C|U|J|CON|SW|TP)\d{1,4}$/i.test(value)) return '';
  if (/^(GND|VCC|VDD|VSS|NC|RES|CAP)$/i.test(value)) return '';
  return value;
}

export function extractBomRows(text: string): BomRow[] {
  const byDesignator = new Map<
    string,
    { designator: string; value: string; package: string }
  >();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    let m: RegExpExecArray | null;
    while ((m = DESIGNATOR_RE.exec(line)) !== null) {
      const designator = m[1].toUpperCase();
      const rest = line.slice(m.index + m[0].length).trim();
      const tokens = rest.split(/[\s,，;；|/]+/).filter(Boolean);
      const value = cleanValue(tokens[0]);
      const pkg = line.match(PACKAGE_RE)?.[0].toUpperCase() ?? '';
      const existing = byDesignator.get(designator);
      if (!existing || (existing.value === '' && value)) {
        byDesignator.set(designator, {
          designator,
          value: existing?.value || value || '',
          package: existing?.package || pkg || '',
        });
      }
    }
  }

  const groups = new Map<string, BomRow>();
  for (const item of byDesignator.values()) {
    const key = `${designatorType(item.designator)}|${item.value.toLowerCase()}|${item.package.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.designators.push(item.designator);
      existing.quantity += 1;
    } else {
      groups.set(key, {
        type: designatorType(item.designator),
        value: item.value,
        package: item.package,
        designators: [item.designator],
        quantity: 1,
      });
    }
  }
  return [...groups.values()];
}

export function buildBomCsv(rows: BomRow[]): string {
  const lines = ['序号,类型,位号,值/型号,封装,数量'];
  rows.forEach((row, i) => {
    const cells = [
      String(i + 1),
      row.type,
      row.designators.join(' '),
      row.value,
      row.package,
      String(row.quantity),
    ];
    lines.push(cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(','));
  });
  return `\uFEFF${lines.join('\r\n')}\n`;
}

function findPdf(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
  );
}

function safeName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'schematic';
}

export function createSchematicBomSkill(): ExecutableSkill {
  return {
    name: 'schematic-bom',
    version: '0.1.0',
    triggers: ['BOM', '物料清单', '元器件清单', '元件清单', '原理图'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const file = findPdf(input);
      if (!file) {
        return {
          result: {
            answer: '请上传 PDF 电路原理图，我帮你生成元器件 BOM 表。',
          },
          confidence: 0.3,
        };
      }
      if (!deps.parseDocument) {
        return {
          result: {
            answer: 'PDF 解析管道未接入，暂时无法读取原理图。',
          },
          confidence: 0.2,
        };
      }
      try {
        let rows: BomRow[] = [];
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const pages = await extractPdfSymbolPages(buffer);
          rows = extractCoordinateBomRows(pages);
        } catch {
          rows = [];
        }
        let text = '';
        if (rows.length === 0) {
          text = await deps.parseDocument(file);
          rows = extractBomRows(text);
        }
        try {
          if (!text) text = await deps.parseDocument(file);
          rows = applyBomChangeNotes(rows, parseBomChangeNotes(text));
        } catch {
          // BOM Change 备注合并失败不阻塞基础 BOM
        }
        if (rows.length === 0) {
          return {
            result: {
              answer: '已读取 PDF，但未识别到元件位号（R/C/U 等），请确认这是带文本层或可 OCR 的原理图。',
              textExcerpt: text.slice(0, 500),
            },
            confidence: 0.3,
          };
        }
        const csv = buildBomCsv(rows);
        const dir = join(process.cwd(), 'data', 'boms');
        // B1：写盘沙箱门禁（默认 data/boms 必须过白名单 + 审计日志）
        const gate = guardSkillOutputPath(dir);
        if (!gate.allowed) {
          return {
            result: {
              answer: `输出目录不在沙箱白名单内，未生成 BOM：${dir}`,
            },
            confidence: 0.2,
          };
        }
        mkdirSync(dir, { recursive: true });
        const outPath = join(dir, `${safeName(file.name)}-${Date.now()}.csv`);
        writeFileSync(outPath, csv, 'utf-8');
        const total = rows.reduce((sum, r) => sum + r.quantity, 0);
        const answer =
          `已生成 BOM：${outPath}（${rows.length} 类 / ${total} 个元件）\n` +
          rows
            .slice(0, 8)
            .map((r) => `- ${r.type} ${r.designators.join('/')} ${r.value || '(值待确认)'} ${r.package} ×${r.quantity}`)
            .join('\n');
        return {
          result: { answer, path: outPath, bom: rows, csv },
          confidence: 0.8,
          followUpAction: '需要按立创/Excel 模板导出，或补充型号映射表，随时说。',
        };
      } catch (err) {
        return {
          result: {
            answer: `PDF 解析失败：${err instanceof Error ? err.message : String(err)}`,
          },
          confidence: 0.2,
        };
      }
    },
  };
}
