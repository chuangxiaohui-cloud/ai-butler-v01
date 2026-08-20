/**
 * PDF 坐标 BOM 提取（Week 2）：
 * 以 PyMuPDF 坐标/包围盒输出为基础，位号最近邻绑定值/封装/型号，
 * 再用引脚密度、值证据、BOM 备注噪声三层过滤。
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { BomRow } from './index.js';

const PDF_SYMBOLS_SCRIPT = fileURLToPath(
  new URL('../../../scripts/pdf_symbols.py', import.meta.url),
);

export interface PdfWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
}

export interface PdfTextSymbol {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  count: number;
  area: number;
  designators: string[];
}

export interface PdfSymbolPage {
  page: number;
  width: number;
  height: number;
  wordCount: number;
  words: PdfWord[];
  textSymbols: PdfTextSymbol[];
  drawingSymbols: Array<{ x0: number; y0: number; x1: number; y1: number; count: number }>;
}

export interface PdfSymbolsPayload {
  ok: boolean;
  pageCount: number;
  pages: PdfSymbolPage[];
  error?: string;
}

const DESIGNATOR_RE =
  /^(?:SW|CON|TP|R|C|L|D|Q|U|Y|J|X|F|T|K|P)\d{1,4}$/i;
const PACKAGE_RE =
  /\b(?:0603|0402|0805|1206|1210|2512|SOT-?\d+|SOP-?\d+|LQFP-?\d+|QFP-?\d+|QFN-?\d+|DIP-?\d+|BGA-?\d+|TO-?\d+|MELF|4PIN SMD)\b/i;
const NET_NOISE_RE =
  /^(?:GND|VCC|VDD|VSS|AGND|DGND|NC|PWR|VIN|VOUT|VREF|AVDD|DVDD|EN|RESET|CLK|SDA|SCL|GPIO|SPI|I2C|UART|DDR|EMIF|CVDD|VDDS|VDDR|VDDA|VDDSHV|VDD_AEMIF|VDD18|PWR_|PWCTR|PWCTRI|AIC12|CMOS|NAND|SD_|USB_|RSV|DM36)/i;
const NOISE_WORDS = new Set([
  'BOM',
  'MODIFY',
  'CHANGE',
  'DELETE',
  'ADD',
  'CLOSE',
  'TO',
  'PIN',
  'CHANG',
  'NET',
  'LINE',
  'ANALOG',
  'VIDEO',
  'DIGITAL',
  'I/F',
  'LENGTH',
  'DIFFERENTIAL',
  'DATA3',
  'BYPASS',
  'CORE',
]);

export function isDesignatorWord(text: string): boolean {
  return DESIGNATOR_RE.test(text.trim());
}

export function isPackageWord(text: string): boolean {
  return PACKAGE_RE.test(text.trim());
}

export function isValueWord(text: string): boolean {
  const t = text.trim().replace(/[()（）]/g, '');
  if (/^(?:NC|NP|DNP)$/i.test(t)) return true;
  if (
    /(?:\d+(?:\.\d+)?\s*(?:R|K|M|uF|nF|pF|F|H|Ω|%|W))|^\d+(?:\.\d+)?(?:R|K|M|Ω)$/i.test(t)
  ) {
    return true;
  }
  return false;
}

export function isPartNumberWord(text: string): boolean {
  const t = text.trim();
  if (t.length < 6 || t.includes('_')) return false;
  if (NOISE_WORDS.has(t.toUpperCase())) return false;
  if (NET_NOISE_RE.test(t)) return false;
  return /^[A-Z0-9][A-Z0-9-]{4,}$/i.test(t);
}

function center(word: PdfWord): { x: number; y: number } {
  return { x: (word.x0 + word.x1) / 2, y: (word.y0 + word.y1) / 2 };
}

function distance(a: PdfWord, b: PdfWord): number {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

export async function extractPdfSymbolPages(buffer: Buffer): Promise<PdfSymbolPage[]> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn('python', [PDF_SYMBOLS_SCRIPT], { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      err += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `python exit ${code}`));
    });
    child.stdin.end(buffer);
  });
  const parsed = JSON.parse(stdout) as PdfSymbolsPayload;
  if (!parsed.ok) throw new Error(parsed.error ?? 'pdf_symbols failed');
  return parsed.pages;
}

export function extractCoordinateBomRows(pages: PdfSymbolPage[]): BomRow[] {
  const byDesignator = new Map<
    string,
    { value: string; package: string; model: string; score: number }
  >();

  for (const page of pages) {
    const pageWords = page.words;
    const designators = pageWords.filter((word) => isDesignatorWord(word.text));
    for (const des of designators) {
      const radius = des.text.toUpperCase().startsWith('U') ? 70 : 50;
      const maxEvidenceDistance = 45;
      const candidates = pageWords
        .map((word) => ({ word, distance: distance(des, word) }))
        .filter((item) => item.distance > 0 && item.distance <= radius)
        .sort((a, b) => a.distance - b.distance);
      const neighborDesignators = candidates.filter((item) =>
        isDesignatorWord(item.word.text),
      );
      const hasBomNoise = candidates.some((item) =>
        NOISE_WORDS.has(item.word.text.trim().toUpperCase()),
      );
      const rawValue = candidates.find((item) => isValueWord(item.word.text));
      const value =
        candidates.find(
          (item) =>
            isValueWord(item.word.text) &&
            !/(?:NC|OPEN|DNP)/i.test(item.word.text),
        ) ?? rawValue;
      const pkg = candidates.find((item) => isPackageWord(item.word.text));
      const model = candidates.find((item) => isPartNumberWord(item.word.text));
      const evidence = value ?? pkg ?? model;
      const denseArrayValue =
        des.size >= 300 &&
        Boolean(value && /[/%]/.test(value.word.text));

      // Layer 1：BOM Change 备注字号偏小，直接排除，避免 Delete/Add 噪声。
      if (des.size < 40) continue;
      // Layer 1b：NC/OPEN/DNP 是空贴位号，XLS 对照表不体现。
      if (
        rawValue &&
        /(?:NC|OPEN|DNP)/i.test(rawValue.word.text) &&
        !value
      ) {
        continue;
      }
      // Layer 2：必须要有足够近的值/封装/型号证据，排除 DDR 引脚名。
      if (
        !evidence ||
        evidence.distance > (denseArrayValue ? 70 : maxEvidenceDistance)
      ) {
        continue;
      }
      // Layer 3：密集引脚区若最近值仍明显偏远，视为蹭到附近元件。
      if (
        neighborDesignators.length >= 8 &&
        evidence.distance > 32 &&
        !denseArrayValue
      ) {
        continue;
      }
      // Layer 4：BOM Change 备注里的位号，除非同区带明确值证据，否则排除。
      if (hasBomNoise && !value) continue;

      const key = des.text.toUpperCase();
      const existing = byDesignator.get(key);
      const score = evidence.distance;
      if (!existing || score < existing.score) {
        byDesignator.set(key, {
          value: value ? value.word.text : '',
          package: pkg ? pkg.word.text.toUpperCase() : '',
          model: model ? model.word.text : '',
          score,
        });
      }
    }
  }

  const groups = new Map<string, BomRow>();
  for (const [designator, info] of byDesignator) {
    const type = designatorType(designator);
    const value = info.model || info.value;
    const groupKey = `${type}|${value.toLowerCase()}|${info.package.toLowerCase()}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.designators.push(designator);
      existing.quantity += 1;
    } else {
      groups.set(groupKey, {
        type,
        value,
        package: info.package,
        designators: [designator],
        quantity: 1,
      });
    }
  }
  return [...groups.values()];
}

export function extractLikelyPinNames(pages: PdfSymbolPage[]): Set<string> {
  const pins = new Set<string>();
  for (const page of pages) {
    const designators = page.words.filter((word) => isDesignatorWord(word.text));
    for (const des of designators) {
      if (des.size < 40) continue;
      const radius = des.text.toUpperCase().startsWith('U') ? 70 : 50;
      const candidates = page.words
        .map((word) => ({ word, distance: distance(des, word) }))
        .filter((item) => item.distance > 0 && item.distance <= radius)
        .sort((a, b) => a.distance - b.distance);
      const neighborDesignators = candidates.filter((item) =>
        isDesignatorWord(item.word.text),
      );
      const value = candidates.find((item) => isValueWord(item.word.text));
      const pkg = candidates.find((item) => isPackageWord(item.word.text));
      const model = candidates.find((item) => isPartNumberWord(item.word.text));
      const evidence = value ?? pkg ?? model;
      const pin =
        neighborDesignators.length >= 8 &&
        (!evidence || (evidence && evidence.distance > 30));
      if (pin) pins.add(des.text.toUpperCase());
    }
  }
  return pins;
}

export function extractNcDesignators(pages: PdfSymbolPage[]): Set<string> {
  const nc = new Set<string>();
  for (const page of pages) {
    const designators = page.words.filter((word) => isDesignatorWord(word.text));
    for (const des of designators) {
      const radius = 80;
      const candidates = page.words
        .map((word) => ({ word, distance: distance(des, word) }))
        .filter((item) => item.distance > 0 && item.distance <= radius)
        .sort((a, b) => a.distance - b.distance);
      const value = candidates.find((item) => isValueWord(item.word.text));
      const nonNcValue = candidates.find(
        (item) =>
          isValueWord(item.word.text) &&
          !/(?:NC|OPEN|DNP)/i.test(item.word.text),
      );
      if (value && /(?:NC|OPEN|DNP)/i.test(value.word.text) && !nonNcValue) {
        nc.add(des.text.toUpperCase());
      }
    }
  }
  return nc;
}

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
