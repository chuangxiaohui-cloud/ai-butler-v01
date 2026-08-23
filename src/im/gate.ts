/**
 * v1.0 S5：远程通道授权开关（§4.5）
 * 远程通道默认关闭；必须完成绑定/授权后启用，防止未授权设备调用 Agent。
 * 状态落盘 data/im-gate.json（原子写），测试可注入路径。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ImPlatform } from './types.js';

export interface ImGateState {
  enabled: Record<ImPlatform, boolean>;
}

const DEFAULT_STATE: ImGateState = { enabled: { wechat: false, qq: false, feishu: false } };

export class ImGate {
  private readonly filePath: string;
  private state: ImGateState;

  constructor(filePath = join(process.cwd(), 'data', 'im-gate.json')) {
    this.filePath = filePath;
    this.state = this.load();
  }

  isEnabled(platform: ImPlatform): boolean {
    return this.state.enabled[platform] ?? false;
  }

  enable(platform: ImPlatform): void {
    this.state = { ...this.state, enabled: { ...this.state.enabled, [platform]: true } };
    this.persist();
  }

  disable(platform: ImPlatform): void {
    this.state = { ...this.state, enabled: { ...this.state.enabled, [platform]: false } };
    this.persist();
  }

  private load(): ImGateState {
    if (!existsSync(this.filePath)) return { ...DEFAULT_STATE, enabled: { ...DEFAULT_STATE.enabled } };
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<ImGateState>;
      return {
        enabled: {
          wechat: parsed.enabled?.wechat ?? false,
          qq: parsed.enabled?.qq ?? false,
          feishu: parsed.enabled?.feishu ?? false,
        },
      };
    } catch {
      return { ...DEFAULT_STATE, enabled: { ...DEFAULT_STATE.enabled } };
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state), 'utf-8');
      renameSync(tmp, this.filePath);
    } catch {
      // 落盘失败不阻塞本次会话内开关生效
    }
  }
}
