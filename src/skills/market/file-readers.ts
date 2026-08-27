/**
 * E254：市场 Skill 文件工具（PDF 速读 / 表格速读 / PDF 压缩）
 * 被 scripts/market-*.ts 薄包装调用；python 子进程经可注入 run 便于单测。
 * E251 输入通道：input.txt 内容 = 用户 query（含触发词）；本模块从中提取目标文件路径
 * （首行即路径 / 单行「路径 关键词」/ 带触发词的自然语言均可），其余词作为参数/关键词。
 * 用户文本只经文件通道注入，不进入命令行。
 */

import { spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARAMS } from '../../config/params.js';
import { parseDocumentFile } from '../../search/document-parser.js';
import type { RawFileLike } from '../deps.js';

const XLS_READ_SCRIPT = fileURLToPath(new URL('../../../scripts/office_xls_read.py', import.meta.url));
const PDF_COMPRESS_SCRIPT = fileURLToPath(new URL('../../../scripts/office_pdf_compress.py', import.meta.url));
const PYTHON_CANDIDATES = ['python', 'python3'];

export interface InputArgs {
  /** 目标文件路径（从输入文本提取） */
  path: string;
  /** 其余词：参数/关键词 */
  args: string[];
}

/** 是否形如文件路径（盘符/UNC/绝对 POSIX） */
function isPathLike(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || /^\//.test(value);
}

