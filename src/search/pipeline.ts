/**
 * Stage 1-6 搜索问答管道（v0.1 占位实现）
 * 对齐 §6.0 管道总览 + §6.3 接口契约
 */

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

export async function pipeline(query: string): Promise<AnswerResult> {
  const start = Date.now();

  // WP3-WP7 逐步替换为真实实现
  return {
    query,
    answer: `[v0.1 占位] 已收到问题：${query}。Stage 1-6 管道将在 WP3-WP7 逐步落地。`,
    confidence: 0,
    evidence: [],
    gate_triggered: 'none',
    elapsed_ms: Date.now() - start,
  };
}
