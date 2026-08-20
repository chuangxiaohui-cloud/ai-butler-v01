/**
 * 对照 PDF 扫描结果与 365IPC_TOTAL_BOM_0307.xls（需先运行 scripts/bom_reference.py）。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDocumentFile } from '../src/search/document-parser.js';
import { extractBomRows } from '../src/skills/schematic-bom/index.js';
import { applyBomChangeNotes, parseBomChangeNotes } from '../src/skills/schematic-bom/changes.js';
import {
  extractCoordinateBomRows,
  extractLikelyPinNames,
  extractNcDesignators,
  extractPdfSymbolPages,
} from '../src/skills/schematic-bom/coordinates.js';

const REF_PATH = join(process.cwd(), 'data', 'bom-reference.json');
const DESIGNATOR_RE =
  /^(?:SW|CON|TP|R|C|L|D|Q|U|Y|J|X|F|T|K|P)\d{1,4}$/i;

const TARGETS = [
  { pdf: 'dm365_ip_cam_mb_v1_1b.pdf', sheet: 'MAIN' },
  { pdf: 'dm365_ip_cam_pb_v1_1b.pdf', sheet: 'POE' },
  { pdf: 'dm365_ip_cam_lb_v1_1b.pdf', sheet: 'LENS' },
];

function splitRefdes(raw: string): string[] {
  return raw
    .toUpperCase()
    .split(/[\s,，;；/]+/)
    .map((s) => s.trim())
    .filter((s) => DESIGNATOR_RE.test(s));
}

const reference = JSON.parse(readFileSync(REF_PATH, 'utf-8')) as {
  sheets: Array<{ name: string; rows: Array<{ item: string; refdes: string }> }>;
};

const results = [];
for (const target of TARGETS) {
  const sheet = reference.sheets.find((s) => s.name === target.sheet);
  const refDes = new Set<string>();
  for (const row of sheet?.rows ?? []) {
    for (const des of splitRefdes(row.refdes)) refDes.add(des);
  }
  const buffer = readFileSync(join(process.cwd(), target.pdf));
  const text = await parseDocumentFile({
    name: target.pdf,
    type: 'application/pdf',
    size: buffer.byteLength,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  });
  const extracted = new Set<string>();
  for (const row of extractBomRows(text)) {
    for (const des of row.designators) extracted.add(des.toUpperCase());
  }
  const pages = await extractPdfSymbolPages(buffer);
  const coordinateRows = extractCoordinateBomRows(pages);
  const changedRows = applyBomChangeNotes(coordinateRows, parseBomChangeNotes(text));
  const coordinateExtracted = new Set<string>();
  for (const row of coordinateRows) {
    for (const des of row.designators) coordinateExtracted.add(des.toUpperCase());
  }
  const changedExtracted = new Set<string>();
  for (const row of changedRows) {
    for (const des of row.designators) changedExtracted.add(des.toUpperCase());
  }
  const pinNames = extractLikelyPinNames(pages);
  const hybridExtracted = new Set(
    [...extracted].filter((des) => !pinNames.has(des)),
  );
  const ncDesignators = extractNcDesignators(pages);
  const ncFiltered = new Set(
    [...extracted].filter((des) => !ncDesignators.has(des)),
  );
  const found = [...refDes].filter((des) => extracted.has(des));
  const coordinateFound = [...refDes].filter((des) => coordinateExtracted.has(des));
  const changedFound = [...refDes].filter((des) => changedExtracted.has(des));
  const hybridFound = [...refDes].filter((des) => hybridExtracted.has(des));
  const ncFilteredFound = [...refDes].filter((des) => ncFiltered.has(des));
  const missing = [...refDes].filter((des) => !extracted.has(des));
  const extra = [...extracted].filter((des) => !refDes.has(des));
  const coordinateMissing = [...refDes].filter(
    (des) => !coordinateExtracted.has(des),
  );
  const coordinateExtra = [...coordinateExtracted].filter(
    (des) => !refDes.has(des),
  );
  const changedExtra = [...changedExtracted].filter((des) => !refDes.has(des));
  const hybridExtra = [...hybridExtracted].filter((des) => !refDes.has(des));
  const ncFilteredExtra = [...ncFiltered].filter((des) => !refDes.has(des));
  results.push({
    pdf: target.pdf,
    sheet: target.sheet,
    refCount: refDes.size,
    extractedCount: extracted.size,
    foundCount: found.length,
    recall: refDes.size > 0 ? found.length / refDes.size : 0,
    precision: extracted.size > 0 ? found.length / extracted.size : 0,
    coordinateExtractedCount: coordinateExtracted.size,
    coordinateFoundCount: coordinateFound.length,
    coordinateRecall:
      refDes.size > 0 ? coordinateFound.length / refDes.size : 0,
    coordinatePrecision:
      coordinateExtracted.size > 0
        ? coordinateFound.length / coordinateExtracted.size
        : 0,
    changedExtractedCount: changedExtracted.size,
    changedFoundCount: changedFound.length,
    changedRecall: refDes.size > 0 ? changedFound.length / refDes.size : 0,
    changedPrecision:
      changedExtracted.size > 0 ? changedFound.length / changedExtracted.size : 0,
    hybridExtractedCount: hybridExtracted.size,
    hybridFoundCount: hybridFound.length,
    hybridRecall: refDes.size > 0 ? hybridFound.length / refDes.size : 0,
    hybridPrecision:
      hybridExtracted.size > 0 ? hybridFound.length / hybridExtracted.size : 0,
    ncFilteredExtractedCount: ncFiltered.size,
    ncFilteredFoundCount: ncFilteredFound.length,
    ncFilteredRecall: refDes.size > 0 ? ncFilteredFound.length / refDes.size : 0,
    ncFilteredPrecision:
      ncFiltered.size > 0 ? ncFilteredFound.length / ncFiltered.size : 0,
    missingSample: missing.slice(0, 30),
    extraSample: extra.slice(0, 30),
    coordinateMissingSample: coordinateMissing.slice(0, 30),
    coordinateExtraSample: coordinateExtra.slice(0, 30),
    changedMissingSample: [...refDes]
      .filter((des) => !changedExtracted.has(des))
      .slice(0, 30),
    changedExtraSample: changedExtra.slice(0, 30),
    hybridMissingSample: [...refDes]
      .filter((des) => !hybridExtracted.has(des))
      .slice(0, 30),
    hybridExtraSample: hybridExtra.slice(0, 30),
    ncFilteredMissingSample: [...refDes]
      .filter((des) => !ncFiltered.has(des))
      .slice(0, 30),
    ncFilteredExtraSample: ncFilteredExtra.slice(0, 30),
  });
}
console.log(JSON.stringify(results, null, 2));
