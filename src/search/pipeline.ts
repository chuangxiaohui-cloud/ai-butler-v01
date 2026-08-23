/**
 * Stage 1-6 搜索问答管道（v0.1 逐步落地）
 * 对齐 §6.0 管道总览 + §6.3 接口契约
 */

import { randomUUID } from 'node:crypto';

import { createLightClient } from './llm.js';
import type { LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { SearchProvider } from './providers/types.js';
import type { MemoryStore } from '../memory/store.js';
import { defaultMemoryStore } from '../memory/store.js';
import {
  COMPACT_TIMEOUT_MS,
  SessionContextStore,
  buildRecentMemory,
  buildSessionNotes,
  type SessionContext,
} from '../memory/session-context.js';
import type { ExperienceEntry } from '../memory/experience.js';
import type { SearchSourceStats } from './source-stats.js';
import type { TrajectoryEventBody, TrajectoryLogLike } from '../trajectory/trajectory-log.js';
import { getSkills, isSkillEnabled, toDisplayText } from '../skills/registry.js';
import type { RawFileLike, SkillDeps } from '../skills/deps.js';
import { executorStatus } from '../agent/executors.js';
import { extractPartNumber, getHostname } from './authority.js';
import { fuseResults } from './fusion.js';
import { PARAMS } from '../config/params.js';
import { fetchSecondPassTargets } from './second-pass-fetch.js';
import {
  DeepReportCancelledError,
  generateDeepReport,
} from './deep-report.js';
import { DeepReportStore, type DeepReportStoreLike } from './deep-report-store.js';
import { sanitizeSearchQuery } from '../security/query-sanitize.js';
import { pickSecondPassTargets, shouldSecondPass } from './second-pass.js';
import { applyRule3 } from './rule3.js';
import { shouldTriggerTavily } from './tavily-trigger.js';
import {
  buildEmergencyReply,
  buildPropertyEmergencyReply,
  buildSafetyRefusalReply,
} from './emergency-reply.js';
import { weekendMarketReply } from './weekend-market.js';
import { buildCompanionReply } from './companion-reply.js';
import { routeV2WithLLM } from '../agent/router-v2.js';
import { mapRouteToUiMode, type UiMode } from '../agent/mode-mapper.js';
import { preprocessUserMessage } from '../agent/multimodal-preprocessor.js';
import { buildMemoryInjection, type UserContext } from '../memory/user-context.js';
import type { UserContextStore } from '../memory/user-context-store.js';
import { rewriteWithMemory } from '../agent/rewrite-with-memory.js';
import { extractRememberInstruction } from '../agent/memory-instruction.js';
import { isRollbackQuery, rollbackLatest } from '../security/operation-log.js';
import { culturalReplyPostProcess } from '../postprocess/cultural-reply.js';
import type { RouteCaseStore } from '../agent/route-case-store.js';
import { prepareQuery } from './stages/s1_prepare.js';
import { classifyQuery } from './stages/s2_classify.js';
import { runSearchLoop, type BrowserFetcher } from './search-loop.js';
import { synthesizeAnswer } from './stages/s5_synthesize.js';
import { postProcess } from './stages/s6_post.js';
import {
  buildVideoBlock,
  collectVideoResults,
  type VideoResult,
} from './videos.js';
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
  videos?: VideoResult[];
  notice?: string;
}

