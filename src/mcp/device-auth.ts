/**
 * E411：设备标识白名单（append-only）。默认空表 = 零硬件授权。
 * E410 夹具证据不得写入本账本，也不得被当作授权依据。
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { appendJsonl, closeJsonl } from '../log/jsonl.js';
import { isForbiddenAuthSource } from './hardware-capability.js';

export interface DeviceAuthRecord {
  ts: string;
  deviceId: string;
  label?: string;
  /** 授权来源说明；禁止 e410_fixture / mcp_fixture / model_candidate / build_approval */
  source: string;
  revoked?: boolean;
}

export class DeviceAuthStore {
  private readonly filePath: string;
  private readonly records: DeviceAuthRecord[] = [];
  private readonly latest = new Map<string, DeviceAuthRecord>();

  constructor(filePath = join(process.cwd(), 'data', 'device-auth.jsonl')) {
    this.filePath = filePath;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as DeviceAuthRecord;
          this.records.push(record);
          this.latest.set(record.deviceId, record);
        } catch {
          // 损坏行跳过
        }
      }
    } catch {
      // 尚无授权文件
    }
  }

  isAuthorized(deviceId: string): boolean {
    const record = this.latest.get(deviceId);
    return record !== undefined && record.revoked !== true;
  }

  authorize(deviceId: string, source: string, label?: string): void {
    const id = deviceId.trim();
    if (!id) throw new Error('deviceId 不能为空');
    if (isForbiddenAuthSource(source)) {
      throw new Error(`禁止来源 ${source}：夹具/模型/构建批准不能授权硬件设备`);
    }
    const record: DeviceAuthRecord = {
      ts: new Date().toISOString(),
      deviceId: id,
      source,
      ...(label ? { label } : {}),
    };
    this.records.push(record);
    this.latest.set(id, record);
    this.persist(record);
  }

  revoke(deviceId: string, source = 'user_revoke'): void {
    const id = deviceId.trim();
    if (!id) throw new Error('deviceId 不能为空');
    const record: DeviceAuthRecord = {
      ts: new Date().toISOString(),
      deviceId: id,
      source,
      revoked: true,
    };
    this.records.push(record);
    this.latest.set(id, record);
    this.persist(record);
  }

  list(): DeviceAuthRecord[] {
    return [...this.records];
  }

  close(): void {
    closeJsonl(this.filePath);
  }

  private persist(record: DeviceAuthRecord): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendJsonl(this.filePath, JSON.stringify(record));
  }
}
