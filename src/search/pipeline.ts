/**
 * Stage 1-6 搜索问答管道（v0.1 逐步落地）
 * 对齐 §6.0 管道总览 + §6.3 接口契约
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { SearchProvider } from './providers/types.js';
import type { MemoryStore } from '../memory/store.js';
import { defaultMemoryStore } from '../memory/store.js';
import type { ExperienceEntry } from '../memory/experience.js';
import type { SearchSourceStats } from './source-stats.js';
import type { TrajectoryEventBody, TrajectoryLogLike } from '../trajectory/trajectory-log.js';
import { getSkills, isSkillEnabled, toDisplayText } from '../skills/registry.js';
import type { RawFileLike, SkillDeps } from '../skills/deps.js';
import { executorStatus } from '../agent/executors.js';
import { extractPartNumber, getHostname } from './authority.js';
import { fuseResults } from './fusion.js';
import { pickSecondPassTarget, shouldSecondPass } from './second-pass.js';
import { applyRule3 } from './rule3.js';
import { shouldTriggerTavily } from './tavily-trigger.js';
import {
  buildEmergencyReply,
  buildPropertyEmergencyReply,
  buildSafetyRefusalReply,
} from './emergency-reply.js';
import { weekendMarketReply } from './weekend-market.js';
import { routeV2WithLLM } from '../agent/router-v2.js';
import { mapRouteToUiMode, type UiMode } from '../agent/mode-mapper.js';
import { preprocessUserMessage } from '../agent/multimodal-preprocessor.js';
import { buildMemoryInjection, type UserContext } from '../memory/user-context.js';
import type { UserContextStore } from '../memory/user-context-store.js';
import { culturalReplyPostProcess } from '../postprocess/cultural-reply.js';
import type { RouteCaseStore } from '../agent/route-case-store.js';
import { prepareQuery } from './stages/s1_prepare.js';
import { classifyQuery } from './stages/s2_classify.js';
import { runSearchLoop, type BrowserFetcher } from './search-loop.js';
import { synthesizeAnswer } from './stages/s5_synthesize.js';
import { postProcess } from './stages/s6_post.js';
import { parseDocumentFile } from './document-parser.js';
import { resolveModelTier } from './model-router.js';
import type { ModelRouteInfo } from './model-router.js';
import type { ModelSelection } from './model-id.js';

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
  mode?: UiMode;
  submode?: string;
}

export interface PipelineDeps {
  llm?: LLMClient;
  providers?: SearchProvider[];
  quota?: QuotaStoreLike;
  memoryStore?: Pick<MemoryStore, 'put' | 'recall'>;
  userContextStore?: Pick<UserContextStore, 'load' | 'addSessionSummary'>;
  routeCaseStore?: Pick<RouteCaseStore, 'record' | 'attachModelRoute'>;
  skillDeps?: SkillDeps;
  tavily?: { enabled?: boolean };
  experienceManager?: {
    search(query: string, opts?: { limit?: number }): ExperienceEntry[];
    recordUse?(id: string): void;
  };
  sourceStats?: Pick<SearchSourceStats, 'record'>;
  skillLifecycle?: {
    findBest(query: string): { name: string } | null;
    recordUse?(name: string): void;
  };
  trajectory?: TrajectoryLogLike;
  browserSession?: BrowserFetcher;
}

export interface PipelineOptions {
  files?: RawFileLike[];
  userId?: string;
  modelSelection?: ModelSelection;
  onProgress?: (stage: string) => void;
}

export async function pipeline(
  query: string,
  deps: PipelineDeps = {},
  opts: PipelineOptions = {},
): Promise<AnswerResult> {
  const start = Date.now();
  const sessionId = randomUUID();
  const safeProgress = (stage: string) => {
    try {
      opts.onProgress?.(stage);
    } catch {
      // 进度回调失败不阻塞主对话
    }
  };
  const recordTrajectory = (event: TrajectoryEventBody) => {
    try {
      deps.trajectory?.record({ ...event, sessionId });
    } catch {
      // 轨迹记录失败不阻塞主对话
    }
  };

  // Stage 1：预处理（黑话/脱敏/澄清/缓存）
  const prepared = prepareQuery(query);
  safeProgress('stage1');
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

  // 多模态预处理：只提取零成本信号，VLM 在 Skill 内按需触发
  const processed = preprocessUserMessage(query, opts.files ?? []);

  // 用户上下文（Week 4 起接入）：意图提取与最终回复双端注入
  const userId = opts.userId ?? 'default';
  const userStore = deps.userContextStore;
  let userContext: UserContext | null = null;
  let memoryBlock = '';
  if (userStore) {
    try {
      userContext = userStore.load(userId);
      memoryBlock = buildMemoryInjection(userContext);
    } catch {
      // 用户上下文读取失败不阻塞主对话
    }
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
  const contextHints = memoryBlock
    ? [...memoryNotes, ...memoryBlock.split('\n').filter((line) => line.trim())]
    : memoryNotes;

  // 主 Agent 意图路由（三层：特征 → 规则表 → 置信度门控；携带工作记忆做上下文消歧）
  const route = await routeV2WithLLM(
    prepared.cleanQuery,
    deps.llm,
    contextHints,
    processed.attachmentSignals,
  );
  safeProgress('stage2');
  recordTrajectory({
    type: 'route',
    route: {
      decisionType: route.decision.type,
      primaryLens:
        route.decision.type === 'direct' || route.decision.type === 'confirm'
          ? route.decision.selected.primaryLens
          : undefined,
      intent:
        route.decision.type === 'direct' || route.decision.type === 'confirm'
          ? route.decision.selected.intent
          : undefined,
      confidence: route.confidence,
      executor:
        route.decision.type === 'direct' || route.decision.type === 'confirm'
          ? route.decision.selected.executor
          : undefined,
      matchedRules: route.candidates.map((c) => c.matchedRule),
    },
  });
  let routeCaseId: string | undefined;
  try {
    routeCaseId = deps.routeCaseStore?.record(route, { userId, source: 'pipeline' });
  } catch {
    // 路由 case 采集失败不阻塞主对话
  }
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
  const uiRoute = mapRouteToUiMode(routeSelected.primaryLens, routeSelected.intent);
  if (routeSelected.intent === 'emergency') {
    const answer = buildEmergencyReply(query);
    recordTrajectory({
      type: 'answer',
      answer: {
        answerSnippet: answer.slice(0, 300),
        confidence: route.confidence,
        gateTriggered: 'emergency',
        elapsedMs: Date.now() - start,
      },
    });
    return {
      query,
      answer,
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'emergency',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }
  if (routeSelected.intent === 'safety_refusal') {
    const answer = buildSafetyRefusalReply();
    return {
      query,
      answer,
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'safety',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }
  if (routeSelected.intent === 'property_emergency') {
    const answer = buildPropertyEmergencyReply();
    return {
      query,
      answer,
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'emergency',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }
  if (routeSelected.intent === 'rewrite') {
    return {
      query,
      answer: '请把要重写的内容发给我，我按更专业的语气润色。',
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }
  if (routeSelected.intent === 'pack_project') {
    return {
      query,
      answer: '请告诉我打包哪个项目目录；我会排除 .git、node_modules、build 后生成压缩包。',
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }
  if (!routeSelected.searchNeed && routeSelected.intent !== 'web_search') {
    const executor = routeSelected.executor ?? 'executor';
    const status = executorStatus(routeSelected.executor);
    const skillName = executor.replaceAll('_', '-');
    const skill = getSkills().find((s) => s.name === skillName && isSkillEnabled(s.name));
    if (skill && status === 'available') {
      try {
        const skillDeps = deps.skillDeps ?? { callVLM: async () => '' };
        const output = await skill.execute(
          {
            query: prepared.cleanQuery,
            attachmentSignals: processed.attachmentSignals,
            rawFiles: processed.rawFiles,
            memory: userContext,
            params: { mode: routeSelected.intent },
          },
          skillDeps,
        );
        let answer = toDisplayText(output.result);
        if (routeSelected.postProcess === 'cultural_reply') {
          answer = culturalReplyPostProcess({
            skillOutput: output,
            memory: userContext,
            originalQuestion: query,
          });
        }
        recordTrajectory({
          type: 'skill',
          skill: {
            name: skill.name,
            version: skill.version,
            kind: 'direct',
            outputSnippet: answer.slice(0, 300),
          },
        });
        recordTrajectory({
          type: 'answer',
          answer: {
            answerSnippet: answer.slice(0, 300),
            confidence: route.confidence,
            gateTriggered: 'none',
            elapsedMs: Date.now() - start,
          },
        });
        try {
          userStore?.addSessionSummary?.(
            userId,
            `s-${Date.now()}`,
            answer.slice(0, 200),
            [routeSelected.intent, ...route.features.rawEntities],
          );
        } catch {
          // 会话摘要写入失败不阻塞回复
        }
        return {
          query,
          answer,
          confidence: route.confidence,
          evidence: [],
          gate_triggered: 'none',
          elapsed_ms: Date.now() - start,
          mode: uiRoute.mode,
          submode: uiRoute.submode,
        };
      } catch {
        // Skill 执行失败，落到诚实降级
      }
    }
    return {
      query,
      answer:
        `✅ 路由成功：${routeSelected.primaryLens}/${routeSelected.intent}（confidence ${route.confidence.toFixed(2)}）\n` +
        `⚠️ 执行器尚未接入：${executor}（${status === 'available' ? '已登记，调度待接入' : 'not_wired'}），当前无法执行。\n` +
        '降级替代：您可以先提供相关输入/文本，我帮你整理成可执行步骤。',
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }

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
        const skill = getSkills().find(
          (s) => s.name === best.name && isSkillEnabled(s.name),
        );
        if (skill) {
          try {
            const skillDeps: SkillDeps = { callVLM: async () => '' };
            const output = await skill.execute(
              {
                query: prepared.cleanQuery,
                attachmentSignals: [],
                rawFiles: [],
                memory: null,
              },
              skillDeps,
            );
            const text = toDisplayText(output.result);
            if (text) {
              skillOutputs.push(`${skill.name} v${skill.version}: ${text.slice(0, 800)}`);
            }
          } catch {
            // Skill execute 失败不阻塞主对话
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
      answer: buildEmergencyReply(query),
      confidence: 0,
      evidence: [],
      gate_triggered: 'emergency',
      elapsed_ms: Date.now() - start,
    };
  }
  const weekendReply = weekendMarketReply(prepared.cleanQuery);
  if (weekendReply) {
    return {
      query,
      answer: weekendReply,
      confidence: 0.8,
      evidence: [],
      gate_triggered: 'none',
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
  const searchQuery = classified.searchQuery || prepared.cleanQuery;
  const search = await runSearchLoop(searchQuery, {
    originalQuery: prepared.cleanQuery,
    intent: classified.intent,
    cacheKey: prepared.cacheKey,
    cachedValue: prepared.cachedValue,
    providers: deps.providers,
    quota: deps.quota,
    llm: deps.llm,
    sourceStats: deps.sourceStats,
    tavily: { enabled: tavilyEnabled, trigger: tavilyTrigger },
    browserSession: deps.browserSession,
  });
  safeProgress('stage3');
  recordTrajectory({
    type: 'search',
    search: {
      query: searchQuery,
      resultCount: search.results.length,
      aiAnswerCount: search.aiAnswers.length,
      degraded: search.degraded,
      latencyMs: search.elapsedMs,
    },
  });

  // Stage 4：四过滤器 + 加权评分 + 规则① + 来源权威注入
  const relevanceQuery = search.subQueries[0] ?? searchQuery;
  let fused = fuseResults(
    prepared.cleanQuery,
    search.results,
    classified.intent,
    undefined,
    relevanceQuery,
  );
  let evidence = fused.items.map((f) => ({
    title: f.result.title,
    url: f.result.url,
    domain: getHostname(f.result.url),
    score: f.finalScore,
    type: f.official ? ('[hard]' as const) : ('[soft]' as const),
  }));
  let confidence =
    fused.items.length > 0
      ? Math.max(...fused.items.map((f) => f.finalScore))
      : 0;
  safeProgress('stage4');
  let gate: AnswerResult['gate_triggered'] = rule3.serious
    ? 'safety'
    : fused.items.length === 0 || fused.gated || fused.lowConfidence
      ? 'low_confidence'
      : 'none';

  // 低置信二次取证：器件/资料查询用浏览器抓高可信 HTML 页完整正文后重新融合
  if (gate === 'low_confidence' && shouldSecondPass(prepared.cleanQuery) && deps.browserSession) {
    const target = pickSecondPassTarget(search.results, prepared.cleanQuery, fused.items);
    if (target) {
      try {
        let secondPassText = '';
        if (/\.pdf(\?|#|$)/i.test(target.url)) {
          const safeName = (extractPartNumber(prepared.cleanQuery) ?? 'datasheet').replace(
            /[^a-zA-Z0-9_-]+/g,
            '',
          );
          const dest = resolve(process.cwd(), 'data', 'datasheets', `${safeName}-${Date.now()}.pdf`);
          const downloaded = await deps.browserSession.downloadFile(target.url, dest);
          if (downloaded.ok && downloaded.size > 0) {
            const buffer = readFileSync(dest);
            secondPassText = await parseDocumentFile({
              name: `${safeName}.pdf`,
              type: 'application/pdf',
              size: downloaded.size,
              arrayBuffer: async () =>
                buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
            });
          }
        } else {
          const page = await deps.browserSession.fetchPage(target.url, 8000, 3000);
          secondPassText = page.text;
        }
        if (secondPassText.trim().length > 0) {
          search.results.push({
            title: target.url.includes('szlcsc.com') ? `${extractPartNumber(prepared.cleanQuery)} 数据手册` : target.url,
            url: target.url,
            content: secondPassText.slice(0, 5000),
            provider: 'browser',
          });
          const refused = fuseResults(
            prepared.cleanQuery,
            search.results,
            classified.intent,
            undefined,
            relevanceQuery,
          );
          fused = refused;
          evidence = refused.items.map((f) => ({
            title: f.result.title,
            url: f.result.url,
            domain: getHostname(f.result.url),
            score: f.finalScore,
            type: f.official ? ('[hard]' as const) : ('[soft]' as const),
          }));
          confidence =
            refused.items.length > 0
              ? Math.max(...refused.items.map((f) => f.finalScore))
              : 0;
          gate = rule3.serious
            ? 'safety'
            : refused.items.length === 0 || refused.gated || refused.lowConfidence
              ? 'low_confidence'
              : 'none';
        }
      } catch {
        // 二次取证失败不改变原结果
      }
    }
  }

  // Stage 5：秘书级合成
  let lastModelRoute: ModelRouteInfo | undefined;
  const routeModelTier = resolveModelTier({
    intent: routeSelected.intent,
    actionType: route.features.actionType,
    searchNeed: routeSelected.searchNeed,
    confidence: route.confidence,
    hasImage: route.features.hasImage,
    hasDocument: route.features.hasDocument,
    hasGithubLink: route.features.hasGithubLink,
  });
  const synthesized = await synthesizeAnswer(prepared.cleanQuery, fused, classified, {
    llm: deps.llm,
    serious: rule3.serious,
    memoryNotes: memoryBlock ? [...memoryNotes, memoryBlock] : memoryNotes,
    aiAnswers: search.aiAnswers,
    experienceNotes,
    skillHints,
    skillOutputs,
    primaryLens: routeSelected.primaryLens,
    modelTier: opts.modelSelection?.role ?? routeModelTier,
    preferredProvider: opts.modelSelection?.provider,
    onModelRoute: (info) => {
      lastModelRoute = info;
      recordTrajectory({ type: 'model_route', modelRoute: info });
    },
  });
  safeProgress('stage5');
  if (routeCaseId && lastModelRoute) {
    try {
      deps.routeCaseStore?.attachModelRoute?.(routeCaseId, {
        ...lastModelRoute,
        at: Date.now(),
      });
    } catch {
      // 模型路由回写失败不阻塞主对话
    }
  }
  recordTrajectory({
    type: 'synthesize',
    synthesize: {
      source: synthesized.source,
      evidenceCount: evidence.length,
    },
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
  safeProgress('stage6');
  recordTrajectory({
    type: 'answer',
    answer: {
      answerSnippet: final.answer.slice(0, 300),
      confidence: final.confidence,
      gateTriggered: final.gateTriggered as string,
      elapsedMs: Date.now() - start,
    },
  });

  try {
    userStore?.addSessionSummary?.(
      userId,
      `s-${Date.now()}`,
      final.answer.slice(0, 200),
      [routeSelected.intent, ...route.features.rawEntities],
    );
  } catch {
    // 会话摘要写入失败不阻塞回复
  }

  return {
    query,
    answer: final.answer,
    confidence: final.confidence,
    evidence: final.evidence,
    gate_triggered: final.gateTriggered as AnswerResult['gate_triggered'],
    elapsed_ms: final.elapsedMs,
    mode: uiRoute.mode,
    submode: uiRoute.submode,
  };
}
