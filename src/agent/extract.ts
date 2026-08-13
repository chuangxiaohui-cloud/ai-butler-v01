/**
 * Layer 1 编排：LLM 特征提取 → 校验 → 规则 fallback
 * source = 'llm' | 'fallback' | 'rule'；fallback 会触发 [P-84] 折扣。
 */

import type { LLMClient } from '../search/llm.js';
import {
  buildIntentFeaturePrompt,
  extractIntentFeatureRuleBased,
  validateIntentFeature,
  type IntentFeature,
} from './intent-feature.js';
import type { AttachmentSignal } from './multimodal-preprocessor.js';

export interface ExtractionResult {
  features: IntentFeature;
  source: 'llm' | 'fallback' | 'rule';
  issues: string[];
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export async function extractIntentFeature(
  query: string,
  llm?: LLMClient,
  attachments: AttachmentSignal[] = [],
): Promise<ExtractionResult> {
  if (!llm) {
    return {
      features: extractIntentFeatureRuleBased(query, attachments),
      source: 'rule',
      issues: [],
    };
  }
  try {
    const raw = await llm.complete(
      [{ role: 'user', content: buildIntentFeaturePrompt(query, attachments) }],
      { temperature: 0, maxTokens: 200, json: true },
    );
    const parsed = extractJsonObject(raw);
    const features = validateIntentFeature(parsed);
    return { features, source: 'llm', issues: [] };
  } catch (err) {
    return {
      features: extractIntentFeatureRuleBased(query, attachments),
      source: 'fallback',
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }
}
