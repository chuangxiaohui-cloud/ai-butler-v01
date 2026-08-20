/**
 * 多模态预处理（Week 1）：只提取零成本信号，不调 VLM。
 * E161：附件按扩展名兜底识别图片；VLM 输入对非标准格式（AVIF/TIFF/HEIC/HEIF/BMP）
 * 尽力用 Python(Pillow) 归一化为 PNG，解码不可用时诚实降级为原样透传。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARAMS } from '../config/params.js';
import type { RawFileLike, SkillDeps } from '../skills/deps.js';

export interface AttachmentSignal {
  type: 'image' | 'document' | 'audio' | 'unknown';
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}

export interface ProcessedMessage {
  text: string;
  attachmentSignals: AttachmentSignal[];
  rawFiles: RawFileLike[]; // 原样下传，Skill 按需读取
}

const DOCUMENT_MIME = new Set([
  'application/pdf',
  'text/markdown',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** 图片扩展名 → MIME（附件 type 缺失或 octet-stream 时兜底识别，E161） */
export const IMAGE_EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** 按 MIME 或扩展名判断附件是否为图片（E161） */
export function isImageFile(file: Pick<RawFileLike, 'name' | 'type'>): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return ext in IMAGE_EXT_MIME;
}

/** 归一化附件 MIME：type 缺失/未知时按扩展名推导（E161） */
export function effectiveMime(file: Pick<RawFileLike, 'name' | 'type'>): string {
  if (file.type.startsWith('image/')) return file.type.toLowerCase();
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXT_MIME[ext] ?? (file.type || 'application/octet-stream');
}

function extensionOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
}

/** VLM 客户端普遍接受的图片格式（其余格式先归一化为 PNG） */
const VLM_SAFE_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const PYTHON_CANDIDATES = ['python', 'python3'];
const IMAGE_CONVERT_SCRIPT = fileURLToPath(
  new URL('../../scripts/office_image_convert.py', import.meta.url),
);
const NORMALIZE_TIMEOUT_MS = 15_000;

/**
 * 尽力把非标准图片格式转为 PNG（复用 office-daily 的解码链：Pillow + HEIC 兜底）。
 * 成功返回 PNG Buffer，失败/超时返回 null（调用方诚实降级）。
 */
function tryNormalizeToPng(file: RawFileLike, buf: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const dir = mkdtempSync(join(tmpdir(), 'img-norm-'));
    const src = join(dir, `input.${extensionOf(file.name)}`);
    const dst = join(dir, 'out.png');
    writeFileSync(src, buf);
    const candidates = [
      ...(process.env.OFFICE_PYTHON ? [process.env.OFFICE_PYTHON] : []),
      ...PYTHON_CANDIDATES,
    ];
    let settled = false;
    const finish = (value: Buffer | null): void => {
      if (settled) return;
      settled = true;
      rmSync(dir, { recursive: true, force: true });
      resolve(value);
    };
    const tryRun = (index: number): void => {
      if (index >= candidates.length) {
        finish(null);
        return;
      }
      const child = spawn(candidates[index], [IMAGE_CONVERT_SCRIPT, src, dst, 'png'], {
        windowsHide: true,
      });
      const timer = setTimeout(() => child.kill(), NORMALIZE_TIMEOUT_MS);
      child.stderr.setEncoding('utf8');
      child.on('error', () => {
        clearTimeout(timer);
        tryRun(index + 1);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && existsSync(dst)) {
          try {
            finish(readFileSync(dst));
            return;
          } catch {
            // 落入降级
          }
        }
        tryRun(index + 1);
      });
    };
    tryRun(0);
  });
}

/** 纯信号提取，零成本 */
export function preprocessUserMessage(text: string, files: RawFileLike[]): ProcessedMessage {
  return {
    text,
    rawFiles: files,
    attachmentSignals: files.map((f) => ({
      type: isImageFile(f)
        ? 'image'
        : DOCUMENT_MIME.has(f.type) || /\.(md|txt|pdf|docx?)$/i.test(f.name)
          ? 'document'
          : f.type.startsWith('audio/')
            ? 'audio'
            : 'unknown',
      mimeType: f.type,
      sizeBytes: f.size,
      fileName: f.name,
    })),
  };
}

/** 契约：输出 data URL（与 VLMClient.image 契约一致） */
export async function toDataUrl(file: RawFileLike): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = effectiveMime(file);
  if (!mime.startsWith('image/') || VLM_SAFE_IMAGE_MIME.has(mime)) {
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  const png = await tryNormalizeToPng(file, buf);
  return png
    ? `data:image/png;base64,${png.toString('base64')}`
    : `data:${mime};base64,${buf.toString('base64')}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fast-describe timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * 可选 fast description（P-87 开关 / P-88 超时）：
 * 仅 hasImage 且文本意图模糊时触发；超时/失败/关闭 → undefined，绝不阻塞路由。
 */
export async function maybeFastDescribe(
  processed: ProcessedMessage,
  textAmbiguous: boolean,
  deps: SkillDeps,
): Promise<string | undefined> {
  const img = processed.rawFiles.find((f) => isImageFile(f));
  if (!img || !textAmbiguous || !PARAMS.fastDescriptionEnabled) return undefined;
  try {
    const dataUrl = await toDataUrl(img);
    return await withTimeout(
      deps.callVLM({ image: dataUrl, prompt: '用5个词描述这张图。' }, { maxTokens: 20 }),
      PARAMS.fastDescriptionTimeoutMs,
    );
  } catch {
    return undefined;
  }
}
