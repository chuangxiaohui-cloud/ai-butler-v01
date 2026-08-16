/**
 * UI 附件（base64 data URL）→ pipeline RawFileLike（E107）
 */

import type { RawFileLike } from '../skills/deps.js';

export interface AttachmentPayload {
  name: string;
  type: string;
  dataUrl: string;
}

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,(.*)$/s;

export function dataUrlToRawFile(payload: AttachmentPayload): RawFileLike {
  const match = DATA_URL_RE.exec(payload.dataUrl);
  if (!match) throw new Error('附件必须是 base64 data URL');
  const mime = match[1] || payload.type || 'application/octet-stream';
  const base64 = match[3] ?? '';
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) throw new Error('附件内容为空');
  return {
    name: payload.name || 'attachment',
    type: payload.type || mime,
    size: buffer.byteLength,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  };
}