export interface PipelineDeps {
  llm?: LLMClient;
  providers?: SearchProvider[];
  quota?: QuotaStoreLike;
  memoryStore?: Pick<MemoryStore, 'put' | 'recall'>;
  userContextStore?: Pick<UserContextStore, 'load' | 'addSessionSummary' | 'addFact'>;
  routeCaseStore?: Pick<RouteCaseStore, 'record' | 'attachModelRoute'>;
  skillDeps?: SkillDeps;
  tavily?: { enabled?: boolean };
  experienceManager?: {
    search(query: string, opts?: { limit?: number }): ExperienceEntry[];
    recordUse?(id: string): void;
    add?(entry: {
      id: string;
      skillName: string;
      content: string;
      keywords: string[];
      createdAt: number;
      lastUsedAt: number | null;
    }): void;
  };
  sourceStats?: Pick<SearchSourceStats, 'record'>;
  skillLifecycle?: {
    findBest(query: string): { name: string } | null;
    recordUse?(name: string): void;
  };
  trajectory?: TrajectoryLogLike;
  sessionContext?: Pick<SessionContextStore, 'load' | 'append' | 'compactIfNeeded'>;
  browserSession?: BrowserFetcher;
  /** v1.0 S2：深度报告任务状态存储（取消恢复；测试可注入内存实现） */
  deepReportStore?: DeepReportStoreLike;
  /** §10.3 搜索脱敏开关（默认开；工程开发栏显式携带项目上下文时可关） */
  querySanitizeEnabled?: boolean;
}

export interface PipelineOptions {
  files?: RawFileLike[];
  userId?: string;
  conversationId?: string;
  modelSelection?: ModelSelection;
  /** 外部取消信号（v1.0 S1 深度报告等长任务透传） */
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
  onArtifact?: (event: {
    skill: string;
    state: 'generating' | 'done' | 'failed';
    path?: string;
  }) => void;
}

let sharedSessionContext: SessionContextStore | null = null;
function defaultSessionContext(): SessionContextStore {
  sharedSessionContext ??= new SessionContextStore();
  return sharedSessionContext;
}

