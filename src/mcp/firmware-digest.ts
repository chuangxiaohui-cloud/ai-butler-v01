/**
 * E411：固件摘要（本地 SHA-256）。只读文件，不触发烧录或设备连接。
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

import { isPathAllowed } from '../security/sandbox.js';
import type { FirmwareDigest } from './hardware-capability.js';
import { validateFirmwareDigest } from './hardware-capability.js';

export type FirmwareDigestResult =
  | { ok: true; digest: FirmwareDigest }
  | { ok: false; reason: string };

export function computeFirmwareDigest(
  firmwarePath: string,
  now = Date.now(),
  workspaceRoot = process.cwd(),
): FirmwareDigestResult {
  const check = isPathAllowed(firmwarePath, workspaceRoot);
  if (!check.allowed || !check.resolved) {
    return { ok: false, reason: check.reason ?? '固件路径不在沙箱白名单内' };
  }
  try {
    const buf = readFileSync(check.resolved);
    const digest: FirmwareDigest = {
      path: check.resolved,
      sha256: createHash('sha256').update(buf).digest('hex'),
      byteLength: buf.byteLength,
      computedAt: now,
    };
    if (!validateFirmwareDigest(digest)) return { ok: false, reason: '固件摘要校验失败' };
    // 额外用 stat 确认可读（与 byteLength 对齐）
    if (statSync(check.resolved).size !== digest.byteLength) {
      return { ok: false, reason: '固件文件大小与摘要不一致' };
    }
    return { ok: true, digest };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
