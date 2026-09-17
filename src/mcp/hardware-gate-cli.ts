/**
 * E429：硬件门禁预检 CLI。只调用 evaluateHardwareGate；不烧录、不打开串口。
 * 用法：
 *   npm run hardware:gate -- --action flash --device <id> --path projects/fw/app.bin [--per-flash-confirmed] [--no-audit]
 *   npm run hardware:gate -- --action serial_read --device <id> --port COM3 [--no-audit]
 */

import { join } from 'node:path';

import { DeviceAuthStore } from './device-auth.js';
import { computeFirmwareDigest } from './firmware-digest.js';
import { HardwareAuditStore } from './hardware-audit.js';
import type { HardwareActionKind, HardwareGateRequest } from './hardware-capability.js';
import { evaluateHardwareGate } from './hardware-gate.js';

export interface HardwareGateCliDeps {
  cwd?: string;
  deviceAuthPath?: string;
  auditPath?: string;
  devices?: Pick<DeviceAuthStore, 'isAuthorized'>;
  audit?: Pick<HardwareAuditStore, 'append'> | null;
  now?: number;
}

export interface HardwareGateCliOutcome {
  exit: number;
  output: unknown;
}

const USAGE =
  '用法：npm run hardware:gate -- --action flash|serial_read --device <id> [--path <固件>] [--port COMn] [--per-flash-confirmed] [--no-audit]';

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function argValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  if (inline !== undefined && inline !== '') return inline;
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

export function runHardwareGateCli(
  args: string[],
  deps: HardwareGateCliDeps = {},
): HardwareGateCliOutcome {
  const actionRaw = argValue(args, 'action');
  if (actionRaw !== 'flash' && actionRaw !== 'serial_read') {
    return {
      exit: 1,
      output: {
        ok: false,
        error: `--action 须为 flash|serial_read（当前 ${actionRaw ?? '缺失'}）`,
        hint: USAGE,
      },
    };
  }
  const action = actionRaw as HardwareActionKind;
  const deviceId = argValue(args, 'device')?.trim() ?? null;
  const port = argValue(args, 'port')?.trim() ?? null;
  const firmwarePath = argValue(args, 'path')?.trim();
  const perFlashConfirmed = hasFlag(args, 'per-flash-confirmed');
  const noAudit = hasFlag(args, 'no-audit');
  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now ?? Date.now();

  const devices = deps.devices
    ?? new DeviceAuthStore(deps.deviceAuthPath ?? join(cwd, 'data', 'device-auth.jsonl'));

  let audit: Pick<HardwareAuditStore, 'append'> | undefined;
  let auditStore: HardwareAuditStore | undefined;
  if (deps.audit === null || noAudit) {
    audit = undefined;
  } else if (deps.audit) {
    audit = deps.audit;
  } else {
    auditStore = new HardwareAuditStore(deps.auditPath ?? join(cwd, 'data', 'hardware-audit.jsonl'));
    audit = auditStore;
  }

  try {
    const request: HardwareGateRequest = {
      action,
      deviceId,
      port,
      ...(action === 'serial_read' ? { serialMode: 'read_only' as const } : {}),
      ...(action === 'flash' ? { perFlashConfirmed } : {}),
    };

    if (action === 'flash' && firmwarePath) {
      const digest = computeFirmwareDigest(firmwarePath, now, cwd);
      if (!digest.ok) {
        return {
          exit: 1,
          output: {
            ok: false,
            error: `固件摘要失败：${digest.reason}`,
            path: firmwarePath,
            hint: USAGE,
          },
        };
      }
      request.firmware = digest.digest;
    }

    const decision = evaluateHardwareGate(request, {
      devices,
      ...(audit ? { audit } : {}),
    });

    return {
      exit: decision.allowed ? 0 : 1,
      output: {
        ok: decision.allowed,
        decision,
        audited: Boolean(audit),
        hint: decision.allowed
          ? '门禁契约通过；仍须显式 executeFlash / executeSerialRead 才会动作。'
          : '门禁未通过；未执行任何硬件动作。',
      },
    };
  } finally {
    auditStore?.close();
    if (!deps.devices && 'close' in devices && typeof devices.close === 'function') {
      devices.close();
    }
  }
}
