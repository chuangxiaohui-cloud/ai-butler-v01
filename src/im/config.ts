/**
 * E241（S5 真实平台适配器）：IM 通道配置装配。
 * 读取 configs/im-channels.json 声明真实平台通道（当前支持 qq OneBot 11），
 * 构造 ImChannel 列表；无配置文件或平台未实现时返回空表（保持骨架占位）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ImChannel } from './channel.js';
import { OneBotChannel, type OneBotChannelDeps } from './onebot/adapter.js';
import type { OneBotChannelConfig } from './onebot/types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(root, 'configs', 'im-channels.json');

export interface ImChannelConfigEntry {
  platform: string;
  onebot?: OneBotChannelConfig;
}

export interface ImChannelConfigFile {
  channels?: ImChannelConfigEntry[];
}

export function loadImChannelConfig(path = CONFIG_PATH): ImChannelConfigEntry[] {
  if (!existsSync(path)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
  const channels = (raw as ImChannelConfigFile)?.channels;
  if (!Array.isArray(channels)) return [];
  return channels.filter((c) => c && typeof c.platform === 'string');
}

function validOneBot(cfg: OneBotChannelConfig | undefined): cfg is OneBotChannelConfig {
  return Boolean(
    cfg &&
      typeof cfg.httpApiBase === 'string' &&
      cfg.httpApiBase.length > 0 &&
      Number.isFinite(cfg.listenPort) &&
      cfg.listenPort > 0 &&
      typeof cfg.accessToken === 'string' &&
      cfg.accessToken.length > 0,
  );
}

/** E241：按配置构造通道；未实现平台 / 配置缺失跳过 */
export function createImChannels(entries: ImChannelConfigEntry[], deps: OneBotChannelDeps = {}): ImChannel[] {
  const channels: ImChannel[] = [];
  for (const entry of entries) {
    if (entry.platform === 'qq' && validOneBot(entry.onebot)) {
      channels.push(new OneBotChannel(entry.onebot, deps));
    }
    // wechat/feishu：骨架保留，待官方凭据接入（诚实登记，E241）
  }
  return channels;
}
