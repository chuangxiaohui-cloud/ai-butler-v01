/**
 * 多模态预处理（Week 1）：只提取零成本信号，不调 VLM。
 */

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

/** 纯信号提取，零成本 */
export function preprocessUserMessage(text: string, files: RawFileLike[]): ProcessedMessage {
  return {
    text,
    rawFiles: files,
    attachmentSignals: files.map((f) => ({
      type: f.type.startsWith('image/')
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
  return `data:${file.type};base64,${buf.toString('base64')}`;
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
  const img = processed.rawFiles.find((f) => f.type.startsWith('image/'));
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
