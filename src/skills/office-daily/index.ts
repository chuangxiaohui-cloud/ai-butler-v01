/**
 * Skill: office-daily（生活助手办公日常）
 * table：考勤表模板；analyze：CSV 占比分析；email：回复邮件草稿落盘；
 * image：图片压缩到目标 KB；image_convert：图片格式转换；
 * merge_pdf：PDF 合并；encrypt_pdf：PDF 加密（Python pypdf）。
 */

import { spawn } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { RawFileLike, SkillDeps } from '../deps.js';
import { extractTimeExpression } from '../../agent/intent-feature.js';
import { parseTimeExpression, parseRepeatQuery } from '../../agent/time-expression.js';
import { ReminderStore } from '../../reminder/reminder-store.js';
import { loadCredentials } from '../../mail/credentials.js';
import { sendMail } from '../../mail/smtp.js';
import ExcelJS from 'exceljs';

type OfficeMode =
  | 'table'
  | 'analyze'
  | 'email'
  | 'image'
  | 'image_convert'
  | 'word_format'
  | 'to_pdf'
  | 'pdf_to_word'
  | 'merge_pdf'
  | 'encrypt_pdf'
  | 'pdf_compress'
  | 'pptx'
  | 'reminder'
  | 'image_ocr'
  | 'table_ocr'
  | 'unsupported';

const COMPRESS_SCRIPT = fileURLToPath(
  new URL('../../../scripts/compress_image.py', import.meta.url),
);
const PDF_MERGE_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_pdf_merge.py', import.meta.url),
);
const PDF_ENCRYPT_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_pdf_encrypt.py', import.meta.url),
);
const PDF_COMPRESS_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_pdf_compress.py', import.meta.url),
);
const IMAGE_CONVERT_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_image_convert.py', import.meta.url),
);
const IMAGE_OCR_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_image_ocr.py', import.meta.url),
);
const XLSX_READ_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_xlsx_read.py', import.meta.url),
);
const XLS_READ_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_xls_read.py', import.meta.url),
);
const DOC_READ_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_doc_read.py', import.meta.url),
);
const DOCX_TO_PDF_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_docx_to_pdf.py', import.meta.url),
);
const DOCX_FORMAT_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_docx_format.py', import.meta.url),
);
const DOCX_WRITE_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_docx_write.py', import.meta.url),
);
const PPTX_CREATE_SCRIPT = fileURLToPath(
  new URL('../../../scripts/office_pptx_create.py', import.meta.url),
);
const PYTHON_CANDIDATES = ['python', 'python3'];

export function buildAttendanceCsv(): string {
  const header = '序号,姓名,日期,上班时间,下班时间,状态,备注';
  const rows = Array.from({ length: 31 }, (_, i) => `${i + 1},,,,,,`);
  return `\uFEFF${[header, ...rows].join('\r\n')}\n`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export interface GroupShare {
  group: string;
  value: number;
  share: number;
}

export function computeGroupShare(
  rows: string[][],
  groupHeader: string,
  valueHeader: string,
): GroupShare[] {
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const groupIdx = headers.findIndex((h) => h.includes(groupHeader));
  const valueIdx = headers.findIndex((h) => h.includes(valueHeader));
  if (groupIdx < 0 || valueIdx < 0) return [];
  const groups = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const group = row[groupIdx]?.trim();
    const raw = row[valueIdx]?.replace(/[,，%]/g, '');
    const value = Number(raw);
    if (!group || !Number.isFinite(value)) continue;
    groups.set(group, (groups.get(group) ?? 0) + value);
  }
  const total = [...groups.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return [...groups.entries()]
    .map(([group, value]) => ({ group, value, share: value / total }))
    .sort((a, b) => b.value - a.value);
}

function modeFrom(query: string): OfficeMode {
  if (/PDF.*(合并|拼|合成)|(合并|拼).*PDF/.test(query)) return 'merge_pdf';
  if (/PDF.*(加密|加锁|设密码|加密码)|(加密|加锁|设密码|加密码).*PDF/.test(query)) return 'encrypt_pdf';
  if (/PDF.*(压缩|减小|优化|体积)|(压缩|减小|体积).*PDF/.test(query)) return 'pdf_compress';
  if (/识别.*(文字|图片)|提取.*(文字|文本)|图片.*(文字|识别)|扫描.*文字|OCR/i.test(query)) return 'image_ocr';
  if (/识别.*表格|提取.*表格|表格.*(识别|提取|转\s*(CSV|Excel|xlsx)|生成\s*(Excel|xlsx|表格文件))|图片.*表格|转成\s*(Excel|xlsx)|生成\s*表格文件/i.test(query)) return 'table_ocr';
  if (/转成\s*(png|jpe?g|webp|bmp)|图片.*(转|换).*格式|格式.*(转|换).*图片/i.test(query)) return 'image_convert';
  if (/转成PDF|转.*PDF|导出PDF|PDF导出/.test(query)) return 'to_pdf';
  if (/PDF.*(转|换)成Word|转成Word|转Word/.test(query)) return 'pdf_to_word';
  if (/PPT|幻灯片|汇报/.test(query)) return 'pptx';
  if (/格式转换/.test(query)) return 'unsupported';
  if (/Word|docx|排版|格式/.test(query)) return 'word_format';
  if (/主动提醒|提醒我|设置提醒|提醒/.test(query)) return 'reminder';
  if (/考勤|模板|表格/.test(query)) return 'table';
  if (/占比|比例|汇总|统计|分析/.test(query)) return 'analyze';
  if (/邮件|回复|写信|回复客户/.test(query)) return 'email';
  if (/压缩|减小|KB|体积/.test(query)) return 'image';
  return 'table';
}

function findDataFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type.startsWith('text/') ||
      /\.(csv|txt|md)$/i.test(f.name),
  );
}

function findImageFiles(input: SkillInput): RawFileLike[] {
  return input.rawFiles.filter(
    (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|heic|heif|tiff?|avif)$/i.test(f.name),
  );
}

function findImageFile(input: SkillInput): RawFileLike | undefined {
  return findImageFiles(input)[0];
}

function isSpreadsheet(input: SkillInput): boolean {
  return input.rawFiles.some(
    (f) =>
      f.type.includes('spreadsheet') ||
      /\.(xlsx|xlsm|xls|xlsb)$/i.test(f.name),
  );
}

function findXlsxFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type.includes('openxmlformats-spreadsheetml') ||
      f.type.includes('macroEnabled') ||
      /\.(xlsx|xlsm)$/i.test(f.name),
  );
}

function findXlsFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type.includes('excel') ||
      /\.(xls|xlsb)$/i.test(f.name),
  );
}

function findDocxFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type.includes('wordprocessingml') ||
      /\.docx$/i.test(f.name),
  );
}

function findTextDocFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type === 'text/markdown' ||
      f.type === 'text/plain' ||
      /\.(md|txt)$/i.test(f.name),
  );
}

function findLegacyDocFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) =>
      f.type === 'application/msword' ||
      /\.doc$/i.test(f.name),
  );
}

function findPdfFile(input: SkillInput): RawFileLike | undefined {
  return input.rawFiles.find(
    (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
  );
}

function findPdfFiles(input: SkillInput): RawFileLike[] {
  return input.rawFiles.filter(
    (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
  );
}

function targetImageFormat(query: string): string | undefined {
  const match = query.match(/转成\s*(png|jpe?g|webp|bmp)/i);
  return match?.[1].toLowerCase();
}

async function bufferFromFile(file: RawFileLike): Promise<Buffer> {
  const array = await file.arrayBuffer();
  return Buffer.from(array);
}

function extractEmailContext(query: string): string {
  return query
    .replace(/^(请|帮我|麻烦你)?(写|起草|生成)?(一封|一个)?(回复)?邮件[：:]?/, '')
    .trim();
}

/** E170：从查询中提取收件人邮箱（“给/发给/发送给/发送到/发送至 xxx@yyy.com”） */
function extractMailRecipient(query: string): string {
  return (
    query.match(
      /(?:给|发给|发送给|发送到|发送至)\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/,
    )?.[1]?.trim() ?? ''
  );
}

/** E170：从查询中提取邮件主题（“主题：…/标题：…”） */
function extractMailSubject(query: string): string {
  return query.match(/(?:主题|标题)[:：]\s*([^\n，。；,;]+)/)?.[1]?.trim() ?? '';
}

/** E170：从查询中提取邮件正文（优先“正文：…”，否则去关键词取剩余内容） */
function extractMailBody(query: string): string {
  const explicit = query.match(/(?:正文|内容)[:：]\s*([\s\S]+)/);
  if (explicit) return explicit[1].trim();
  return query
    .replace(
      /(?:发送|发给|发送给|发送到|发送至)\s*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      '',
    )
    .replace(/(?:主题|标题)[:：]\s*[^\n，。；,;]+/g, '')
    .replace(/发送邮件|把.*邮件.*发(?:出去|出)|发邮件|发信|帮我|请/g, '')
    .replace(/^[，。！!？?；;：:\s]+/, '')
    .trim();
}

/** E170：从草稿 Markdown 中解析标题（## 标题） */
function draftTitle(body: string): string {
  return body.match(/## 标题\s*\n([^\n]+)/)?.[1]?.trim() ?? '';
}

/** E170：从草稿 Markdown 中解析正文（## 正文） */
function draftText(body: string): string {
  const m = body.match(/## 正文\s*\n([\s\S]+)/);
  return m ? m[1].trim() : body.trim();
}

interface LatestDraft {
  to: string;
  subject: string;
  text: string;
  savedAt: number;
}

/** E170：落盘最近一次草稿，支持“把刚才那封发出去”两段式发送 */
function saveLatestDraft(mailDir: string, draft: { to: string; subject: string; text: string }): void {
  mkdirSync(mailDir, { recursive: true });
  const payload: LatestDraft = { ...draft, savedAt: Date.now() };
  writeFileSync(join(mailDir, 'latest-draft.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function loadLatestDraft(mailDir: string): LatestDraft | null {
  try {
    const raw = readFileSync(join(mailDir, 'latest-draft.json'), 'utf-8');
    const parsed = JSON.parse(raw) as LatestDraft;
    if (typeof parsed.to !== 'string' || typeof parsed.subject !== 'string' || typeof parsed.text !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let lastError: Error | null = null;
    const candidates = [
      ...(process.env.OFFICE_PYTHON ? [process.env.OFFICE_PYTHON] : []),
      ...PYTHON_CANDIDATES,
    ];
    const tryRun = (index: number): void => {
      if (index >= candidates.length) {
        reject(lastError ?? new Error('python 不可用'));
        return;
      }
      const child = spawn(candidates[index], args, {
        windowsHide: true,
      });
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c: string) => {
        out += c;
      });
      child.stderr.on('data', (c: string) => {
        err += c;
      });
      child.on('error', (e) => {
        lastError = e;
        tryRun(index + 1);
      });
      child.on('close', (code) => {
        if (code === 0) resolve(out);
        else {
          lastError = new Error(err.trim() || `python exit ${code}`);
          tryRun(index + 1);
        }
      });
    };
    tryRun(0);
  });
}

function safeName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'file';
}

const THEME_COLORS: Record<string, string> = {
  蓝色: '#4472C4',
  blue: '#4472C4',
  红色: '#C00000',
  red: '#C00000',
  绿色: '#70AD47',
  green: '#70AD47',
  橙色: '#ED7D31',
  orange: '#ED7D31',
  紫色: '#7030A0',
  purple: '#7030A0',
  青色: '#00B0F0',
  cyan: '#00B0F0',
  灰色: '#808080',
  gray: '#808080',
  grey: '#808080',
};

export function accentFromQuery(query: string): string | undefined {
  const hex = query.match(/#[0-9A-Fa-f]{6}/)?.[0];
  if (hex) return hex.toUpperCase();
  for (const [name, color] of Object.entries(THEME_COLORS)) {
    if (query.includes(name)) return color;
  }
  return undefined;
}

/** E172：疑似合并区域 warning，TSR 输出格式；Agent 侧如实告知用户。 */
export interface TableMergeWarning {
  type: 'merged_col' | 'merged_row' | 'merged_conflict';
  row: number;
  col: number;
  detail?: string;
}

/** E173：TSR 已还原的合并单元格（row/col 为 0 基，rowSpan/colSpan ≥ 1）。 */
export interface TableMerge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
}

/** E172：把 TSR warnings 转成答案提示文案；无警告返回空串。 */
export function tableWarningsNote(warnings: TableMergeWarning[]): string {
  if (warnings.length === 0) return '';
  const first = warnings[0];
  const kind =
    first.type === 'merged_conflict'
      ? '覆盖区有内容'
      : first.type === 'merged_col'
        ? '跨列合并'
        : '跨行合并';
  const where = first.detail ?? `第${first.row + 1}行第${first.col + 1}列${kind}`;
  return `；提示：检测到 ${warnings.length} 处疑似合并单元格无法自动还原（如${where}），已按普通文本逐格填充，请在 Excel 中核对后手动合并`;
}

/** E173：把 TSR merges 转成答案文案；无合并返回空串。 */
export function tableMergesNote(merges: TableMerge[]): string {
  if (merges.length === 0) return '';
  const cols = merges.filter((m) => m.colSpan > 1).length;
  const rows = merges.filter((m) => m.rowSpan > 1).length;
  return `；已还原 ${merges.length} 处合并单元格（跨列 ${cols} 处、跨行 ${rows} 处）`;
}

export function createOfficeDailySkill(opts?: {
  outDir?: string;
  mailDir?: string;
}): ExecutableSkill {
  return {
    name: 'office-daily',
    version: '0.1.0',
    triggers: [
      '考勤表',
      '模板',
      '部门占比',
      '占比',
      '回复邮件',
      '邮件',
      '压缩',
      '200KB',
      'PPT',
      'Word',
      'PDF',
      'xlsx',
    ],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      const outDir = opts?.outDir ?? join(process.cwd(), 'data', 'office');
      const mailDir = opts?.mailDir ?? join(process.cwd(), 'data', 'mail');
      mkdirSync(outDir, { recursive: true });
      const mode = modeFrom(input.query);

      if (mode === 'unsupported') {
        return {
          result: {
            answer: '这项能力还没接入，目前 office-daily 支持：考勤表模板、占比分析、回复邮件、图片压缩/格式转换、图片 OCR 文字提取、图片表格识别、Word 排版、Word↔PDF、PDF 合并/加密、PPT、主动提醒。',
          },
          confidence: 0.4,
        };
      }

      if (mode === 'to_pdf') {
        const file = findDocxFile(input) ?? findLegacyDocFile(input);
        if (!file) {
          return {
            result: { answer: '请上传 .docx / .doc 文档，我帮你转成 PDF。' },
            confidence: 0.4,
          };
        }
        try {
          const buffer = await bufferFromFile(file);
          const ext = file.name.match(/\.(docx?)$/i)?.[1] ?? 'docx';
          const tmpInput = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.${ext}`);
          const output = join(outDir, `转换-${Date.now()}.pdf`);
          writeFileSync(tmpInput, buffer);
          const stdout = await runPython([DOCX_TO_PDF_SCRIPT, tmpInput, output]);
          rmSync(tmpInput, { force: true });
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            path?: string;
            error?: string;
          };
          if (!result.ok) {
            return {
              result: { answer: `Word→PDF 失败：${result.error ?? '未知错误'}` },
              confidence: 0.2,
            };
          }
          return {
            result: { answer: `已生成 PDF：${result.path}`, path: result.path },
            confidence: 0.85,
            followUpAction: '需要合并多个文档、加页码或压缩 PDF，随时说。',
          };
        } catch (err) {
          return {
            result: {
              answer: `Word→PDF 失败：${err instanceof Error ? err.message : String(err)}`,
            },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'table') {
        const csv = buildAttendanceCsv();
        const path = join(outDir, `考勤表模板-${Date.now()}.csv`);
        writeFileSync(path, csv, 'utf-8');
        return {
          result: { answer: `已生成考勤表模板：${path}`, path, csv },
          confidence: 0.9,
          followUpAction: '可以按公司字段再调整列名，或让我填默认日期。',
        };
      }

      if (mode === 'analyze') {
        if (isSpreadsheet(input)) {
          const xlsx = findXlsxFile(input);
          const xls = findXlsFile(input);
          const file = xlsx ?? xls;
          if (!file) {
            return {
              result: {
                answer: '暂不支持该表格格式，请另存为 .xlsx/.xlsm 或 CSV 后上传。',
              },
              confidence: 0.4,
            };
          }
          try {
            const buffer = await bufferFromFile(file);
            const ext = xlsx ? 'xlsx' : (file.name.split('.').pop() ?? 'xls').toLowerCase();
            const tmpFile = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.${ext}`);
            writeFileSync(tmpFile, buffer);
            const stdout = await runPython([
              xlsx ? XLSX_READ_SCRIPT : XLS_READ_SCRIPT,
              tmpFile,
            ]);
            const parsed = JSON.parse(stdout.trim()) as {
              ok?: boolean;
              rows?: string[][];
              error?: string;
            };
            rmSync(tmpFile, { force: true });
            if (!parsed.ok || !parsed.rows) {
              return {
                result: { answer: `${ext} 解析失败：${parsed.error ?? '未知错误'}` },
                confidence: 0.2,
              };
            }
            const rows = parsed.rows;
            const shares = computeGroupShare(rows, '部门', '销售额');
            if (shares.length === 0) {
              return {
                result: {
                  answer: `已读取 ${ext}，但没有找到“部门”分组列和“销售额/人数/金额”数值列，请确认表头。`,
                  rows: rows.slice(0, 5),
                },
                confidence: 0.4,
              };
            }
            const total = shares.reduce((s, x) => s + x.value, 0);
            const answer =
              `各部门销售额占比（合计 ${total}）：\n` +
              shares.map((s) => `- ${s.group}：${s.value}（${(s.share * 100).toFixed(1)}%）`).join('\n');
            return {
              result: { answer, shares, total },
              confidence: 0.85,
              followUpAction: '需要按部门人数、成本等其他列重算，或导出分析表，随时说。',
            };
          } catch (err) {
            return {
              result: {
                answer: `表格解析失败：${err instanceof Error ? err.message : String(err)}`,
              },
              confidence: 0.2,
            };
          }
        }
        const file = findDataFile(input);
        if (!file) {
          return {
            result: {
              answer: '请上传 CSV 数据文件，并告诉我要按哪列分组、统计哪列，例如“算一下各部门销售额占比”。',
            },
            confidence: 0.4,
          };
        }
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const rows = parseCsv(buffer.toString('utf-8'));
          const shares = computeGroupShare(rows, '部门', '销售额');
          if (shares.length === 0) {
            return {
              result: {
                answer: '已读取 CSV，但没有找到“部门”分组列和“销售额/人数/金额”数值列，请确认表头。',
                rows: rows.slice(0, 5),
              },
              confidence: 0.4,
            };
          }
          const total = shares.reduce((s, x) => s + x.value, 0);
          const answer =
            `各部门销售额占比（合计 ${total}）：\n` +
            shares.map((s) => `- ${s.group}：${s.value}（${(s.share * 100).toFixed(1)}%）`).join('\n');
          return {
            result: { answer, shares, total },
            confidence: 0.85,
            followUpAction: '需要按部门人数、成本等其他列重算，或导出分析表，随时说。',
          };
        } catch (err) {
          return {
            result: {
              answer: `CSV 解析失败：${err instanceof Error ? err.message : String(err)}`,
            },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'word_format') {
        const legacyDoc = findLegacyDocFile(input);
        if (legacyDoc) {
          const output = join(outDir, `排版-${Date.now()}.docx`);
          try {
            const tmpDoc = join(outDir, `tmp-${Date.now()}-${safeName(legacyDoc.name)}.doc`);
            writeFileSync(tmpDoc, await bufferFromFile(legacyDoc));
            const stdout = await runPython([DOC_READ_SCRIPT, tmpDoc]);
            rmSync(tmpDoc, { force: true });
            const parsed = JSON.parse(stdout.trim()) as {
              ok?: boolean;
              text?: string;
              error?: string;
            };
            if (!parsed.ok || !parsed.text) {
              return {
                result: { answer: `doc 读取失败：${parsed.error ?? '未知错误'}` },
                confidence: 0.3,
              };
            }
            const tmpTxt = join(outDir, `tmp-${Date.now()}.txt`);
            writeFileSync(tmpTxt, parsed.text, 'utf-8');
            const stdout2 = await runPython([DOCX_WRITE_SCRIPT, tmpTxt, output]);
            rmSync(tmpTxt, { force: true });
            const result = JSON.parse(stdout2.trim()) as {
              ok?: boolean;
              path?: string;
              error?: string;
            };
            if (!result.ok) {
              return {
                result: { answer: `doc 排版失败：${result.error ?? '未知错误'}` },
                confidence: 0.3,
              };
            }
            return {
              result: { answer: `已生成排版副本：${result.path}`, path: result.path },
              confidence: 0.8,
              followUpAction: '需要统一标题样式、页边距或导出 PDF，随时说。',
            };
          } catch (err) {
            return {
              result: {
                answer: `doc 排版失败：${err instanceof Error ? err.message : String(err)}`,
              },
              confidence: 0.2,
            };
          }
        }
        const file =
          findDocxFile(input) ?? findTextDocFile(input) ?? findPdfFile(input);
        if (!file) {
          return {
            result: { answer: '请上传 .docx / .md / .txt / PDF 文档，我帮你统一排版后输出新文件。' },
            confidence: 0.4,
          };
        }
        try {
          const output = join(outDir, `排版-${Date.now()}.docx`);
          let stdout: string;
          if (/\.(md|txt)$/i.test(file.name) || file.type === 'text/markdown' || file.type === 'text/plain') {
            const text = (await bufferFromFile(file)).toString('utf-8');
            const tmpTxt = join(outDir, `tmp-${Date.now()}.txt`);
            writeFileSync(tmpTxt, text, 'utf-8');
            stdout = await runPython([DOCX_WRITE_SCRIPT, tmpTxt, output]);
            rmSync(tmpTxt, { force: true });
          } else if (findPdfFile(input)) {
            if (!deps.parseDocument) {
              return { result: { answer: 'PDF 解析管道未接入，暂时无法排版 PDF。' }, confidence: 0.4 };
            }
            const text = await deps.parseDocument(file);
            const tmpTxt = join(outDir, `tmp-${Date.now()}.txt`);
            writeFileSync(tmpTxt, text, 'utf-8');
            stdout = await runPython([DOCX_WRITE_SCRIPT, tmpTxt, output]);
            rmSync(tmpTxt, { force: true });
          } else {
            const buffer = await bufferFromFile(file);
            const tmpInput = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.docx`);
            writeFileSync(tmpInput, buffer);
            stdout = await runPython([DOCX_FORMAT_SCRIPT, tmpInput, output]);
            rmSync(tmpInput, { force: true });
          }
          const result = JSON.parse(stdout.trim()) as { ok?: boolean; path?: string; error?: string };
          if (!result.ok) {
            return { result: { answer: `Word 排版失败：${result.error ?? '未知错误'}` }, confidence: 0.2 };
          }
          return {
            result: { answer: `已生成排版副本：${result.path}`, path: result.path },
            confidence: 0.85,
            followUpAction: '需要统一标题样式、页边距或导出 PDF，随时说。',
          };
        } catch (err) {
          return {
            result: { answer: `Word 排版失败：${err instanceof Error ? err.message : String(err)}` },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'pdf_to_word') {
        const file = findPdfFile(input);
        if (!file || !deps.parseDocument) {
          return {
            result: { answer: '请上传 PDF 文件，且确认文档解析管道已接入。' },
            confidence: 0.4,
          };
        }
        try {
          const text = await deps.parseDocument(file);
          const tmpTxt = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.txt`);
          const output = join(outDir, `转换-${Date.now()}.docx`);
          writeFileSync(tmpTxt, text, 'utf-8');
          const stdout = await runPython([DOCX_WRITE_SCRIPT, tmpTxt, output]);
          rmSync(tmpTxt, { force: true });
          const result = JSON.parse(stdout.trim()) as { ok?: boolean; path?: string; error?: string };
          if (!result.ok) {
            return { result: { answer: `PDF→Word 失败：${result.error ?? '未知错误'}` }, confidence: 0.2 };
          }
          return {
            result: { answer: `已生成 Word：${result.path}`, path: result.path, characters: text.length },
            confidence: 0.8,
            followUpAction: 'PDF 转 Word 保留文本结构，复杂版式可能需要人工微调。',
          };
        } catch (err) {
          return {
            result: { answer: `PDF→Word 失败：${err instanceof Error ? err.message : String(err)}` },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'merge_pdf') {
        const files = findPdfFiles(input);
        if (files.length < 2) {
          return {
            result: { answer: '请上传至少两个 PDF 文件，我帮你合并成一个。' },
            confidence: 0.4,
          };
        }
        try {
          const output = join(outDir, `合并-${Date.now()}.pdf`);
          const tmpInputs: string[] = [];
          for (const file of files) {
            const buffer = await bufferFromFile(file);
            const tmp = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.pdf`);
            writeFileSync(tmp, buffer);
            tmpInputs.push(tmp);
          }
          const stdout = await runPython([PDF_MERGE_SCRIPT, output, ...tmpInputs]);
          for (const tmp of tmpInputs) rmSync(tmp, { force: true });
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            path?: string;
            files?: number;
            pages?: number;
            error?: string;
          };
          if (!result.ok) {
            return {
              result: { answer: `PDF 合并失败：${result.error ?? '未知错误'}` },
              confidence: 0.2,
            };
          }
          return {
            result: {
              answer: `已合并 ${files.length} 个 PDF：${result.path}（共 ${result.pages ?? 0} 页）`,
              path: result.path,
              pages: result.pages,
            },
            confidence: 0.85,
            followUpAction: '需要给合并后的 PDF 加密、压缩或继续追加文件，随时说。',
          };
        } catch (err) {
          return {
            result: {
              answer: `PDF 合并失败：${err instanceof Error ? err.message : String(err)}`,
            },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'encrypt_pdf') {
        const file = findPdfFile(input);
        if (!file) {
          return {
            result: { answer: '请上传要加密的 PDF 文件。' },
            confidence: 0.4,
          };
        }
        const password =
          input.query.match(/(?:密码|口令)[是为：:\s]*([A-Za-z0-9_@#.\-]+)/)?.[1] ?? '123456';
        try {
          const buffer = await bufferFromFile(file);
          const tmpInput = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.pdf`);
          const output = join(outDir, `加密-${Date.now()}.pdf`);
          writeFileSync(tmpInput, buffer);
          const stdout = await runPython([PDF_ENCRYPT_SCRIPT, tmpInput, output, password]);
          rmSync(tmpInput, { force: true });
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            path?: string;
            pages?: number;
            error?: string;
          };
          if (!result.ok) {
            return {
              result: { answer: `PDF 加密失败：${result.error ?? '未知错误'}` },
              confidence: 0.2,
            };
          }
          return {
            result: {
              answer: `已加密 PDF：${result.path}（密码 ${password}）`,
              path: result.path,
              pages: result.pages,
              password,
            },
            confidence: 0.85,
            followUpAction: '需要修改密码、取消加密或继续合并/压缩，随时说。',
          };
        } catch (err) {
          return {
            result: {
              answer: `PDF 加密失败：${err instanceof Error ? err.message : String(err)}`,
            },
            confidence: 0.2,
          };
        }
      }

            if (mode === 'pptx') {
        const title =
          input.query.replace(/帮我|做|一份|生成|项目|汇报|PPT/g, '').trim() || '项目汇报';
        let spec: {
          title: string;
          accent?: string;
          slides: Array<{ title: string; bullets: string[] }>;
        } = {
          title,
          accent: accentFromQuery(input.query),
          slides: [
            { title: '项目背景', bullets: ['概述项目目标', '当前阶段与问题'] },
            { title: '方案', bullets: ['核心方案', '关键路径'] },
            { title: '计划', bullets: ['里程碑', '资源安排'] },
            { title: '下一步', bullets: ['待办事项', '风险与对策'] },
          ],
        };
        if (deps.complete) {
          try {
            const raw = await deps.complete.complete(
              [
                {
                  role: 'user',
                  content:
                    '为项目汇报 PPT 生成 JSON，只输出 JSON：{"title":"...","slides":[{"title":"...","bullets":["..."]}]}，最多 4 页。主题：' +
                    input.query,
                },
              ],
              { temperature: 0.4, maxTokens: 800, json: true },
            );
            const start = raw.indexOf('{');
            const end = raw.lastIndexOf('}');
            if (start >= 0 && end > start) {
              const parsed = JSON.parse(raw.slice(start, end + 1)) as typeof spec;
              if (parsed?.title && Array.isArray(parsed.slides)) {
                spec = { ...parsed, accent: spec.accent };
              }
            }
          } catch {
            // LLM 生成失败时保留确定性模板
          }
        }
        try {
          const tmpJson = join(outDir, `tmp-${Date.now()}.json`);
          const output = join(outDir, `汇报-${Date.now()}.pptx`);
          writeFileSync(tmpJson, JSON.stringify(spec), 'utf-8');
          const stdout = await runPython([PPTX_CREATE_SCRIPT, tmpJson, output]);
          rmSync(tmpJson, { force: true });
          const result = JSON.parse(stdout.trim()) as { ok?: boolean; path?: string; error?: string };
          if (!result.ok) {
            return { result: { answer: `PPT 生成失败：${result.error ?? '未知错误'}` }, confidence: 0.2 };
          }
          return {
            result: { answer: `已生成项目汇报 PPT：${result.path}`, path: result.path, slides: spec.slides.length },
            confidence: 0.85,
            followUpAction: '需要换主题色、加图表或调整页数，随时说。',
          };
        } catch (err) {
          return {
            result: { answer: `PPT 生成失败：${err instanceof Error ? err.message : String(err)}` },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'reminder') {
        const userId = String(input.params?.userId ?? 'default');
        const store = new ReminderStore();
        try {
          // E163：列出待触发提醒
          if (/查.*提醒|有哪些提醒|列出提醒|看(下|看)?提醒/.test(input.query)) {
            const upcoming = store.list(userId).filter((r) => !r.fired);
            if (upcoming.length === 0) {
              return {
                result: { answer: '暂无待触发的提醒。' },
                confidence: 0.8,
                followUpAction: '需要设置新提醒，告诉我时间和内容即可。',
              };
            }
            return {
              result: {
                answer: `共 ${upcoming.length} 条待触发提醒：${upcoming
                  .map(
                    (r) =>
                      `${r.id}. ${new Date(r.remindAt).toLocaleString('zh-CN', { hour12: false })} ${r.message}`,
                  )
                  .join('；')}`,
              },
              confidence: 0.8,
              followUpAction: '要取消某条提醒，告诉我编号或内容关键词。',
            };
          }
          // E163：按编号或关键词取消提醒
          if (/取消.*提醒|删除.*提醒|去掉.*提醒/.test(input.query)) {
            const all = store.list(userId);
            const idMatch = input.query.match(/第\s*(\d+)\s*[条个]/);
            let removed = 0;
            if (idMatch) {
              const id = Number(idMatch[1]);
              const target = all.find((r) => r.id === id);
              if (target && store.cancel(id)) removed = 1;
            } else {
              const keyword = input.query
                .replace(/取消|删除|去掉|提醒/g, '')
                .replace(/[，。！!？?：:]/g, '')
                .trim();
              if (!keyword) {
                return {
                  result: { answer: '请告诉我要取消哪条提醒，例如“取消第 2 条提醒”或“取消开会提醒”。' },
                  confidence: 0.4,
                  followUpAction: '可以先“查一下提醒”看列表，再按编号或关键词取消。',
                };
              }
              for (const r of all) {
                if (r.message.includes(keyword) && store.cancel(r.id)) removed += 1;
              }
            }
            return removed > 0
              ? {
                  result: { answer: `已取消 ${removed} 条提醒。` },
                  confidence: 0.8,
                  followUpAction: '还需要调整其他提醒，随时说。',
                }
              : {
                  result: { answer: '没有找到要取消的提醒。' },
                  confidence: 0.5,
                  followUpAction: '可以用“查一下提醒”查看当前列表。',
                };
          }
          // E166：周期识别（每天/每周）与复杂周期诚实提示，共用 time-expression 助手
          const { repeat, timeExpression, complexPeriod } = parseRepeatQuery(input.query);
          if (complexPeriod) {
            return {
              result: {
                answer: '目前暂不支持工作日、每周末、每月等复杂周期提醒，支持“每天”“每周”循环提醒。',
              },
              confidence: 0.5,
              followUpAction: '例如“每天早上9点提醒我喝水”或“每周一9点提醒我开周会”。',
            };
          }
          if (!timeExpression) {
            return {
              result: { answer: '请告诉我提醒时间，例如“明天下午3点提醒我开会”或“每天早上9点提醒我喝水”。' },
              confidence: 0.4,
            };
          }
          const message =
            input.query
              .replace(/提醒我|帮我提醒|设置提醒|主动提醒|提醒/g, '')
              .replace(timeExpression, '')
              .replace(/每天|每日|天天|每周|每星期/g, '')
              .replace(/^每/, '')
              .replace(/[，。！!？?：:]/g, '')
              .trim() || '提醒';
          const { startAt } = parseTimeExpression(timeExpression);
          const reminder = store.add({
            userId,
            conversationId: String(input.params?.conversationId ?? ''),
            message,
            remindAt: Date.parse(startAt),
            repeat,
          });
          const repeatLabel = repeat === 'daily' ? '每天' : repeat === 'weekly' ? '每周' : '';
          return {
            result: {
              answer: `已设置${repeatLabel}提醒：${new Date(reminder.remindAt).toLocaleString('zh-CN', { hour12: false })} ${message}${repeat ? `（此后${repeatLabel}同一时间自动顺延）` : ''}`,
              id: reminder.id,
              remindAt: reminder.remindAt,
              repeat,
            },
            confidence: 0.9,
            followUpAction: '到点我会在事件流里推送提醒；需要改时间、查看或取消随时说。',
          };
        } finally {
          store.close();
        }
      }

      if (mode === 'email') {
        // E170：显式“发送/发出去/发给/发信”→ SMTP 发送（先取查询内信息，缺项回退最近草稿）
        const isSendIntent =
          /发送|发出去|发出|发信/.test(input.query) ||
          (!/^(请|帮我|麻烦你)?(写|起草|生成|草拟)/.test(input.query) && /发给/.test(input.query));
        if (isSendIntent) {
          const draft = loadLatestDraft(mailDir);
          const to = extractMailRecipient(input.query) || draft?.to || '';
          const subject = extractMailSubject(input.query) || draft?.subject || '';
          const text = extractMailBody(input.query) || draft?.text || '';
          if (!to) {
            return {
              result: { answer: '请告诉我要发送给谁，例如“发送邮件给 xxx@example.com，主题：…，正文：…”。' },
              confidence: 0.4,
            };
          }
          if (!subject) {
            return {
              result: { answer: '请补充邮件主题，例如“主题：下周方案”。' },
              confidence: 0.4,
            };
          }
          if (!text) {
            return {
              result: { answer: '请补充邮件正文，例如“正文：下周给您完整方案。”' },
              confidence: 0.4,
            };
          }
          const creds = loadCredentials(join(mailDir, 'mail-credentials.json'));
          if (!creds) {
            return {
              result: {
                answer:
                  '还没配置邮箱账号，我不会发送。请先运行 npm run mail:config 配置 SMTP 服务器、账号与授权码，例如：npm run mail:config -- --host smtp.qq.com --port 465 --secure 1 --user you@qq.com --pass <授权码> --from you@qq.com',
              },
              confidence: 0.4,
              followUpAction: '配置完成后再说“发送邮件给 …”即可发信。',
            };
          }
          try {
            const sent = await sendMail(creds, { to, subject, text });
            return {
              result: {
                answer: `邮件已发送：发件人 ${creds.from} → 收件人 ${sent.accepted}，主题：${subject}${sent.messageId ? `（Message-ID：${sent.messageId}）` : ''}`,
                from: creds.from,
                to: sent.accepted,
                subject,
                messageId: sent.messageId,
              },
              confidence: 0.9,
              followUpAction: '需要再写或发送其他邮件，随时说。',
            };
          } catch (err) {
            return {
              result: {
                answer: `邮件发送失败：${err instanceof Error ? err.message : String(err)}`,
              },
              confidence: 0.2,
              followUpAction: '请检查 data/mail/mail-credentials.json 的服务器/端口/授权码，或稍后重试。',
            };
          }
        }
        // E162：会议邀请草稿（主题+时间+参会人/议程占位）
        if (/会议邀请|邀请.*(参会|参加|来开会|开会|会议)|通知.*会议|会议.*通知/.test(input.query)) {
          const timeExpression = extractTimeExpression(input.query);
          const parsed = timeExpression ? parseTimeExpression(timeExpression) : null;
          const timeLabel = parsed ? timeExpression + '（' + parsed.startAt + '）' : '（请补充时间）';
          const topic =
            input.query
              .replace(/^(请|帮我|麻烦你)?(写|起草|生成)?(一封|一个)?(会议)?(邀请)?(邮件)?[：:]?/, '')
              .replace(timeExpression ?? '', '')
              .replace(/邀请.*(参会|参加|开会|来开会)|通知.*(参会|会议)/g, '')
              .replace(/^(开|召开|举办|组织)/, '')
              .replace(/[，。！!？?：:]/g, '')
              .trim() || '会议';
          const body = `# 会议邀请

## 标题
${topic}（${timeLabel}）

## 时间
${timeLabel}

## 参会人
- 

## 地点
（待补充）

## 议程
1. 
2. 

## 落款
您的助理`;
          const path = join(outDir, `会议邀请-${Date.now()}.md`);
          saveLatestDraft(mailDir, {
            to: extractMailRecipient(input.query),
            subject: topic,
            text: body.trim(),
          });
          writeFileSync(path, body.trim() + '\n', 'utf-8');
          return {
            result: { answer: `已生成会议邀请邮件草稿：${path}`, path, email: body.trim() },
            confidence: 0.8,
            followUpAction: '需要我把它加入日历并设置提醒，或调整参会人/议程，随时说。',
          };
        }
        const context = extractEmailContext(input.query);
        const body = deps.complete
          ? await deps.complete.complete(
              [
                {
                  role: 'user',
                  content:
                    '请写一封正式中文回复邮件草稿，包含标题和正文，落款用“您的助理”。\n\n需求：' +
                    (context || input.query),
                },
              ],
              { temperature: 0.4, maxTokens: 600 },
            )
          : `# 回复邮件\n\n## 标题\n${context || '回复：'}\n\n## 正文\n待补充。`;
        const path = join(outDir, `回复邮件-${Date.now()}.md`);
        saveLatestDraft(mailDir, {
          to: extractMailRecipient(input.query),
          subject: draftTitle(body) || context || '回复',
          text: draftText(body),
        });
        writeFileSync(path, body.trim() + '\n', 'utf-8');
        return {
          result: { answer: `已生成回复邮件草稿：${path}`, path, email: body.trim() },
          confidence: 0.8,
          followUpAction: '需要调整语气、补充附件说明，或转换成正式邮件格式，随时说。',
        };
      }

      if (mode === 'pdf_compress') {
        const file = findPdfFile(input);
        if (!file) {
          return {
            result: { answer: '请上传要压缩的 PDF 文件。' },
            confidence: 0.4,
          };
        }
        try {
          const buffer = await bufferFromFile(file);
          const tmpInput = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}.pdf`);
          const output = join(outDir, `压缩-${Date.now()}.pdf`);
          writeFileSync(tmpInput, buffer);
          const maxKb = /(\d+)\s*KB/i.exec(input.query)?.[1];
          const args = [PDF_COMPRESS_SCRIPT, tmpInput, output];
          if (maxKb) args.push(maxKb);
          const stdout = await runPython(args);
          rmSync(tmpInput, { force: true });
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            path?: string;
            pages?: number;
            size_before?: number;
            size_after?: number;
            method?: string;
            render?: boolean;
            dpi?: number;
            note?: string;
            target_not_met?: boolean;
            error?: string;
          };
          if (!result.ok) {
            return {
              result: { answer: `PDF 压缩失败：${result.error ?? '未知错误'}` },
              confidence: 0.2,
            };
          }
          const before = result.size_before ?? 0;
          const after = result.size_after ?? 0;
          const reduced = before > 0 ? ((before - after) / before * 100).toFixed(1) : '0.0';
          let answer =
            `已压缩 PDF：${result.path}（${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB，减小 ${reduced}%）`;
          if (result.note) {
            answer += `；${result.note}`;
          } else if (result.target_not_met) {
            answer += `；目标 ${maxKb}KB 未达到，建议用更低 DPI 重新导出。`;
          }
          return {
            result: {
              answer,
              path: result.path,
              pages: result.pages,
              sizeBefore: before,
              sizeAfter: after,
              method: result.method,
              render: result.render,
              dpi: result.dpi,
            },
            confidence: 0.85,
            followUpAction: '需要调整压缩强度、改目标体积，或换无损/低 DPI 策略，随时说。',
          };
        } catch (err) {
          return {
            result: {
              answer: `PDF 压缩失败：${err instanceof Error ? err.message : String(err)}`,
            },
            confidence: 0.2,
          };
        }
      }

      if (mode === 'image_ocr') {
        const imageFiles = findImageFiles(input);
        if (imageFiles.length === 0) {
          return {
            result: { answer: '请上传要识别文字的图片。' },
            confidence: 0.4,
          };
        }
        try {
          if (imageFiles.length === 1) {
            // E164：单图识别（既有链路）
            const file = imageFiles[0];
            const buffer = Buffer.from(await file.arrayBuffer());
            const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'file';
            const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) ?? [''])[0];
            const tmpInput = join(outDir, 'tmp-ocr-' + Date.now() + '-' + base + ext);
            const txtOutput = join(outDir, '识别文字-' + Date.now() + '.txt');
            writeFileSync(tmpInput, buffer);
            const stdout = await runPython([IMAGE_OCR_SCRIPT, tmpInput, txtOutput]);
            rmSync(tmpInput, { force: true });
            const result = JSON.parse(stdout.trim()) as {
              ok?: boolean;
              text?: string;
              chars?: number;
              error?: string;
            };
            if (!result.ok) {
              return {
                result: { answer: '图片文字识别失败：' + (result.error ?? '未知错误') },
                confidence: 0.2,
              };
            }
            const text = (result.text ?? '').trim();
            const preview = text.slice(0, 120) + (text.length > 120 ? '…' : '');
            return {
              result: {
                answer: text
                  ? '已识别图片文字（' + (result.chars ?? 0) + ' 字）：' + preview + '；完整文本已保存：' + txtOutput
                  : '未识别到文字；完整文本已保存：' + txtOutput,
                path: txtOutput,
                text,
                chars: result.chars ?? 0,
              },
              confidence: 0.8,
              followUpAction: '需要把识别结果整理成 Word/Markdown 或进一步翻译，随时说。',
            };
          }
          // E167：多图批量识别（单次引擎初始化）
          const tmpInputs = imageFiles.map((f, i) => {
            const base = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'image';
            const ext = (f.name.match(/\.[a-zA-Z0-9]+$/) ?? [''])[0];
            return join(outDir, `tmp-ocr-${Date.now()}-${i}-${base}${ext}`);
          });
          for (let i = 0; i < imageFiles.length; i++) {
            writeFileSync(tmpInputs[i], Buffer.from(await imageFiles[i].arrayBuffer()));
          }
          const txtOutput = join(outDir, '批量识别文字-' + Date.now() + '.txt');
          const stdout = await runPython([IMAGE_OCR_SCRIPT, '--batch', txtOutput, ...tmpInputs]);
          tmpInputs.forEach((p) => rmSync(p, { force: true }));
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            text?: string;
            chars?: number;
            error?: string;
            images?: Array<{ file: string; text: string; chars: number }>;
            errors?: string[];
          };
          if (!result.ok) {
            return {
              result: { answer: '批量图片文字识别失败：' + (result.error ?? '未知错误') },
              confidence: 0.2,
            };
          }
          const errors = result.errors ?? [];
          const total = result.chars ?? 0;
          const text = (result.text ?? '').trim();
          const preview = text.slice(0, 120) + (text.length > 120 ? '…' : '');
          const success = imageFiles.length - errors.length;
          const errorNote = errors.length > 0 ? `；未识别 ${errors.length} 张（${errors.join('；')}）` : '';
          return {
            result: {
              answer: text
                ? `已批量识别 ${success}/${imageFiles.length} 张图片（共 ${total} 字）：${preview}${errorNote}；完整文本已保存：${txtOutput}`
                : `已批量识别 ${success}/${imageFiles.length} 张图片（未识别到文字）${errorNote}；完整文本已保存：${txtOutput}`,
              path: txtOutput,
              text,
              chars: total,
              imageCount: imageFiles.length,
              errors,
            },
            confidence: 0.8,
            followUpAction: '需要把识别结果整理成 Word/Markdown 或进一步翻译，随时说。',
          };
        } catch (err) {
          return {
            result: { answer: '图片文字识别失败：' + (err instanceof Error ? err.message : String(err)) },
            confidence: 0.2,
          };
        }
      }
      if (mode === 'table_ocr') {
        // E168/E172/E173/E185：图片/PDF 表格结构识别 → .xlsx（exceljs）；TSR 输出含 bbox/span/merges，
        // 多页 PDF 跨页拼接（重复表头去重），无法还原的疑似合并区如实提示
        const file = findImageFile(input) ?? findPdfFile(input);
        if (!file) {
          return {
            result: { answer: '请上传要识别表格的图片或 PDF。' },
            confidence: 0.4,
          };
        }
        try {
          mkdirSync(outDir, { recursive: true });
          const buffer = Buffer.from(await file.arrayBuffer());
          const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'file';
          const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) ?? [''])[0];
          const tmpInput = join(outDir, 'tmp-table-' + Date.now() + '-' + base + ext);
          writeFileSync(tmpInput, buffer);
          const stdout = await runPython([IMAGE_OCR_SCRIPT, '--table', tmpInput]);
          rmSync(tmpInput, { force: true });
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            csv?: string;
            rows?: number;
            cols?: number;
            grid?: string[][];
            warnings?: TableMergeWarning[];
            merges?: TableMerge[];
            pages?: number;
            page_stitched?: boolean;
            error?: string;
          };
          if (!result.ok) {
            return {
              result: { answer: '表格识别失败：' + (result.error ?? '未知错误') },
              confidence: 0.2,
            };
          }
          const grid = Array.isArray(result.grid) ? result.grid : [];
          const xlsxPath = join(outDir, '表格识别-' + Date.now() + '.xlsx');
          const workbook = new ExcelJS.Workbook();
          const sheet = workbook.addWorksheet('表格识别');
          for (const rowCells of grid) sheet.addRow(rowCells);
          // E173：先写行再合并（mergeCells 会把覆盖区内容归并到锚点格），行列按 1 基换算
          const merges = Array.isArray(result.merges) ? result.merges : [];
          for (const m of merges) {
            sheet.mergeCells(m.row + 1, m.col + 1, m.row + m.rowSpan, m.col + m.colSpan);
          }
          await workbook.xlsx.writeFile(xlsxPath);
          const csvText = (result.csv ?? '').trim();
          const preview = csvText.slice(0, 120) + (csvText.length > 120 ? '…' : '');
          const warnings = Array.isArray(result.warnings) ? result.warnings : [];
          const multiPage =
            typeof result.pages === 'number' && result.pages > 1 ? result.pages + ' 页拼接 ' : '';
          return {
            result: {
              answer:
                '已识别表格（' + multiPage + (result.rows ?? 0) + ' 行 × ' + (result.cols ?? 0) + ' 列）：' +
                preview + '；XLSX 已保存：' + xlsxPath + tableMergesNote(merges) + tableWarningsNote(warnings),
              path: xlsxPath,
              csv: csvText,
              rows: result.rows ?? 0,
              cols: result.cols ?? 0,
              pages: result.pages ?? 1,
              pageStitched: result.page_stitched ?? false,
              warnings,
              merges,
            },
            confidence: 0.8,
            followUpAction: warnings.length
              ? '识别到无法自动还原的疑似合并区域，请在 Excel 中核对后手动合并'
              : merges.length
                ? '已还原合并单元格，需要调整合并范围或样式随时说'
                : '需要把表格继续转成 Word/PPT 或调整格式，随时说',
          };
        } catch (err) {
          return {
            result: { answer: '表格识别失败：' + (err instanceof Error ? err.message : String(err)) },
            confidence: 0.2,
          };
        }
      }
      if (mode === 'image_convert') {
        const target = targetImageFormat(input.query);
        const file = findImageFile(input);
        if (!target) {
          return {
            result: {
              answer: '请告诉我要转成的格式，例如“转成 PNG / JPG / WebP”。',
            },
            confidence: 0.4,
          };
        }
        if (!file) {
          return {
            result: { answer: `请上传要转成 ${target.toUpperCase()} 的图片。` },
            confidence: 0.4,
          };
        }
        try {
          const buffer = await bufferFromFile(file);
          const tmpInput = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}`);
          const ext = target === 'jpeg' ? 'jpg' : target;
          const tmpOutput = join(outDir, `转换-${Date.now()}.${ext}`);
          writeFileSync(tmpInput, buffer);
          const stdout = await runPython([IMAGE_CONVERT_SCRIPT, tmpInput, tmpOutput, target]);
          rmSync(tmpInput, { force: true });
          const result = JSON.parse(stdout.trim()) as {
            ok?: boolean;
            path?: string;
            format?: string;
            size?: number;
            error?: string;
          };
          if (!result.ok) {
            return {
              result: { answer: `图片格式转换失败：${result.error ?? '未知错误'}` },
              confidence: 0.2,
            };
          }
          return {
            result: {
              answer: `已转换为 ${target.toUpperCase()}：${result.path}（${result.size} 字节）`,
              path: result.path,
              format: result.format,
              size: result.size,
            },
            confidence: 0.85,
            followUpAction: '需要继续压缩体积或转成其他格式，随时说。',
          };
        } catch (err) {
          return {
            result: {
              answer: `图片格式转换失败：${err instanceof Error ? err.message : String(err)}`,
            },
            confidence: 0.2,
          };
        }
      }

      // image
      const file = findImageFile(input);
      if (!file) {
        return {
          result: {
            answer: '请上传要压缩的图片，我默认压到 200KB 以内。',
          },
          confidence: 0.4,
        };
      }
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const tmpInput = join(outDir, `tmp-${Date.now()}-${safeName(file.name)}`);
        const tmpOutput = join(outDir, `compressed-${Date.now()}.jpg`);
        writeFileSync(tmpInput, buffer);
        const maxKb = /(\d+)\s*KB/i.exec(input.query)?.[1] ?? '200';
        const stdout = await runPython([COMPRESS_SCRIPT, tmpInput, tmpOutput, maxKb]);
        const result = JSON.parse(stdout.trim()) as {
          ok?: boolean;
          size?: number;
          path?: string;
          error?: string;
        };
        rmSync(tmpInput, { force: true });
        if (!result.ok) {
          return {
            result: { answer: `图片压缩失败：${result.error ?? '未知错误'}` },
            confidence: 0.2,
          };
        }
        return {
          result: {
            answer: `已压缩：${result.path}（${result.size} 字节）`,
            path: result.path,
            size: result.size,
          },
          confidence: 0.85,
          followUpAction: '需要继续压缩到更小体积或保留 PNG 透明通道，随时说。',
        };
      } catch (err) {
        return {
          result: {
            answer: `图片压缩失败：${err instanceof Error ? err.message : String(err)}`,
          },
          confidence: 0.2,
        };
      }
    },
  };
}