let sharedDeepReportStore: DeepReportStore | null = null;
function defaultDeepReportStore(): DeepReportStore {
  sharedDeepReportStore ??= new DeepReportStore();
  return sharedDeepReportStore;
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
  const safeArtifact = (event: {
    skill: string;
    state: 'generating' | 'done' | 'failed';
    path?: string;
  }) => {
    try {
      opts.onArtifact?.(event);
    } catch {
      // 产物事件失败不阻塞主对话
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
  const memorySessionId = userId === 'default' ? 'v0.1-cli' : `v0.1-cli:${userId}`;
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
  let recentMemory: Array<{ query: string; answer: string }> = [];
  try {
    const history = await memoryStore.recall(memorySessionId, 3);
    memoryNotes = history.map(
      (m) => `Q: ${m.query} → A: ${m.answer.slice(0, 120)}`,
    );
    recentMemory = history.map((m) => ({ query: m.query, answer: m.answer }));
  } catch {
    // 记忆读取失败不阻塞主对话
  }
  // 会话上下文（§8.3 E193）：同一会话摘要 + 逐字窗口注入，供路由/合成消歧
  const conversationId = opts.conversationId ?? '';
  const sessionStore = deps.sessionContext ?? defaultSessionContext();
  let sessionCtx: SessionContext | null = null;
  if (conversationId) {
    try {
      sessionCtx = await sessionStore.load(conversationId);
    } catch {
      // 会话上下文读取失败不阻塞主对话
    }
  }
  const sessionNotes = buildSessionNotes(sessionCtx);
  if (sessionNotes.length > 0) memoryNotes = [...sessionNotes, ...memoryNotes];
  const sessionMemory = buildRecentMemory(sessionCtx);
  if (sessionMemory.length > 0) recentMemory = [...sessionMemory, ...recentMemory];
  const recordSessionTurns = async (userText: string, assistantText: string): Promise<void> => {
    if (!conversationId) return;
    try {
      await sessionStore.append(conversationId, 'user', userText);
      await sessionStore.append(conversationId, 'assistant', assistantText);
      void sessionStore
        .compactIfNeeded(conversationId, deps.llm ?? createLightClient({ timeoutMs: COMPACT_TIMEOUT_MS }))
        .catch(() => {
          // 压缩失败静默，不阻塞主回答
        });
    } catch {
      // 会话上下文写入失败不阻塞主回答
    }
  };
  prepared.memoryNotes = memoryNotes;
  const contextHints = memoryBlock
    ? [...memoryNotes, ...memoryBlock.split('\n').filter((line) => line.trim())]
    : memoryNotes;

  // 本地写路径 / .ics 导入路径需要原始 query 路由，Stage 1 脱敏会剥掉盘符
  const routeQuery =
    /(?:写入|保存到|写到|落地到)\s+[A-Za-z]:\\/.test(prepared.originalQuery) ||
    /[A-Za-z]:\\[^\s]*\.ics/i.test(prepared.originalQuery)
      ? prepared.originalQuery
      : prepared.cleanQuery;

  // 显式“记住：...”指令：直接写长期事实，不走搜索
  const rememberContent = extractRememberInstruction(prepared.originalQuery);
  if (rememberContent) {
    try {
      userStore?.addFact?.(userId, rememberContent, 'user_explicit');
    } catch {
      // 记忆写入失败不阻塞确认回复
    }
    const answer = `已记住：${rememberContent}`;
    await recordSessionTurns(query, answer);
    recordTrajectory({
      type: 'answer',
      answer: {
        answerSnippet: answer.slice(0, 300),
        confidence: 0.95,
        gateTriggered: 'none',
        elapsedMs: Date.now() - start,
      },
    });
    return {
      query,
      answer,
      confidence: 0.95,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: 'knowledge',
    };
  }

  // 撤销/回滚指令：优先恢复最近一次 Agent 写入操作
  if (isRollbackQuery(prepared.cleanQuery)) {
    const rollback = rollbackLatest(userId, {
      conversationId: opts.conversationId,
    });
    recordTrajectory({
      type: 'answer',
      answer: {
        answerSnippet: rollback.message.slice(0, 300),
        confidence: rollback.ok ? 0.9 : 0.6,
        gateTriggered: 'none',
        elapsedMs: Date.now() - start,
      },
    });
    await recordSessionTurns(query, rollback.message);
    return {
      query,
      answer: rollback.message,
      confidence: rollback.ok ? 0.9 : 0.6,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: 'engineering',
    };
  }

  // 主 Agent 意图路由（三层：特征 → 规则表 → 置信度门控；携带工作记忆做上下文消歧）
  const route = await routeV2WithLLM(
    routeQuery,
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
    const rewritten = await rewriteWithMemory(
      prepared.cleanQuery,
      contextHints,
      deps.skillDeps?.complete,
    );
    if (rewritten) {
      try {
        await postProcess(
          {
            query,
            answer: rewritten,
            confidence: Math.max(0.7, route.confidence),
            evidence: [],
            gateTriggered: 'none',
            elapsedMs: Date.now() - start,
            sessionId: memorySessionId,
          },
          { store: deps.memoryStore ?? defaultMemoryStore() },
        );
        userStore?.addSessionSummary?.(
          userId,
          `s-${Date.now()}`,
          `Q: ${query}\nA: ${rewritten.slice(0, 200)}`,
          [routeSelected.intent, ...route.features.rawEntities],
        );
      } catch {
        // 记忆写入失败不阻塞润色结果
      }
      return {
        query,
        answer: rewritten,
        confidence: Math.max(0.7, route.confidence),
        evidence: [],
        gate_triggered: 'none',
        elapsed_ms: Date.now() - start,
        mode: uiRoute.mode,
        submode: uiRoute.submode,
      };
    }
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
  if (routeSelected.intent === 'companion_chat') {
    return {
      query,
      answer: buildCompanionReply(query),
      confidence: 0.8,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: 'life',
    };
  }
  if (!routeSelected.searchNeed && routeSelected.intent !== 'web_search') {
    const executor = routeSelected.executor ?? 'executor';
    const status = executorStatus(routeSelected.executor);
    const skillName = executor.replaceAll('_', '-');
    const skill = getSkills().find((s) => s.name === skillName && isSkillEnabled(s.name));
    if (skill && status === 'available') {
      safeArtifact({ skill: skill.name, state: 'generating' });
      try {
        const skillDeps = deps.skillDeps ?? { callVLM: async () => '' };
        const skillDepsForRun: SkillDeps = {
          ...skillDeps,
          ...(deps.experienceManager
            ? {
                experienceManager: deps.experienceManager as SkillDeps['experienceManager'],
              }
            : {}),
          ...(deps.browserSession ? { browserSession: deps.browserSession } : {}),
        };
        // 本地打包 / .ics 导入需要原始路径，不能用 Stage 1 脱敏后的 cleanQuery（Windows 路径会被剥掉）
        const skillInputQuery =
          skillName === 'project-packager' ||
          skillName === 'project-writer' ||
          (skillName === 'calendar-skill' &&
            /[A-Za-z]:\\[^\s]*\.ics/i.test(prepared.originalQuery))
            ? prepared.originalQuery
            : prepared.cleanQuery;
        const output = await skill.execute(
          {
            query: skillInputQuery,
            attachmentSignals: processed.attachmentSignals,
            rawFiles: processed.rawFiles,
            memory: userContext,
            workingMemory: recentMemory,
            params: {
              mode: routeSelected.intent,
              userId,
              conversationId: opts.conversationId ?? userId,
            },
          },
          skillDepsForRun,
        );
        let answer = toDisplayText(output.result);
        safeArtifact({
          skill: skill.name,
          state: 'done',
          path: extractArtifactPath(answer),
        });
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
          await postProcess(
            {
              query,
              answer,
              confidence: route.confidence,
              evidence: [],
              gateTriggered: 'none',
              elapsedMs: Date.now() - start,
              sessionId: memorySessionId,
            },
            { store: deps.memoryStore ?? defaultMemoryStore() },
          );
          userStore?.addSessionSummary?.(
            userId,
            `s-${Date.now()}`,
            `Q: ${query}\nA: ${answer.slice(0, 200)}`,
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
      } catch (err) {
        // B4：执行器真实失败要如实归因，不落到"尚未接入"误报
        safeArtifact({ skill: skill.name, state: 'failed' });
        const reason = err instanceof Error ? err.message : String(err);
        return {
          query,
          answer:
            `✅ 路由成功：${routeSelected.primaryLens}/${routeSelected.intent}（confidence ${route.confidence.toFixed(2)}）\n` +
            `⚠️ 执行器执行失败：${skill.name}（${reason}），当前无法完成。`,
          confidence: route.confidence,
          evidence: [],
          gate_triggered: 'none',
          elapsed_ms: Date.now() - start,
          mode: uiRoute.mode,
          submode: uiRoute.submode,
        };
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
            const skillDeps: SkillDeps = {
              callVLM: async () => '',
              ...(deps.browserSession ? { browserSession: deps.browserSession } : {}),
            };
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
  // §10.3 搜索脱敏：剥离路径/密钥/内网地址后再发出，避免项目敏感信息泄露给搜索引擎
  const sanitized = sanitizeSearchQuery(searchQuery, deps.querySanitizeEnabled ?? true);
  if (sanitized.warnings.length > 0) {
    safeProgress('sanitize-warning');
  }
  const search = await runSearchLoop(sanitized.query || '（已脱敏查询）', {
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

  const searchNotices = [...new Set(search.notices ?? [])];

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

  // 低置信二次取证：器件/资料查询优先抓高可信 HTML 页；普通问题融合全空时按相关度抓原文重试
  if (
    gate === 'low_confidence' &&
    (shouldSecondPass(prepared.cleanQuery) || search.results.length > 0) &&
    deps.browserSession
  ) {
    const targets = pickSecondPassTargets(search.results, prepared.cleanQuery, fused.items);
    const secondPassResults = await fetchSecondPassTargets(
      targets,
      prepared.cleanQuery,
      deps.browserSession,
      PARAMS.secondPassBudgetMs,
    );
    const secondPassAdded = secondPassResults.length > 0;
    for (const { target, text } of secondPassResults) {
      search.results.push({
        title: target.url.includes('szlcsc.com') ? `${extractPartNumber(prepared.cleanQuery)} 数据手册` : target.url,
        url: target.url,
        content: text.slice(0, 5000),
        provider: 'browser',
      });
    }
    if (secondPassAdded) {
      const refused = fuseResults(
        prepared.cleanQuery,
        search.results,
        classified.intent,
        undefined,
        relevanceQuery,
        { minScore: 0.3 },
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
  }

  const videoResults = collectVideoResults(evidence);
  const videoBlock = buildVideoBlock(videoResults);

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

  // v1.0 S1/S2：深度报告（§4.3.2）——搜索证据基础上分阶段生成结构化报告 + 证据附录；
  // 取消后同 query 再次触发自动恢复上次已生成分节（状态持久化，逐节落盘）
  let finalAnswerText = synthesized.answer + videoBlock;
  if (routeSelected.intent === 'deep_report') {
    const reportStore = deps.deepReportStore ?? defaultDeepReportStore();
    const resumed = reportStore.findResumable(prepared.cleanQuery);
    if (resumed) safeProgress('report-resumed');
    const jobId = reportStore.start(prepared.cleanQuery, evidence.length, resumed ?? null);
    try {
      const report = await generateDeepReport(prepared.cleanQuery, evidence, {
        llm: deps.llm,
        budgetMs: PARAMS.deepReportBudgetMs,
        signal: opts.signal,
        onStage: (stage) => safeProgress(stage),
        synthesis: synthesized.answer,
        resume: resumed ? { headings: resumed.headings, sections: resumed.sections } : undefined,
        onSection: (index, section) => reportStore.appendSection(jobId, section),
      });
      reportStore.markDone(jobId);
      finalAnswerText = report.report;
    } catch (err) {
      // 取消 → 标记可恢复并简短应答；失败 → 降级为 Stage 5 常规摘要，不静默等待
      if (err instanceof DeepReportCancelledError) {
        reportStore.markCancelled(jobId);
        finalAnswerText = '深度报告已取消。';
      } else {
        reportStore.markFailed(jobId);
        finalAnswerText = `深度报告生成失败，已降级为常规摘要：\n\n${synthesized.answer}`;
      }
    }
  }

  // Stage 6：后处理 + L0 记忆写入
  const final = await postProcess(
    {
      query,
      answer: finalAnswerText,
      confidence,
      evidence,
      gateTriggered: gate,
      elapsedMs: Date.now() - start,
      sessionId: memorySessionId,
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
      `Q: ${query}\nA: ${final.answer.slice(0, 200)}`,
      [routeSelected.intent, ...route.features.rawEntities],
    );
  } catch {
    // 会话摘要写入失败不阻塞回复
  }

  await recordSessionTurns(query, final.answer);
  return {
    query,
    answer: final.answer,
    confidence: final.confidence,
    evidence: final.evidence,
    gate_triggered: final.gateTriggered as AnswerResult['gate_triggered'],
    elapsed_ms: final.elapsedMs,
    mode: uiRoute.mode,
    submode: uiRoute.submode,
    videos: videoResults.length > 0 ? videoResults : undefined,
    ...(searchNotices.length > 0 ? { notice: searchNotices[0] } : {}),
  };
}

const ARTIFACT_PATH_RE = /[\w./\\:-]+\.(zip|kicad_sch|kicad_pcb|net|pdf|html?|md|txt)/i;

function extractArtifactPath(text: string): string | undefined {
  const match = ARTIFACT_PATH_RE.exec(text);
  return match?.[0];
}
