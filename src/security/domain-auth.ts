/**
 * 浏览器操作域名白名单授权（E252，§4.1.5 域名白名单）
 * 两层门禁：Skill manifest 声明 domains（可操作候选，§8.2.3）→ 用户显式授权
 * （本地持久化、可撤销）；未授权域名一律拒绝（默认只读，不执行操作）。
 * 记录为 append-only JSONL（data/domain-auth.jsonl），与 MarketStore 同款语义：
 * (skill, domain) 最后一条记录决定当前授权状态。
 */

import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appendJsonl, closeJsonl } from '../log/jsonl.js';

export interface DomainAuthRecord {
  ts: string;
  skill: string;
  domain: string;
  revoked?: boolean;
}

/** 子域归属匹配（A4）：szlcsc.com 匹配 so.szlcsc.com 与 szlcsc.com；evil-szlcsc.com 不误放 */
export function isDomainMatch(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase().replace(/^\./, '');
  const h = host.toLowerCase().replace(/^\./, '');
  return h === p || h.endsWith(`.${p}`);
}

/** 从 URL 提取规范化 hostname（非法 URL 返回 null） */
export function hostOfUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^\./, '');
  } catch {
    return null;
  }
}

export class DomainAuthStore {
  private readonly filePath: string;
  private readonly records: DomainAuthRecord[] = [];
  private readonly latest = new Map<string, DomainAuthRecord>();

  constructor(filePath = join(process.cwd(), 'data', 'domain-auth.jsonl')) {
    this.filePath = filePath;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as DomainAuthRecord;
          this.records.push(record);
          this.latest.set(`${record.skill}|${record.domain}`, record);
        } catch {
          // 损坏行跳过（append-only 只读重放，不阻塞授权查询）
        }
      }
    } catch {
      // 文件不存在 = 尚无授权记录
    }
  }

  isAuthorized(skill: string, domain: string): boolean {
    const record = this.latest.get(`${skill}|${domain}`);
    return record !== undefined && record.revoked !== true;
  }

  authorize(skill: string, domain: string): void {
    const record: DomainAuthRecord = { ts: new Date().toISOString(), skill, domain };
    this.records.push(record);
    this.latest.set(`${skill}|${domain}`, record);
    this.persist(record);
  }

  revoke(skill: string, domain: string): void {
    const record: DomainAuthRecord = { ts: new Date().toISOString(), skill, domain, revoked: true };
    this.records.push(record);
    this.latest.set(`${skill}|${domain}`, record);
    this.persist(record);
  }

  list(skill?: string): DomainAuthRecord[] {
    return this.records.filter((record) => skill === undefined || record.skill === skill);
  }

  close(): void {
    closeJsonl(this.filePath);
  }

  private persist(record: DomainAuthRecord): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendJsonl(this.filePath, JSON.stringify(record));
  }
}