/**
 * Stage 6 后处理 + 记忆写入（§6.0/§6.7）
 * 验证 answer、钳制 confidence、生成 evidence_hash、追加 L0 JSONL（schema v1）。
 */

import { appendFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join } from 'path';

import type { Evidence } from '../pipeline.js';
import type { MemoryStore } from '../../memory/store.js';

export interface PostProcessInput {
  query: string;
  answer: string;
  confidence: number;
  evidence: Evidence[];
  gateTriggered: string;
  elapsedMs: number;
  sessionId?: string;
}

export interface PostProcessResult {
  query: string;
  answer: string;
  confidence: number;
  evidence: Evidence[];
  evidenceHash: string;
  gateTriggered: string;
  elapsedMs: number;
  l0Written: boolean;
}

export interface PostProcessOptions {
  l0Path?: string;
  store?: Pick<MemoryStore, 'put'>;
}

export async function postProcess(
  input: PostProcessInput,
  opts: PostProcessOptions = {},
): Promise<PostProcessResult> {
  const answer = input.answer.trim() || '抱歉，我暂时没能给出可靠回答。';
  const confidence = Math.max(0, Math.min(1, input.confidence));
  const evidenceHash = createHash('sha256')
    .update(JSON.stringify(input.evidence))
    .digest('hex')
    .slice(0, 16);

  const record = {
    session_id: input.sessionId ?? 'v0.1-cli',
    query: input.query,
    answer,
    confidence,
    evidence_hash: evidenceHash,
    timestamp: Date.now(),
  };
  let l0Written = false;
  if (opts.store) {
    try {
      await opts.store.put(record);
      l0Written = true;
    } catch {
      // L0 写入失败不阻塞回答
    }
  } else {
    const l0Path = opts.l0Path ?? join(process.cwd(), 'data', 'l0.jsonl');
    try {
      mkdirSync(dirname(l0Path), { recursive: true });
      appendFileSync(l0Path, `${JSON.stringify(record)}\n`, 'utf-8');
      l0Written = true;
    } catch {
      // L0 写入失败不阻塞回答
    }
  }

  return {
    query: input.query,
    answer,
    confidence,
    evidence: input.evidence,
    evidenceHash,
    gateTriggered: input.gateTriggered,
    elapsedMs: input.elapsedMs,
    l0Written,
  };
}
