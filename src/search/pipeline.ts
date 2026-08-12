/**
 * Stage 1-6 搜索问答管道（v0.1 逐步落地）
 * 对齐 §6.0 管道总览 + §6.3 接口契约
 */

import type { LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { SearchProvider } from './providers/types.js';
import type { MemoryStore } from '../memory/store.js';
import { defaultMemoryStore } from '../memory/store.js';
import { getHostname } from './authority.js';
import { fuseResults } from './fusion.js';
import { applyRule3 } from './rule3.js';
import { prepareQuery } from './stages/s1_prepare.js';
import { classifyQuery } from './stages/s2_classify.js';
import { runSearchStage } from './stages/s3_search.js';
import { synthesizeAnswer } from './stages/s5_synthesize.js';
import { postProcess } from './stages/s6_post.js';

export interface Evidence {
  title: string;
  url: string;
  domain: string;
  score: number;
  type: '[hard]' | '[soft]';
}

export interface AnswerResult {
  query: string;
  answer: string;
  confidence: number;
  evidence: Evidence[];
  gate_triggered: 'none' | 'emergency' | 'low_confidence' | 'safety';
  elapsed_ms: number;
}

export interface PipelineDeps {
  llm?: LLMClient;
  providers?: SearchProvider[];
  quota?: QuotaStoreLike;
  memoryStore?: Pick<MemoryStore, 'put' | 'recall'>;
}

export async function pipeline(query: string, deps: PipelineDeps = {}): Promise<AnswerResult> {
  const start = Date.now();

  // Stage 1：预处理（黑话/脱敏/澄清/缓存）
  const prepared = prepareQuery(query);
  if (prepared.clarify) {
    return {
      query,
      answer: prepared.clarify.question,
      confidence: 0,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
    };
  }

  // 记忆调用（L0/L1，§6.1.1）：读取最近历史问答作为上下文
  const memoryStore = deps.memoryStore ?? defaultMemoryStore();
  let memoryNotes: string[] = [];
  try {
    const history = await memoryStore.recall('v0.1-cli', 3);
    memoryNotes = history.map(
      (m) => `Q: ${m.query} → A: ${m.answer.slice(0, 120)}`,
    );
  } catch {
    // 记忆读取失败不阻塞主对话
  }
  prepared.memoryNotes = memoryNotes;

  // Stage 2：意图分类 + Query 构造
  const classified = await classifyQuery(prepared.cleanQuery, deps.llm);
  if (classified.intent === 'emergency') {
    return {
      query,
      answer: '请立即拨打 120 / 119 / 110，以专业救援或医生判断为准。',
      confidence: 0,
      evidence: [],
      gate_triggered: 'emergency',
      elapsed_ms: Date.now() - start,
    };
  }

  // 规则③：关键词硬规则兜底（独立于分类器，Step 4 安全阀）
  const rule3 = applyRule3(prepared.cleanQuery);

  // Stage 3：搜索执行（Bocha + AnySearch 并行）
  const search = await runSearchStage(prepared.cleanQuery, {
    intent: classified.intent,
    cacheKey: prepared.cacheKey,
    cachedValue: prepared.cachedValue,
    providers: deps.providers,
    quota: deps.quota,
  });

  // Stage 4：四过滤器 + 加权评分 + 规则① + 来源权威注入
  const fused = fuseResults(prepared.cleanQuery, search.results, classified.intent);
  const evidence = fused.items.map((f) => ({
    title: f.result.title,
    url: f.result.url,
    domain: getHostname(f.result.url),
    score: f.finalScore,
    type: f.official ? ('[hard]' as const) : ('[soft]' as const),
  }));
  const confidence =
    fused.items.length > 0
      ? Math.max(...fused.items.map((f) => f.finalScore))
      : 0;
  const gate: AnswerResult['gate_triggered'] = rule3.serious
    ? 'safety'
    : fused.items.length === 0 || fused.gated || fused.lowConfidence
      ? 'low_confidence'
      : 'none';

  // Stage 5：秘书级合成
  const synthesized = await synthesizeAnswer(prepared.cleanQuery, fused, classified, {
    llm: deps.llm,
    serious: rule3.serious,
    memoryNotes,
  });

  // Stage 6：后处理 + L0 记忆写入
  const final = await postProcess(
    {
      query,
      answer: synthesized.answer,
      confidence,
      evidence,
      gateTriggered: gate,
      elapsedMs: Date.now() - start,
    },
    { store: deps.memoryStore ?? defaultMemoryStore() },
  );

  return {
    query,
    answer: final.answer,
    confidence: final.confidence,
    evidence: final.evidence,
    gate_triggered: final.gateTriggered as AnswerResult['gate_triggered'],
    elapsed_ms: final.elapsedMs,
  };
}
