/**
 * E428：固件摘要只读 CLI（沙箱内 SHA-256；不烧录、不连设备）。
 * 用法：npm run firmware:digest -- --path projects/fw/app.bin
 */

import { computeFirmwareDigest } from './firmware-digest.js';

export interface FirmwareDigestCliDeps {
  cwd?: string;
  now?: number;
}

export interface FirmwareDigestCliOutcome {
  exit: number;
  output: unknown;
}

const USAGE = '用法：npm run firmware:digest -- --path <沙箱内固件路径>';

function argValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  if (inline !== undefined && inline !== '') return inline;
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

export function runFirmwareDigestCli(
  args: string[],
  deps: FirmwareDigestCliDeps = {},
): FirmwareDigestCliOutcome {
  const pathArg = argValue(args, 'path')?.trim();
  if (!pathArg) {
    return { exit: 1, output: { ok: false, error: '缺少 --path <固件路径>', hint: USAGE } };
  }

  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now ?? Date.now();
  const result = computeFirmwareDigest(pathArg, now, cwd);
  if (!result.ok) {
    return {
      exit: 1,
      output: { ok: false, error: result.reason, path: pathArg, hint: USAGE },
    };
  }

  return {
    exit: 0,
    output: {
      ok: true,
      digest: result.digest,
      hint: '将 sha256 用于硬件门禁 firmware 摘要；烧录仍须独立 perFlashConfirmed。',
    },
  };
}
