import type { RawFileLike } from '../../../src/skills/deps.js';

export function fakeFile(name: string, type: string, bytes: Uint8Array | string): RawFileLike {
  const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return {
    name,
    type,
    size: u8.byteLength,
    arrayBuffer: async () => u8.slice().buffer as ArrayBuffer,
  };
}

/** 最小 PNG 魔数头，够路由识别 image/* 即可 */
export const fakePng = (name = 'shot.png') =>
  fakeFile(name, 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
