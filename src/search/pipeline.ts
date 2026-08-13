/**
 * Stage 1-6 搜索问答管道（v0.1 逐步落地）
 * 对齐 §6.0 管道总览 + §6.3 接口契约
 */

import type { LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { SearchProvider } from './providers/types.js';
import type { MemoryStore } from '../memory/store.js';
import { defaultMemoryStore } from '../memory/store.js';
import type { ExperienceEntry } from '../memory/experience.js';
import { getSkills } from '../skills/registry.js';
import { getHostname } from './authority.js';
import { fuseResults } from './fusion.js';
import { applyRule3 } from './rule3.js';
import { shouldTriggerTavily } from './tavily-trigger.js';
import { routeV2 } from '../agent/router-v2.js';
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
  tavily?: { enabled?: boolean };
  experienceManager?: {
    search(query: string, opts?: { limit?: number }): ExperienceEntry[];
    recordUse?(id: string): void;
  };
  skillLifecycle?: {
    findBest(query: string): { name: string } | null;
    recordUse?(name: string): void;
  };
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

  // 主 Agent 意图路由（三层：特征 → 规则表 → 置信度门控）
  const route = routeV2(prepared.cleanQuery);
  if (route.decision.type === 'option_clarify' || route.decision.type === 'must_clarify') {
    const options =
      route.decision.type === 'option_clarify'
        ? `\n${route.decision.options.map((o) => `${o.id}. ${o.label} - ${o.description}`).join('\n')}`
        : '';
    return {
      query,
      answer: `${route.decision.question}${options}`,
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
    };
  }
  const routeSelected =
    route.decision.type === 'direct' || route.decision.type === 'confirm'
      ? route.decision.selected
      : null;
  if (!routeSelected) {
    return {
      query,
      answer: '我没识别出你的意图，能重新描述一下吗？',
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
    };
  }
  if (routeSelected.intent === 'emergency') {
    return {
      query,
      answer: '请立即拨打 120 / 119 / 110，以专业救援或医生判断为准。',
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'emergency',
      elapsed_ms: Date.now() - start,
    };
  }
  if (!routeSelected.searchNeed && routeSelected.intent !== 'web_search') {
    return {
      query,
      answer: `已识别为 ${routeSelected.primaryLens}/${routeSelected.intent}，对应执行器尚未接入。`,
      confidence: route.confidence,
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

  // Experience/Skill 注入（v0.2b 遗留项，回灌期接入）
  const experienceNotes: string[] = [];
  const usedExperienceIds: string[] = [];
  let skillHints: string[] = [];
  const skillOutputs: string[] = [];
  let usedSkillName: string | null = null;
  if (deps.experienceManager) {
    try {
      const hits = deps.experienceManager.search(prepared.cleanQuery, { limit: 3 });
      for (const entry of hits) {
        experienceNotes.push(`[${entry.skillName}] ${entry.content.slice(0, 200)}`);
        usedExperienceIds.push(entry.id);
      }
    } catch {
      // 经验检索失败不阻塞主对话
    }
  }
  if (deps.skillLifecycle) {
    try {
      const best = deps.skillLifecycle.findBest(prepared.cleanQuery);
      if (best) {
        skillHints = [best.name];
        usedSkillName = best.name;
        const skill = getSkills().find((s) => s.name === best.name);
        if (skill) {
          try {
            const output = await skill.handler(prepared.cleanQuery);
            if (output !== null && output !== undefined) {
              const text =
                typeof output === 'string' ? output : JSON.stringify(output);
              skillOutputs.push(`${skill.name} v${skill.version}: ${text.slice(0, 800)}`);
            }
          } catch {
            // Skill handler 失败不阻塞主对话
          }
        }
      }
    } catch {
      // 技能匹配失败不阻塞主对话
    }
  }

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
  const tavilyEnabled = deps.tavily?.enabled ?? false;
  const tavilyTrigger = tavilyEnabled
    ? shouldTriggerTavily(prepared.cleanQuery, classified.intent, rule3.serious)
    : null;
  const search = await runSearchStage(prepared.cleanQuery, {
    intent: classified.intent,
    cacheKey: prepared.cacheKey,
    cachedValue: prepared.cachedValue,
    providers: deps.providers,
    quota: deps.quota,
    tavily: { enabled: tavilyEnabled, trigger: tavilyTrigger },
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
    aiAnswers: search.aiAnswers,
    experienceNotes,
    skillHints,
    skillOutputs,
    primaryLens: routeSelected.primaryLens,
  });

  if (synthesized.source === 'llm') {
    for (const id of usedExperienceIds) deps.experienceManager?.recordUse?.(id);
    if (usedSkillName) deps.skillLifecycle?.recordUse?.(usedSkillName);
  }

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
