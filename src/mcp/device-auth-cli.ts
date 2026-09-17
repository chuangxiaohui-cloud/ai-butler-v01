/**
 * E426：设备白名单 CLI 编排（可注入 store 路径便于单测）。
 * 用法：
 *   device:auth -- --list
 *   device:auth -- --authorize --device <id> [--label …] [--source user_whitelist]
 *   device:auth -- --revoke --device <id>
 */

import { join } from 'node:path';

import { DeviceAuthStore } from './device-auth.js';

export interface DeviceAuthCliDeps {
  cwd?: string;
  authPath?: string;
  store?: DeviceAuthStore;
}

export interface DeviceAuthCliOutcome {
  exit: number;
  output: unknown;
}

const USAGE =
  '用法：npm run device:auth -- --list | --authorize --device <id> [--label …] [--source user_whitelist] | --revoke --device <id>';

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

function resolveStore(deps: DeviceAuthCliDeps): DeviceAuthStore {
  if (deps.store) return deps.store;
  const cwd = deps.cwd ?? process.cwd();
  const path = deps.authPath ?? join(cwd, 'data', 'device-auth.jsonl');
  return new DeviceAuthStore(path);
}

export function runDeviceAuthCli(args: string[], deps: DeviceAuthCliDeps = {}): DeviceAuthCliOutcome {
  const list = hasFlag(args, 'list');
  const authorize = hasFlag(args, 'authorize');
  const revoke = hasFlag(args, 'revoke');
  const modes = [list, authorize, revoke].filter(Boolean).length;
  if (modes !== 1) {
    return {
      exit: 1,
      output: { ok: false, error: '必须且只能指定 --list / --authorize / --revoke 之一', hint: USAGE },
    };
  }

  const store = resolveStore(deps);
  try {
    if (list) {
      const devices = store.listCurrent();
      return {
        exit: 0,
        output: {
          ok: true,
          count: devices.length,
          devices,
          hint: devices.length === 0 ? '当前无有效设备授权；默认零硬件动作。' : undefined,
        },
      };
    }

    const device = argValue(args, 'device')?.trim();
    if (!device) {
      return { exit: 1, output: { ok: false, error: '缺少 --device <id>', hint: USAGE } };
    }

    if (authorize) {
      const source = argValue(args, 'source')?.trim() || 'user_whitelist';
      const label = argValue(args, 'label')?.trim();
      store.authorize(device, source, label || undefined);
      return {
        exit: 0,
        output: {
          ok: true,
          action: 'authorize',
          deviceId: device,
          source,
          ...(label ? { label } : {}),
          authorized: store.isAuthorized(device),
        },
      };
    }

    store.revoke(device);
    return {
      exit: 0,
      output: {
        ok: true,
        action: 'revoke',
        deviceId: device,
        authorized: store.isAuthorized(device),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exit: 1, output: { ok: false, error: message, hint: USAGE } };
  } finally {
    store.close();
  }
}