/** 从文本中提取第一个路径形态子串（支持引号包裹、Windows/UNC/POSIX；去尾部标点） */
export function extractFilePath(text: string): string | null {
  const quoted = text.match(/"([^"\r\n]+)"/);
  if (quoted && isPathLike(quoted[1])) return quoted[1];
  const candidates = [
    text.match(/([A-Za-z]:[\\/][^\s"'<>|]+)/),
    text.match(/(\\\\[^\\\s]+\\[^\s"'<>|]+)/),
    text.match(/(\/[^\s"'<>|]+)/),
  ];
  for (const match of candidates) {
    if (match) {
      return match[1].replace(/[。，,;；)）\]】、]+$/, '');
    }
  }
  return null;
}

/**
 * 把 input.txt 内容解析为 [path, ...args]：
 * - 优先「首行即路径」；否则从整段文本提取路径（含触发词的自然语言 query 可用）；
 * - 其余词（按空白切分）作为参数/关键词；行数与词数有界（防超长输入）。
 */
export function parseInputArgs(text: string, maxLines = 32): InputArgs {
  const normalized = text.trim();
  const path = extractFilePath(normalized);
  if (!path) {
    throw new Error('未找到文件路径：请提供目标文件绝对路径（如 M:\\dir\\file.pdf）');
  }
  const rest = normalized
    .replace('"' + path + '"', '')
    .replace(path, '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, maxLines);
  return { path, args: rest };
}

export interface PythonRunResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export type RunPythonFn = (script: string, args: string[], timeoutMs: number) => Promise<PythonRunResult>;

/** 默认 python 子进程执行（候选解释器顺序尝试 + 有界超时，[P-111]/[P-112]） */
export function defaultRunPython(script: string, args: string[], timeoutMs: number): Promise<PythonRunResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: PythonRunResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(result);
    };

    const tryRun = (index: number): void => {
      if (settled) return;
      if (index >= PYTHON_CANDIDATES.length) {
        finish({
          ok: false,
          status: null,
          stdout: '',
          stderr: '',
          error: `python 子进程启动失败（已尝试 ${PYTHON_CANDIDATES.join('、')}）`,
        });
        return;
      }
      const bin = PYTHON_CANDIDATES[index];
      let out = '';
      let errOut = '';
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(bin, [script, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch {
        tryRun(index + 1);
        return;
      }
      timer = setTimeout(() => {
        child.kill();
        finish({ ok: false, status: null, stdout: out, stderr: errOut, error: `python 子进程超时（${timeoutMs}ms）` });
      }, timeoutMs);
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        out += chunk;
      });
      child.stderr?.on('data', (chunk: string) => {
        errOut += chunk;
      });
      child.on('error', (err) => {
        // ENOENT（解释器缺失）→ 尝试下一个候选；其他错误直接归因
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          tryRun(index + 1);
          return;
        }
        finish({ ok: false, status: null, stdout: out, stderr: errOut, error: err.message });
      });
      child.on('close', (code) => {
        if (code === 0) {
          finish({ ok: true, status: code, stdout: out, stderr: errOut });
        } else {
          finish({ ok: false, status: code, stdout: out, stderr: errOut, error: errOut.trim() || `python exit ${code}` });
        }
      });
    };

    tryRun(0);
  });
}

export interface PdfSummary {
  ok: boolean;
  chars: number;
  lines: number;
  preview: string;
  hits: Array<{ keyword: string; found: boolean }>;
  error?: string;
}

/** PDF/文本速读摘要：字符数/行数/前 500 字预览 + 关键词命中（复用 parseDocumentFile） */
export async function readPdfTextSummary(
  filePath: string,
  keywords: string[] = [],
  readText: (file: RawFileLike) => Promise<string> = parseDocumentFile,
): Promise<PdfSummary> {
  try {
    const buffer = readFileSync(filePath);
    const name = filePath.split(/[\\/]/).pop() ?? 'input.pdf';
    const isPdf = /\.pdf$/i.test(name);
    const text = await readText({
      name,
      type: isPdf ? 'application/pdf' : 'text/plain',
      size: buffer.byteLength,
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    });
    return {
      ok: true,
      chars: text.length,
      lines: text.split('\n').length,
      preview: text.slice(0, 500),
      hits: keywords.map((keyword) => ({ keyword, found: text.includes(keyword) })),
    };
  } catch (err) {
    return {
      ok: false,
      chars: 0,
      lines: 0,
      preview: '',
      hits: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface TableSummary {
  ok: boolean;
  headers: string[];
  rowCount: number;
  previewRows: string[][];
  hits: Array<{ keyword: string; rows: number }>;
  error?: string;
}

/** 表格（xls/xlsx）速读摘要：表头/行数/前 5 行 + 关键词命中行数（经 office_xls_read.py，[P-112]） */
export async function readTableSummary(
  filePath: string,
  keywords: string[] = [],
  run: RunPythonFn = defaultRunPython,
): Promise<TableSummary> {
  const result = await run(XLS_READ_SCRIPT, [filePath], PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return {
      ok: false,
      headers: [],
      rowCount: 0,
      previewRows: [],
      hits: [],
      error: result.error ?? result.stderr?.trim() ?? '表格读取失败',
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { ok: boolean; headers?: string[]; rows?: string[][]; error?: string };
    if (!parsed.ok) {
      return { ok: false, headers: [], rowCount: 0, previewRows: [], hits: [], error: parsed.error ?? '表格读取失败' };
    }
    const rows = parsed.rows ?? [];
    const headers = parsed.headers ?? [];
    const keywordCounts = keywords.map((keyword) => ({
      keyword,
      rows: rows.filter((row) => row.some((cell) => cell.includes(keyword))).length,
    }));
    return {
      ok: true,
      headers,
      rowCount: rows.length,
      previewRows: rows.slice(0, 5),
      hits: keywordCounts,
    };
  } catch (err) {
    return {
      ok: false,
      headers: [],
      rowCount: 0,
      previewRows: [],
      hits: [],
      error: `表格读取结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface CompressSummary {
  ok: boolean;
  outputPath?: string;
  pages?: number;
  sizeBefore?: number;
  sizeAfter?: number;
  method?: string;
  error?: string;
}

/** PDF 压缩摘要：报告压缩前后体积/页数/方法（经 office_pdf_compress.py，[P-112]） */
export async function compressPdf(
  inputPath: string,
  outputPath: string,
  maxKb: number | null,
  run: RunPythonFn = defaultRunPython,
): Promise<CompressSummary> {
  const args = [inputPath, outputPath];
  if (maxKb !== null && maxKb > 0) args.push(String(maxKb));
  const result = await run(PDF_COMPRESS_SCRIPT, args, PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return {
      ok: false,
      error: result.error ?? result.stderr?.trim() ?? 'PDF 压缩失败',
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path?: string;
      pages?: number;
      size_before?: number;
      size_after?: number;
      method?: string;
      error?: string;
    };
    if (!parsed.ok) {
      return { ok: false, error: parsed.error ?? 'PDF 压缩失败' };
    }
    return {
      ok: true,
      outputPath: parsed.path,
      pages: parsed.pages,
      sizeBefore: parsed.size_before,
      sizeAfter: parsed.size_after,
      method: parsed.method,
    };
  } catch (err) {
    return {
      ok: false,
      error: `PDF 压缩结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
const PDF_MERGE_SCRIPT = fileURLToPath(new URL('../../../scripts/office_pdf_merge.py', import.meta.url));
const PDF_ENCRYPT_SCRIPT = fileURLToPath(new URL('../../../scripts/office_pdf_encrypt.py', import.meta.url));
const IMAGE_CONVERT_SCRIPT = fileURLToPath(new URL('../../../scripts/office_image_convert.py', import.meta.url));

const IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

/** 从文本中提取全部路径形态子串（按出现顺序去重；供多文件输入如 PDF 合并，E255） */
export function extractFilePaths(text: string, maxPaths = 8): string[] {
  const clean = (value: string): string => value.replace(/[。，,;；)）\]】、]+$/, '');
  const found: Array<{ index: number; path: string }> = [];
  // 引号包裹的路径优先（可含空格），保持原位置
  for (const match of text.matchAll(/"([^"\r\n]+)"/g)) {
    if (isPathLike(match[1]) && !found.some((f) => f.path === clean(match[1]))) {
      found.push({ index: match.index ?? 0, path: clean(match[1]) });
    }
  }
  // 其余文本中的裸路径（引号段用等长空格占位，索引不变）
  const rest = text.replace(/"([^"\r\n]+)"/g, (m) => ' '.repeat(m.length));
  const re = /[A-Za-z]:[\\/][^\s"'<>|]+|\\\\[^\\\s]+\\[^\s"'<>|]+|\/[^\s"'<>|]+/g;
  for (const match of rest.matchAll(re)) {
    if (!found.some((f) => f.path === clean(match[0]))) {
      found.push({ index: match.index ?? 0, path: clean(match[0]) });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((f) => f.path).slice(0, maxPaths);
}

export interface MergeSummary {
  ok: boolean;
  outputPath?: string;
  files?: number;
  pages?: number;
  error?: string;
}

/** PDF 合并：office_pdf_merge.py <output> <in1> [in2...]（[P-112]） */
export async function mergePdfs(
  inputPaths: string[],
  outputPath: string,
  run: RunPythonFn = defaultRunPython,
): Promise<MergeSummary> {
  if (inputPaths.length < 2) {
    return { ok: false, error: 'PDF 合并至少需要 2 个输入文件' };
  }
  const result = await run(PDF_MERGE_SCRIPT, [outputPath, ...inputPaths], PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return { ok: false, error: result.error ?? result.stderr?.trim() ?? 'PDF 合并失败' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path?: string;
      files?: number;
      pages?: number;
      error?: string;
    };
    if (!parsed.ok) return { ok: false, error: parsed.error ?? 'PDF 合并失败' };
    return { ok: true, outputPath: parsed.path, files: parsed.files, pages: parsed.pages };
  } catch (err) {
    return {
      ok: false,
      error: `PDF 合并结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface EncryptSummary {
  ok: boolean;
  outputPath?: string;
  pages?: number;
  password?: string;
  error?: string;
}

/** PDF 加密：office_pdf_encrypt.py <in> <out> [password]（[P-112]，缺省 123456） */
export async function encryptPdf(
  inputPath: string,
  outputPath: string,
  password: string | null,
  run: RunPythonFn = defaultRunPython,
): Promise<EncryptSummary> {
  const args = [inputPath, outputPath];
  if (password !== null && password.length > 0) args.push(password);
  const result = await run(PDF_ENCRYPT_SCRIPT, args, PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return { ok: false, error: result.error ?? result.stderr?.trim() ?? 'PDF 加密失败' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path?: string;
      pages?: number;
      password?: string;
      error?: string;
    };
    if (!parsed.ok) return { ok: false, error: parsed.error ?? 'PDF 加密失败' };
    return { ok: true, outputPath: parsed.path, pages: parsed.pages, password: parsed.password };
  } catch (err) {
    return {
      ok: false,
      error: `PDF 加密结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface ConvertSummary {
  ok: boolean;
  outputPath?: string;
  format?: string;
  width?: number;
  height?: number;
  size?: number;
  error?: string;
}

/** 图片格式转换：office_image_convert.py <in> <out> <format>（[P-112]；png/jpg/webp/bmp） */
export async function convertImage(
  inputPath: string,
  outputPath: string,
  format: string,
  run: RunPythonFn = defaultRunPython,
): Promise<ConvertSummary> {
  const fmt = format.toLowerCase();
  if (!IMAGE_FORMATS.has(fmt)) {
    return { ok: false, error: `不支持的图片格式：${format}（支持 png/jpg/jpeg/webp/bmp）` };
  }
  const result = await run(IMAGE_CONVERT_SCRIPT, [inputPath, outputPath, fmt], PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return { ok: false, error: result.error ?? result.stderr?.trim() ?? '图片格式转换失败' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path?: string;
      format?: string;
      width?: number;
      height?: number;
      size?: number;
      error?: string;
    };
    if (!parsed.ok) return { ok: false, error: parsed.error ?? '图片格式转换失败' };
    return {
      ok: true,
      outputPath: parsed.path,
      format: parsed.format,
      width: parsed.width,
      height: parsed.height,
      size: parsed.size,
    };
  } catch (err) {
    return {
      ok: false,
      error: `图片格式转换结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}


const OCR_SCRIPT = fileURLToPath(new URL('../../../scripts/office_image_ocr.py', import.meta.url));
const BOM_COMPARE_SCRIPT = fileURLToPath(new URL('../../../scripts/office_bom_compare.py', import.meta.url));
const DOCX_TO_PDF_SCRIPT = fileURLToPath(new URL('../../../scripts/office_docx_to_pdf.py', import.meta.url));
const DOCX_READ_SCRIPT = fileURLToPath(new URL('../../../scripts/office_docx_read.py', import.meta.url));
const DOC_READ_SCRIPT = fileURLToPath(new URL('../../../scripts/office_doc_read.py', import.meta.url));

export interface OcrTableSummary {
  ok: boolean;
  rows: number;
  cols: number;
  csv: string;
  grid: string[][];
  warnings: Array<Record<string, unknown>>;
  outputPath?: string;
  error?: string;
}

/** 表格 OCR（图片/PDF → 表格结构 + CSV，经 office_image_ocr.py --table，[P-112]；RapidOCR 引擎） */
export async function ocrTable(
  inputPath: string,
  outputCsv: string | null,
  run: RunPythonFn = defaultRunPython,
): Promise<OcrTableSummary> {
  const args = ['--table', inputPath];
  if (outputCsv !== null && outputCsv.length > 0) args.push(outputCsv);
  const result = await run(OCR_SCRIPT, args, PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return {
      ok: false,
      rows: 0,
      cols: 0,
      csv: '',
      grid: [],
      warnings: [],
      error: result.error ?? result.stderr?.trim() ?? '表格 OCR 失败',
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      rows?: number;
      cols?: number;
      csv?: string;
      grid?: string[][];
      warnings?: Array<Record<string, unknown>>;
      error?: string;
    };
    if (!parsed.ok) {
      return {
        ok: false,
        rows: 0,
        cols: 0,
        csv: '',
        grid: [],
        warnings: [],
        error: parsed.error ?? '表格 OCR 失败',
      };
    }
    return {
      ok: true,
      rows: parsed.rows ?? 0,
      cols: parsed.cols ?? 0,
      csv: parsed.csv ?? '',
      grid: parsed.grid ?? [],
      warnings: parsed.warnings ?? [],
      outputPath: outputCsv ?? undefined,
    };
  } catch (err) {
    return {
      ok: false,
      rows: 0,
      cols: 0,
      csv: '',
      grid: [],
      warnings: [],
      error: `表格 OCR 结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface BomDiffItem {
  key: string;
  fields: Array<{ field: string; before: string; after: string }>;
}

export interface BomCompareSummary {
  ok: boolean;
  fileA: string;
  fileB: string;
  keyColumnA: string;
  keyColumnB: string;
  rowsA: number;
  rowsB: number;
  common: number;
  onlyACount: number;
  onlyBCount: number;
  changedCount: number;
  onlyInA: string[];
  onlyInB: string[];
  changed: BomDiffItem[];
  error?: string;
}

/** BOM 对比：按位号列对齐两个表格（xls/xlsx），输出 公共/仅 A/仅 B/变更 四类差异（经 office_bom_compare.py，[P-112]） */
export async function compareBoms(
  fileA: string,
  fileB: string,
  keyHint: string | null,
  run: RunPythonFn = defaultRunPython,
): Promise<BomCompareSummary> {
  const args = [fileA, fileB];
  if (keyHint !== null && keyHint.length > 0) args.push(keyHint);
  const result = await run(BOM_COMPARE_SCRIPT, args, PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return {
      ok: false,
      fileA,
      fileB,
      keyColumnA: '',
      keyColumnB: '',
      rowsA: 0,
      rowsB: 0,
      common: 0,
      onlyACount: 0,
      onlyBCount: 0,
      changedCount: 0,
      onlyInA: [],
      onlyInB: [],
      changed: [],
      error: result.error ?? result.stderr?.trim() ?? 'BOM 对比失败',
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      key_column_a?: string;
      key_column_b?: string;
      rows_a?: number;
      rows_b?: number;
      common?: number;
      only_a_count?: number;
      only_b_count?: number;
      changed_count?: number;
      only_in_a?: string[];
      only_in_b?: string[];
      changed?: BomDiffItem[];
      error?: string;
    };
    if (!parsed.ok) {
      return {
        ok: false,
        fileA,
        fileB,
        keyColumnA: '',
        keyColumnB: '',
        rowsA: 0,
        rowsB: 0,
        common: 0,
        onlyACount: 0,
        onlyBCount: 0,
        changedCount: 0,
        onlyInA: [],
        onlyInB: [],
        changed: [],
        error: parsed.error ?? 'BOM 对比失败',
      };
    }
    return {
      ok: true,
      fileA,
      fileB,
      keyColumnA: parsed.key_column_a ?? '',
      keyColumnB: parsed.key_column_b ?? '',
      rowsA: parsed.rows_a ?? 0,
      rowsB: parsed.rows_b ?? 0,
      common: parsed.common ?? 0,
      onlyACount: parsed.only_a_count ?? 0,
      onlyBCount: parsed.only_b_count ?? 0,
      changedCount: parsed.changed_count ?? 0,
      onlyInA: parsed.only_in_a ?? [],
      onlyInB: parsed.only_in_b ?? [],
      changed: parsed.changed ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      fileA,
      fileB,
      keyColumnA: '',
      keyColumnB: '',
      rowsA: 0,
      rowsB: 0,
      common: 0,
      onlyACount: 0,
      onlyBCount: 0,
      changedCount: 0,
      onlyInA: [],
      onlyInB: [],
      changed: [],
      error: `BOM 对比结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface DocConvertSummary {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

/** 文档互转（docx/doc → PDF，经 office_docx_to_pdf.py Word COM，[P-112]） */
export async function convertDocToPdf(
  inputPath: string,
  outputPath: string,
  run: RunPythonFn = defaultRunPython,
): Promise<DocConvertSummary> {
  const result = await run(DOCX_TO_PDF_SCRIPT, [inputPath, outputPath], PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return { ok: false, error: result.error ?? result.stderr?.trim() ?? '文档转 PDF 失败' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { ok: boolean; path?: string; error?: string };
    if (!parsed.ok) return { ok: false, error: parsed.error ?? '文档转 PDF 失败' };
    return { ok: true, outputPath: parsed.path ?? outputPath };
  } catch (err) {
    return {
      ok: false,
      error: `文档转 PDF 结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface DocSummary {
  ok: boolean;
  chars: number;
  lines: number;
  preview: string;
  hits: Array<{ keyword: string; found: boolean }>;
  error?: string;
}

/** 文档（docx/doc）速读摘要：字符数/行数/前 500 字预览 + 关键词命中（docx 走 python-docx、doc 走 Word COM，[P-112]） */
export async function readDocSummary(
  filePath: string,
  keywords: string[] = [],
  run: RunPythonFn = defaultRunPython,
): Promise<DocSummary> {
  const script = /\.docx$/i.test(filePath) ? DOCX_READ_SCRIPT : DOC_READ_SCRIPT;
  const result = await run(script, [filePath], PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return {
      ok: false,
      chars: 0,
      lines: 0,
      preview: '',
      hits: [],
      error: result.error ?? result.stderr?.trim() ?? '文档读取失败',
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { ok: boolean; text?: string; error?: string };
    if (!parsed.ok) {
      return { ok: false, chars: 0, lines: 0, preview: '', hits: [], error: parsed.error ?? '文档读取失败' };
    }
    const text = parsed.text ?? '';
    return {
      ok: true,
      chars: text.length,
      lines: text.split('\n').length,
      preview: text.slice(0, 500),
      hits: keywords.map((keyword) => ({ keyword, found: text.includes(keyword) })),
    };
  } catch (err) {
    return {
      ok: false,
      chars: 0,
      lines: 0,
      preview: '',
      hits: [],
      error: `文档读取结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

const DOCX_WRITE_SCRIPT = fileURLToPath(new URL('../../../scripts/office_docx_write.py', import.meta.url));
const PPTX_CREATE_SCRIPT = fileURLToPath(new URL('../../../scripts/office_pptx_create.py', import.meta.url));
const IMAGE_COMPRESS_SCRIPT = fileURLToPath(new URL('../../../scripts/compress_image.py', import.meta.url));

export interface DocxWriteSummary {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

/** 文本排版为 docx（office_docx_write.py：纯文本逐段写入，[P-112]） */
export async function writeDocx(
  inputTxt: string,
  outputDocx: string,
  run: RunPythonFn = defaultRunPython,
): Promise<DocxWriteSummary> {
  const result = await run(DOCX_WRITE_SCRIPT, [inputTxt, outputDocx], PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return { ok: false, error: result.error ?? result.stderr?.trim() ?? 'docx 生成失败' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { ok: boolean; path?: string; error?: string };
    if (!parsed.ok) return { ok: false, error: parsed.error ?? 'docx 生成失败' };
    return { ok: true, outputPath: parsed.path ?? outputDocx };
  } catch (err) {
    return {
      ok: false,
      error: `docx 生成结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface PptxSlideSpec {
  title: string;
  bullets: string[];
}

export interface PptxSummary {
  ok: boolean;
  outputPath?: string;
  slides?: number;
  error?: string;
}

/** 汇报 PPT 生成（office_pptx_create.py：JSON 规格 → pptx，[P-112]） */
export async function createPptx(
  title: string,
  slides: PptxSlideSpec[],
  outputPptx: string,
  run: RunPythonFn = defaultRunPython,
): Promise<PptxSummary> {
  const spec = { title, slides: slides.slice(0, 20) };
  const specPath = join(dirname(outputPptx), `${basename(outputPptx, extname(outputPptx))}.spec.json`);
  try {
    writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf-8');
  } catch (err) {
    return { ok: false, error: `写入 PPT 规格失败：${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    const result = await run(PPTX_CREATE_SCRIPT, [specPath, outputPptx], PARAMS.officePythonTimeoutMs); // [P-112]
    if (!result.ok || result.status !== 0) {
      return { ok: false, error: result.error ?? result.stderr?.trim() ?? 'PPT 生成失败' };
    }
    try {
      const parsed = JSON.parse(result.stdout) as { ok: boolean; path?: string; error?: string };
      if (!parsed.ok) return { ok: false, error: parsed.error ?? 'PPT 生成失败' };
      return { ok: true, outputPath: parsed.path ?? outputPptx, slides: slides.length + 1 };
    } catch (err) {
      return {
        ok: false,
        error: `PPT 生成结果解析失败：${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } finally {
    try {
      rmSync(specPath, { force: true });
    } catch {
      // 临时规格文件清理失败不影响结果
    }
  }
}

export interface ImageCompressSummary {
  ok: boolean;
  outputPath?: string;
  size?: number;
  width?: number;
  height?: number;
  error?: string;
}

/** 图片压缩到目标 KB（compress_image.py，[P-112]；缺省 200KB） */
export async function compressImage(
  inputPath: string,
  outputPath: string,
  maxKb: number | null,
  run: RunPythonFn = defaultRunPython,
): Promise<ImageCompressSummary> {
  const args = [inputPath, outputPath];
  if (maxKb !== null && maxKb > 0) args.push(String(maxKb));
  const result = await run(IMAGE_COMPRESS_SCRIPT, args, PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return { ok: false, error: result.error ?? result.stderr?.trim() ?? '图片压缩失败' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path?: string;
      size?: number;
      width?: number;
      height?: number;
      error?: string;
    };
    if (!parsed.ok) return { ok: false, error: parsed.error ?? '图片压缩失败' };
    return {
      ok: true,
      outputPath: parsed.path ?? outputPath,
      size: parsed.size,
      width: parsed.width,
      height: parsed.height,
    };
  } catch (err) {
    return {
      ok: false,
      error: `图片压缩结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface OcrTextSummary {
  ok: boolean;
  text: string;
  chars: number;
  outputPath?: string;
  hits: Array<{ keyword: string; found: boolean }>;
  error?: string;
}

/** 图片文字提取（office_image_ocr.py 普通模式，RapidOCR，[P-112]） */
export async function ocrText(
  inputPath: string,
  outputTxt: string | null,
  keywords: string[] = [],
  run: RunPythonFn = defaultRunPython,
): Promise<OcrTextSummary> {
  const args = [inputPath];
  if (outputTxt !== null && outputTxt.length > 0) args.push(outputTxt);
  const result = await run(OCR_SCRIPT, args, PARAMS.officePythonTimeoutMs); // [P-112]
  if (!result.ok || result.status !== 0) {
    return {
      ok: false,
      text: '',
      chars: 0,
      hits: [],
      error: result.error ?? result.stderr?.trim() ?? '图片文字提取失败',
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { ok: boolean; text?: string; chars?: number; error?: string };
    if (!parsed.ok) {
      return { ok: false, text: '', chars: 0, hits: [], error: parsed.error ?? '图片文字提取失败' };
    }
    const text = parsed.text ?? '';
    return {
      ok: true,
      text,
      chars: parsed.chars ?? text.length,
      outputPath: outputTxt ?? undefined,
      hits: keywords.map((keyword) => ({ keyword, found: text.includes(keyword) })),
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      chars: 0,
      hits: [],
      error: `图片文字提取结果解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
