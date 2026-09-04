/**
 * Stage 1-6 搜索问答管道（v0.1 逐步落地）
 * 对齐 §6.0 管道总览 + §6.3 接口契约
 */

import { randomUUID } from 'node:crypto';

import { createDeepReportHeavyClient, createLightClient } from './llm.js';
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
import { matchInstalledSkillTrigger, renderMarketSkillAnswer } from '../skills/market/nl-router.js';
import type { MarketRunOutcome } from '../skills/market/runner.js';
import type { RawFileLike, SkillDeps } from '../skills/deps.js';
import { checkSynthesisHealth } from '../maturity/runtime-watchdog.js';
import { executorStatus } from '../agent/executors.js';
import { extractPartNumber, getHostname } from './authority.js';
import { fuseResults } from './fusion.js';
import { PARAMS } from '../config/params.js';
import { DecisionLog } from '../escalation/decision-log.js';
import {
  buildConfirmHoldAnswer,
  isConfirmWriteExecutor,
  parseApprovalReply,
} from '../escalation/confirm-gate.js';
import { EscalationState } from '../escalation/escalation-state.js';
import { NotificationStore } from '../notifications/notification-store.js';
import {
  correctionEscalationMessage,
  countConsecutiveCorrections,
  failureEscalationMessage,
  lowConfidenceHonestMessage,
} from '../escalation/escalation.js';
import { fetchSecondPassTargets } from './second-pass-fetch.js';
import { checkEvidenceReadiness } from './answer-readiness.js';
import { classifyPredicate } from './answer-readiness.js';
import {
  cooccursWithQuery,
  hasAnyNumber,
  hasNumericUnit,
  numericUnitCount,
} from './numeric-pattern.js';
import {
  DeepReportCancelledError,
  generateDeepReport,
} from './deep-report.js';
import { DeepReportStore, type DeepReportStoreLike } from './deep-report-store.js';
import { sanitizeSearchQuery } from '../security/query-sanitize.js';
import { pickKnowledgeContentTargets, pickSecondPassTargets, shouldSecondPass } from './second-pass.js';
import { applyRule3 } from './rule3.js';
import { shouldTriggerTavily } from './tavily-trigger.js';
import {
  buildEmergencyReply,
  buildPropertyEmergencyReply,
  buildSafetyRefusalReply,
} from './emergency-reply.js';
import { weekendMarketReply } from './weekend-market.js';
import { buildCompanionReply } from './companion-reply.js';
import { buildSelfIdentityAnswer } from './self-identity.js';
import { routeV2WithLLM } from '../agent/router-v2.js';
import { mapRouteToUiMode, type UiMode } from '../agent/mode-mapper.js';
import { preprocessUserMessage } from '../agent/multimodal-preprocessor.js';
import { extractIntentFeatureRuleBased } from '../agent/intent-feature.js';
import { buildMemoryInjection, type UserContext } from '../memory/user-context.js';
import type { UserContextStore } from '../memory/user-context-store.js';
import { rewriteWithMemory } from '../agent/rewrite-with-memory.js';
import { extractRememberInstruction } from '../agent/memory-instruction.js';
import { isRollbackQuery, rollbackLatest } from '../security/operation-log.js';
import { culturalReplyPostProcess } from '../postprocess/cultural-reply.js';
import type { RouteCaseStore } from '../agent/route-case-store.js';
import { prepareQuery } from './stages/s1_prepare.js';
import { classifyQuery } from './stages/s2_classify.js';
import type { IntentKey } from './stages/s2_classify.js';
import { runSearchLoop, type BrowserFetcher } from './search-loop.js';
import { createClientForRole } from './llm.js';
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

/** 知识/资讯类意图：P0 四步链路强制抓正文直接作答 */
const CONTENT_READING_INTENTS = new Set<IntentKey>([
  'factual',
  'news',
  'comparison',
  'how_to',
  'experience',
  'troubleshooting',
]);

/** 工具配额/API 告警特征：这类提示只进状态栏/日志，不污染对话气泡（P3） */
const TOOL_ALERT_RE = /Tavily 计划用量已超限|余额已耗尽|余额不足|配额|限流|额度|API Key|API 密钥/;

/** 搜索预警拆分：chatNotices 为用户可见提示（如联网暂时不可用）；toolNotices 为工具告警（P1/P3） */
export function splitSearchNotices(
  notices: string[],
): { chatNotices: string[]; toolNotices: string[] } {
  const chatNotices: string[] = [];
  const toolNotices: string[] = [];
  for (const notice of new Set(notices)) {
    if (TOOL_ALERT_RE.test(notice)) toolNotices.push(notice);
    else chatNotices.push(notice);
  }
  return { chatNotices, toolNotices };
}

/** 给 skill 的 LLM 客户端包一层 onToken：skill 长文生成也能流式渐进展示（不影响返回契约）；无 onToken 时透传原样 */
function withStreamingToken(client: LLMClient, onToken?: (delta: string) => void): LLMClient {
  return {
    ...client,
    complete: (messages, completeOpts) =>
      client.complete(messages, onToken ? { ...completeOpts, onToken } : completeOpts),
  };
}

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
  gate_triggered: 'none' | 'emergency' | 'low_confidence' | 'safety' | 'synthesis_timeout';
  elapsed_ms: number;
  /** E275：query 的 predicate 类型（数值/时序/操作/观点），§6.1 输出新增字段（搜索路径填写，兜底路径缺省） */
  predicate?: ReturnType<typeof classifyPredicate>;
  /** P1：direct skill 计时拆分（github-reader 等），输出 JSON 可直接观测 */
  timing?: { totalMs: number; fetchMs: number; synthesisMs: number; synthesisError?: string };
  mode?: UiMode;
  submode?: string;
  videos?: VideoResult[];
  notice?: string;
  /** P3：工具配额/API 告警（进状态栏/日志，不污染对话气泡） */
  toolNotice?: string;
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
  /** E243：市场 Skill 可执行器（命中已安装 Skill 触发词 → 直连执行；测试可注入） */
  marketSkillRunner?: {
    listInstalledWithTriggers(): Array<{ name: string; triggers: string[] }>;
    run(name: string, opts?: { input?: string }): MarketRunOutcome;
  };
  trajectory?: TrajectoryLogLike;
  sessionContext?: Pick<SessionContextStore, 'load' | 'append' | 'compactIfNeeded'>;
  /** E309：困难升级/人类裁决（判定与记录；测试可注入内存实现，缺省共享真实单例） */
  escalation?: {
    decisionLog?: Pick<DecisionLog, 'record'>;
    state?: Pick<EscalationState, 'recordFailure' | 'recordSuccess' | 'consecutiveFailures'>;
  };
  /** E315：通知枢纽自动写入（§11.3 秘书日报；测试可注入内存实现，缺省共享真实单例 data/notifications.jsonl） */
  notificationStore?: Pick<NotificationStore, 'add'>;
  browserSession?: BrowserFetcher;
  /** v1.0 S2：深度报告任务状态存储（取消恢复；测试可注入内存实现） */
  deepReportStore?: DeepReportStoreLike;
  /** E231：深度报告专用 LLM（per-call 预算=[P-13]，测试可注入 FakeLLM；缺省用 createDeepReportHeavyClient） */
  deepReportLlm?: LLMClient | null;
  /** §10.3 搜索脱敏开关（默认开；工程开发栏显式携带项目上下文时可关） */
  querySanitizeEnabled?: boolean;
}

export interface PipelineOptions {
  files?: RawFileLike[];
  userId?: string;
  conversationId?: string;
  modelSelection?: ModelSelection;
  /** E282：运行时看门狗开关（CLI/gateway 生产接线开启，测试保持关闭避免读真实轨迹） */
  watchdog?: boolean;
  /** E324：confirm 恢复执行标记（内部：聊天批准后递归重放原请求时抑制二次拦截） */
  confirmResume?: boolean;
  /** E330：confirm 恢复执行钉死原裁决时的执行器/意图（内部，防恢复路由被市场 Skill 触发词抢走） */
  confirmResumeExecutor?: string;
  confirmResumeIntent?: string;
  /** 外部取消信号（v1.0 S1 深度报告等长任务透传） */
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
  /** 合成/生成流式增量回调（CLI 渐进展示；不影响 answer 返回契约） */
  onToken?: (delta: string) => void;
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

let sharedDecisionLog: DecisionLog | null = null;
function defaultDecisionLog(): DecisionLog {
  sharedDecisionLog ??= new DecisionLog();
  return sharedDecisionLog;
}

let sharedEscalationState: EscalationState | null = null;
function defaultEscalationState(): EscalationState {
  sharedEscalationState ??= new EscalationState();
  return sharedEscalationState;
}

let sharedNotificationStore: NotificationStore | null = null;
function defaultNotificationStore(): Pick<NotificationStore, 'add'> {
  sharedNotificationStore ??= new NotificationStore();
  return sharedNotificationStore;
}

/** E315：通知写入失败不阻塞主对话 */
function safeNotify(
  log: Pick<NotificationStore, 'add'>,
  event: Parameters<NotificationStore['add']>[0],
): void {
  try {
    log.add(event);
  } catch {
    // 通知写入失败不阻塞主对话
  }
}

let sharedDeepReportStore: DeepReportStore | null = null;
function defaultDeepReportStore(): DeepReportStore {
  sharedDeepReportStore ??= new DeepReportStore();
  return sharedDeepReportStore;
}

/** direct skill 分支：Skill result 内部 evidence 归一化为 pipeline Evidence[] */
function normalizeSkillEvidence(result: unknown): Evidence[] {
  if (!result || typeof result !== 'object') return [];
  const raw = (result as Record<string, unknown>).evidence;
  if (!Array.isArray(raw)) return [];
  const out: Evidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.url !== 'string' || !e.url) continue;
    if (
      typeof e.title === 'string' &&
      typeof e.domain === 'string' &&
      typeof e.score === 'number' &&
      (e.type === '[hard]' || e.type === '[soft]')
    ) {
      out.push({ title: e.title, url: e.url, domain: e.domain, score: e.score, type: e.type });
      continue;
    }
    // github-reader 等内部证据：api/raw 为硬证据，web 为软证据
    if (e.type === 'api' || e.type === 'raw' || e.type === 'web') {
      out.push({
        title: e.url,
        url: e.url,
        domain: getHostname(e.url),
        score: 1,
        type: e.type === 'web' ? '[soft]' : '[hard]',
      });
    }
  }
  return out;
}

/** P0：低置信时答案开头注入醒目声明；github-reader 明确 README 级 */
function buildLowConfidenceWarning(confidence: number, skillName: string): string {
  const note =
    skillName === 'github-reader' ? '以下内容为 README 级初步判断' : '以下内容为初步判断';
  return `> ⚠️ 本结论置信度仅 ${confidence.toFixed(3)}，${note}，大量细节未验证，仅供参考。`;
}

function readSkillTiming(
  result: unknown,
): {
  durationMs?: number;
  fetchMs?: number;
  synthesisMs?: number;
  synthesisError?: string;
} {
  if (!result || typeof result !== 'object') return {};
  const timing = (result as Record<string, unknown>).timing;
  if (!timing || typeof timing !== 'object') return {};
  const t = timing as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  return {
    durationMs: num(t.totalMs),
    fetchMs: num(t.fetchMs),
    synthesisMs: num(t.synthesisMs),
    ...(typeof t.synthesisError === 'string' && t.synthesisError
      ? { synthesisError: t.synthesisError }
      : {}),
  };
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
  // E264：身份问答确定性硬规则优先（免 LLM 分类，秒回“你现在是什么模型”等；routeSelected 分支兜底）
  // E309：§4.3.1 困难升级入口检查——连续纠正 [P-48] / 连续失败 [P-47] 时停止当前方向
  const escalationLog = deps.escalation?.decisionLog ?? defaultDecisionLog();
  const escalationState = deps.escalation?.state ?? defaultEscalationState();
  const notificationLog = deps.notificationStore ?? defaultNotificationStore();
  // E324：confirm 真阻断需要完整 DecisionLog（pendingForConversation/adjudicate）；
  // 注入对象仅实现 record 时回落共享真实库，避免把测试写入真实裁决记录
  const confirmDecisionLog =
    deps.escalation?.decisionLog instanceof DecisionLog
      ? deps.escalation.decisionLog
      : defaultDecisionLog();
  // E324：confirm 真阻断预检——同一会话存在带 resume 的 open pending 时，整句批准/取消
  if (conversationId && !opts.confirmResume) {
    const reply = parseApprovalReply(prepared.cleanQuery);
    if (reply) {
      const pendingAction = confirmDecisionLog.pendingForConversation(conversationId);
      if (pendingAction) {
        confirmDecisionLog.adjudicate(pendingAction.id, reply === 'approve' ? 'approve' : 'reject', {
          note: 'chat_reply',
        });
        if (reply === 'approve' && pendingAction.resume?.query) {
          // 批准：带 confirmResume 标记递归重放原请求，走同一条 pipeline 恢复执行；
          // E330：同时钉死原裁决时的 executor/intent，防恢复路由被市场 Skill 触发词抢走
          return await pipeline(pendingAction.resume.query, deps, {
            ...opts,
            confirmResume: true,
            confirmResumeExecutor: pendingAction.resume.executor,
            confirmResumeIntent: pendingAction.resume.intent,
          });
        }
        const answer = '已取消该操作，不会执行。';
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
        };
      }
    }
  }
  if (conversationId) {
    if (
      sessionCtx &&
      countConsecutiveCorrections(sessionCtx.turns) >= PARAMS.correctionEscalationThreshold
    ) {
      const answer = correctionEscalationMessage();
      escalationLog.record({
        trigger: 'escalation',
        question: answer,
        decision: 'escalate',
        note: 'user_correction',
        conversationId,
      });
      safeNotify(notificationLog, { role: '秘书', kind: 'escalation', title: '连续纠正升级', detail: answer });
      return {
        query,
        answer,
        confidence: 0.5,
        evidence: [],
        gate_triggered: 'none',
        elapsed_ms: Date.now() - start,
      };
    }
    if (
      escalationState.consecutiveFailures(conversationId) >= PARAMS.failureEscalationThreshold
    ) {
      const answer = failureEscalationMessage();
      escalationLog.record({
        trigger: 'escalation',
        question: answer,
        decision: 'escalate',
        note: 'consecutive_failure',
        conversationId,
      });
      safeNotify(notificationLog, { role: '秘书', kind: 'escalation', title: '连续失败升级', detail: answer });
      return {
        query,
        answer,
        confidence: 0.3,
        evidence: [],
        gate_triggered: 'low_confidence',
        elapsed_ms: Date.now() - start,
      };
    }
  }
  const ruleFeatures = extractIntentFeatureRuleBased(routeQuery, processed.attachmentSignals);
  if (ruleFeatures.actionType === 'self_identity') {
    safeProgress('stage2');
    const answer = buildSelfIdentityAnswer(opts.modelSelection);
    await recordSessionTurns(query, answer);
    recordTrajectory({
      type: 'answer',
      answer: {
        answerSnippet: answer.slice(0, 300),
        confidence: 0.85,
        gateTriggered: 'none',
        elapsedMs: Date.now() - start,
      },
    });
    return {
      query,
      answer,
      confidence: 0.85,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: 'knowledge',
    };
  }
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
    // E309：人类裁决记录（§2.3）——摆了什么选项给用户（decision=pending，批准/否决留待用户答复时回填）
    if (conversationId) {
      try {
        escalationLog.record({
          trigger: 'human_arbitration',
          question: route.decision.question,
          options:
            route.decision.type === 'option_clarify'
              ? route.decision.options.map((o) => o.label)
              : undefined,
          decision: 'pending',
          conversationId,
          confidence: route.confidence,
        });
        safeNotify(notificationLog, {
          role: '老板',
          kind: 'risk_decision',
          title: '待你裁决',
          detail: route.decision.question,
        });
      } catch {
        // 裁决记录失败不阻塞回答
      }
    }
    return {
      query,
      answer: `${route.decision.question}${options}`,
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
    };
  }
  let routeSelected =
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
  if (routeSelected.intent === 'self_identity') {
    // E264：身份问答直达（“你现在是什么模型”等），不搜索、不调 LLM，秒回当前模型信息
    const answer = buildSelfIdentityAnswer(opts.modelSelection);
    await recordSessionTurns(query, answer);
    recordTrajectory({
      type: 'answer',
      answer: {
        answerSnippet: answer.slice(0, 300),
        confidence: 0.85,
        gateTriggered: 'none',
        elapsedMs: Date.now() - start,
      },
    });
    return {
      query,
      answer,
      confidence: 0.85,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
    };
  }
  // E324：confirm 真阻断第一刀——confirm 路由 + 写类执行器：挂起等批准，不直接执行。
  // 知识问答/搜索/专用意图已在前序短路；confirmResume 标记的恢复执行不二次拦截。
  if (
    !opts.confirmResume &&
    conversationId &&
    route.decision.type === 'confirm' &&
    isConfirmWriteExecutor(routeSelected.executor)
  ) {
    const existing = conversationId ? confirmDecisionLog.pendingForConversation(conversationId) : null;
    if (existing) {
      const answer = '还有一步待批准的操作没处理：请先在上一条里回复「执行」或「取消」，或到右侧「裁决」页处理。';
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
    }
    const holdAnswer = buildConfirmHoldAnswer(
      routeSelected.executor ?? '',
      prepared.originalQuery,
    );
    try {
      confirmDecisionLog.record({
        trigger: 'human_arbitration',
        question: holdAnswer,
        options: ['执行', '取消'],
        decision: 'pending',
        resume: {
          query: prepared.originalQuery || prepared.cleanQuery,
          executor: routeSelected.executor ?? '',
          intent: routeSelected.intent,
        },
        conversationId,
        confidence: route.confidence,
      });
      safeNotify(notificationLog, {
        role: '老板',
        kind: 'risk_decision',
        title: '待你裁决',
        detail: holdAnswer,
      });
    } catch {
      // 裁决记录失败不阻塞挂起回复
    }
    return {
      query,
      answer: holdAnswer,
      confidence: route.confidence,
      evidence: [],
      gate_triggered: 'none',
      elapsed_ms: Date.now() - start,
      mode: uiRoute.mode,
      submode: uiRoute.submode,
    };
  }
  // E330：confirm 恢复执行钉死原裁决动作——强制回到被批准时的 executor/intent 且 searchNeed=false，
  // 避免恢复路径重新路由时被市场 Skill 触发词（如裸「提醒」）抢走而执行到别的 Skill。
  if (opts.confirmResume && opts.confirmResumeExecutor) {
    routeSelected.executor = opts.confirmResumeExecutor;
    if (opts.confirmResumeIntent) routeSelected.intent = opts.confirmResumeIntent;
    routeSelected.searchNeed = false;
  }
  // E243 收口：市场 Skill 自然语言路由（命中已安装 Skill 触发词 → 直连执行，绕开搜索）
  // 安全/专用意图已在前面短路返回；deep_report 走深度报告专用链路，不拦截。
  if (
    !opts.confirmResume && // E330：恢复执行按原 executor 分发，跳过市场块
    deps.marketSkillRunner &&
    routeSelected.intent !== 'deep_report' &&
    routeSelected.intent !== 'github_analysis'
  ) {
    // E301：路由已直连本地 Skill（如 office-daily 搜信）时，2 字泛触发词（周报/日报/模板等）不抢专属意图；
    // ≥3 字定向触发词（周报模板/生成周报/会议纪要等）仍视为明确意图，可覆盖本地路由。
    const minTriggerLength = route.decision.type === 'direct' ? 3 : 2;
    const skillHit = matchInstalledSkillTrigger(
      prepared.cleanQuery,
      deps.marketSkillRunner.listInstalledWithTriggers(),
      minTriggerLength,
    );
    if (skillHit) {
      safeArtifact({ skill: skillHit.skillName, state: 'generating' });
      const outcome = deps.marketSkillRunner.run(skillHit.skillName, { input: prepared.cleanQuery });
      if (outcome.ok) {
        const answer = renderMarketSkillAnswer(outcome);
        safeArtifact({ skill: skillHit.skillName, state: 'done' });
        recordTrajectory({
          type: 'skill',
          skill: {
            name: outcome.name,
            version: outcome.version,
            kind: 'market_trigger',
            outputSnippet: answer.slice(0, 300),
          },
        });
        recordTrajectory({
          type: 'answer',
          answer: {
            answerSnippet: answer.slice(0, 300),
            confidence: Math.max(0.75, route.confidence),
            gateTriggered: 'none',
            elapsedMs: Date.now() - start,
          },
        });
        try {
          await postProcess(
            {
              query,
              answer,
              confidence: Math.max(0.75, route.confidence),
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
          confidence: Math.max(0.75, route.confidence),
          evidence: [],
          gate_triggered: 'none',
          elapsed_ms: Date.now() - start,
          mode: uiRoute.mode,
          submode: uiRoute.submode,
        };
      }
      safeArtifact({ skill: skillHit.skillName, state: 'failed' });
      return {
        query,
        answer:
          `✅ 已命中市场 Skill「${outcome.name} v${outcome.version}」\n` +
          `⚠️ 执行失败：${outcome.error ?? '未知错误'}。`,
        confidence: route.confidence,
        evidence: [],
        gate_triggered: 'none',
        elapsed_ms: Date.now() - start,
        mode: uiRoute.mode,
        submode: uiRoute.submode,
      };
    }
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
        // 按 skill 名解析合成客户端：github-reader 等速读型 skill 经 completeForSkill 切 medium 档，
        // 其余回落注入的 complete（测试注入 mock 时走原逻辑，不构造真实 client）
        const resolvedComplete = skillDeps.completeForSkill?.(skillName) ?? skillDeps.complete;
        const skillDepsForRun: SkillDeps = {
          ...skillDeps,
          ...(resolvedComplete
            ? { complete: withStreamingToken(resolvedComplete, opts.onToken) }
            : {}),
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
        const skillConfidence =
          typeof output.confidence === 'number' && Number.isFinite(output.confidence)
            ? Math.max(0, Math.min(1, output.confidence))
            : route.confidence;
        const skillEvidence = normalizeSkillEvidence(output.result);
        const skillTiming = readSkillTiming(output.result);
        const answerTiming =
          skillTiming.durationMs !== undefined
            ? {
                totalMs: skillTiming.durationMs,
                fetchMs: skillTiming.fetchMs ?? 0,
                synthesisMs: skillTiming.synthesisMs ?? 0,
                ...(skillTiming.synthesisError
                  ? { synthesisError: skillTiming.synthesisError }
                  : {}),
              }
            : undefined;
        if (skillConfidence <= 0.6) {
          answer = `${buildLowConfidenceWarning(skillConfidence, skill.name)}\n\n${answer}`;
        }
        recordTrajectory({
          type: 'skill',
          skill: {
            name: skill.name,
            version: skill.version,
            kind: 'direct',
            outputSnippet: answer.slice(0, 300),
            ...skillTiming,
          },
        });
        recordTrajectory({
          type: 'answer',
          answer: {
            answerSnippet: answer.slice(0, 300),
            confidence: skillConfidence,
            gateTriggered: 'none',
            elapsedMs: Date.now() - start,
          },
        });
        try {
          await postProcess(
            {
              query,
              answer,
              confidence: skillConfidence,
              evidence: skillEvidence,
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
          confidence: skillConfidence,
          evidence: skillEvidence,
          gate_triggered: 'none',
          elapsed_ms: Date.now() - start,
          ...(answerTiming ? { timing: answerTiming } : {}),
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
      subQueries: search.subQueries,
    },
  });

  // E275 诊断（DIAGNOSE_NUMERIC=1）：候选池 dump——原始结果合并后、融合打分前。
  // 与 evidence dump 对照定位「市值/排名」类 query 缺具体数字的故障层（融合丢弃 or 召回缺失）。
  if (process.env.DIAGNOSE_NUMERIC === '1') {
    recordTrajectory({
      type: 'diagnose',
      diagnose: {
        stage: 'candidates',
        items: search.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 200),
          fullContent: r.content,
          numericCount: numericUnitCount(r.content),
          hasNumeric: hasNumericUnit(r.content),
          cooccurs: cooccursWithQuery(r.content, prepared.cleanQuery),
          published: r.published,
        })),
      },
    });
  }

  // Tavily 月配额超限提示只对运维/监控有用，聊天场景静默（Bocha/AnySearch 正常时纯噪音）
  // P1/P3：工具告警（配额/API）拆分到状态栏/日志，聊天只保留用户可见提示；
  // 全部引擎都失败时，明确提示“联网暂时不可用”，仍尽力作答
  const { chatNotices, toolNotices } = splitSearchNotices(search.notices ?? []);
  if (search.results.length === 0 && chatNotices.length === 0) {
    chatNotices.push('联网暂时不可用，以下为模型内置知识回答（可能非最新）');
  }
  // M6 探针：search→synth 内部阶段计时（P0 抓正文 / 数值补检索 / Stage 5 合成）
  let secondPassMs: number | undefined;
  let contentFetchMs: number | undefined;
  let supplementMs: number | undefined;

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
    const secondPassStart = Date.now();
    const secondPassResults = await fetchSecondPassTargets(
      targets,
      prepared.cleanQuery,
      deps.browserSession,
      PARAMS.secondPassBudgetMs,
    );
    secondPassMs = Date.now() - secondPassStart;
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

  // P0（四步链路）：知识/资讯类查询强制「检索→抓正文→LLM 抽取作答」。
  // 抓取融合 Top HTML 页正文直接进 pageContents 喂合成，并追加到证据列表；
  // 器件查询（shouldSecondPass）仍走上面的低置信二次取证（含 PDF 解析），不重复抓。
  const pageContents: Array<{ title: string; url: string; text: string }> = [];
  if (
    CONTENT_READING_INTENTS.has(classified.intent) &&
    search.results.length > 0 &&
    !shouldSecondPass(prepared.cleanQuery)
  ) {
    // 低置信二次取证已抓的 browser 证据直接并入 pageContents（不重复抓）
    for (const item of search.results.filter((r) => r.provider === 'browser')) {
      if (!pageContents.some((p) => p.url === item.url)) {
        pageContents.push({ title: item.title, url: item.url, text: item.content });
      }
    }
    const alreadyFetched = new Set(pageContents.map((p) => p.url));
    const targets = pickKnowledgeContentTargets(
      fused.items,
      search.results,
      prepared.cleanQuery,
      3,
    ).filter((t) => !alreadyFetched.has(t.url));
    const contentFetchStart = Date.now();
    const fetched = await fetchSecondPassTargets(
      targets,
      prepared.cleanQuery,
      deps.browserSession,
      PARAMS.secondPassBudgetMs,
    );
    contentFetchMs = Date.now() - contentFetchStart;
    if (targets.length > 0 && fetched.length === 0) {
      toolNotices.push('网页正文抓取失败（站点不可访问或被反爬拦截），回答将基于搜索结果摘要');
    }
    for (const { target, text } of fetched) {
      const content = text.slice(0, PARAMS.knowledgePageFetchChars);
      pageContents.push({ title: target.title, url: target.url, text: content });
      if (!evidence.some((e) => e.url === target.url)) {
        evidence.push({
          title: target.title,
          url: target.url,
          domain: getHostname(target.url),
          score: 0.7,
          type: '[soft]',
        });
      }
    }
  }

  const videoResults = collectVideoResults(evidence);
  const videoBlock = buildVideoBlock(videoResults);

  // E275 覆盖度门控：数值 predicate 且 evidence 完全无数字 → 一次带单位约束的补检索
  // （安全网；本次市值题诊断已证明候选池不缺数字页——缺的是融合 top-K，由 [P-136] 加分解决。
  //  触发条件刻意收紧为「一个数字都没有」，避免「72MHz 主频」等带数字但无量级单位的 query 空跑补检索）
  if (
    classifyPredicate(prepared.cleanQuery) === 'numeric' &&
    !hasAnyNumber(
      [...evidence.map((e) => e.title), ...pageContents.map((p) => `${p.title} ${p.text}`)].join(
        '\n',
      ),
    )
  ) {
    const supplementQuery = `${prepared.cleanQuery}${PARAMS.numericSupplementSuffix}`;
    const supplementStart = Date.now();
    const supplement = await runSearchLoop(supplementQuery, {
      originalQuery: prepared.cleanQuery,
      intent: classified.intent,
      cacheKey: `search:loop:numeric-supplement:${Date.now()}`,
      cachedValue: null,
      providers: deps.providers,
      quota: deps.quota,
      llm: deps.llm,
      sourceStats: deps.sourceStats,
      tavily: { enabled: tavilyEnabled, trigger: tavilyTrigger },
      browserSession: deps.browserSession,
      maxSubSearches: 1,
    });
    supplementMs = Date.now() - supplementStart;
    if (supplement.results.length > 0) {
      for (const r of supplement.results) {
        if (!search.results.some((x) => x.url === r.url)) search.results.push(r);
      }
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
        refused.items.length > 0 ? Math.max(...refused.items.map((f) => f.finalScore)) : 0;
      gate = rule3.serious
        ? 'safety'
        : refused.items.length === 0 || refused.gated || refused.lowConfidence
          ? 'low_confidence'
          : 'none';
    }
  }

  // E275 诊断（DIAGNOSE_NUMERIC=1）：evidence dump——融合打分后、送入合成前。
  // 若候选池含「寒武纪 6300 亿/讯飞 1022 亿」而这里没有 → 确诊融合过滤；反之确诊召回缺失。
  if (process.env.DIAGNOSE_NUMERIC === '1') {
    recordTrajectory({
      type: 'diagnose',
      diagnose: {
        stage: 'evidence',
        items: [
          ...evidence.map((e) => {
            const src = search.results.find((r) => r.url === e.url);
            return {
              title: e.title,
              url: e.url,
              score: e.score,
              snippet: (src?.content ?? '').slice(0, 200),
              numericCount: numericUnitCount(src?.content ?? ''),
              hasNumeric: hasNumericUnit(src?.content ?? ''),
              cooccurs: cooccursWithQuery(src?.content ?? '', prepared.cleanQuery),
            };
          }),
          ...fused.ranked.slice(3).map((f) => ({
            title: f.result.title,
            url: f.result.url,
            score: f.finalScore,
            snippet: f.result.content.slice(0, 200),
            numericCount: numericUnitCount(f.result.content),
            hasNumeric: hasNumericUnit(f.result.content),
            cooccurs: cooccursWithQuery(f.result.content, prepared.cleanQuery),
          })),
        ],
      },
    });
  }

  // P-ZZZ' 信号 B：证据覆盖度检测（predicate 类型 → 形态缺失检查），缺口注入合成诚实边界
  const readiness = checkEvidenceReadiness(prepared.cleanQuery, [
    ...evidence.map((e) => e.title),
    ...pageContents.map((p) => `${p.title} ${p.text}`),
  ]);

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
  const synthStart = Date.now();
  const synthesized = await synthesizeAnswer(prepared.cleanQuery, fused, classified, {
    // UI 显式选档时按所选 provider:role 走模型（缺省 medium 便宜且快），
    // 未选档（CLI 等）回落到调用方默认客户端（E278：CLI 由 heavy 改 medium，对齐 P-105）
    llm: opts.modelSelection
      ? createClientForRole(opts.modelSelection.role, {
          preferredId: opts.modelSelection.provider,
        })
      : deps.llm,
    serious: rule3.serious,
    memoryNotes: memoryBlock ? [...memoryNotes, memoryBlock] : memoryNotes,
    aiAnswers: search.aiAnswers,
    experienceNotes,
    skillHints,
    skillOutputs,
    pageContents,
    readinessGap: readiness.gap,
    primaryLens: routeSelected.primaryLens,
    modelTier: opts.modelSelection?.role ?? routeModelTier,
    preferredProvider: opts.modelSelection?.provider,
    onModelRoute: (info) => {
      lastModelRoute = info;
      recordTrajectory({ type: 'model_route', modelRoute: info });
    },
    onToken: opts.onToken,
  });
  const synthesisMs = Date.now() - synthStart;
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
      ...(synthesized.synthesisError ? { error: synthesized.synthesisError } : {}),
      readiness: { kind: readiness.kind, ready: readiness.ready, ...(readiness.gap ? { gap: readiness.gap } : {}) },
      ...(secondPassMs !== undefined ? { secondPassMs } : {}),
      ...(contentFetchMs !== undefined ? { contentFetchMs } : {}),
      ...(supplementMs !== undefined ? { supplementMs } : {}),
      synthesisMs,
    },
  });

  if (synthesized.source === 'llm') {
    for (const id of usedExperienceIds) deps.experienceManager?.recordUse?.(id);
    if (usedSkillName) deps.skillLifecycle?.recordUse?.(usedSkillName);
  }

  // P-130/P-XXX：合成 LLM 调用失败（如 heavy 档超时）→ 显式标记 gate，不再静默「搜索到了 N 条」
  if (synthesized.source === 'fallback' && synthesized.synthesisFailed) {
    // E276：合成超时优先于低置信门——否则「预算超时」会被 low_confidence 掩盖成「证据不足」
    if (gate === 'none' || gate === 'low_confidence') gate = 'synthesis_timeout';
    if (!chatNotices.some((n) => n.includes('回答生成超时'))) {
      chatNotices.push('回答生成超时，以下为基于现有证据的摘要；可重试或切换更快档位。');
    }
  }

  // v1.0 S1/S2：深度报告（§4.3.2）——搜索证据基础上分阶段生成结构化报告 + 证据附录；
  // 取消后同 query 再次触发自动恢复上次已生成分节（状态持久化，逐节落盘）
  let finalAnswerText = synthesized.answer + videoBlock;
  // E309：综合分 < [P-16] 时明确「我不确定」（§4.3.1 诚实低置信），并记录
  if (gate === 'low_confidence' && confidence < PARAMS.confidenceDropThreshold) {
    finalAnswerText = `${lowConfidenceHonestMessage(confidence)}\n\n${finalAnswerText}`;
    if (conversationId) {
      escalationLog.record({
        trigger: 'low_confidence',
        question: lowConfidenceHonestMessage(confidence),
        decision: 'resolved',
        note: 'below_confidence_floor',
        conversationId,
        confidence,
      });
      safeNotify(notificationLog, {
        role: '秘书',
        kind: 'low_confidence',
        title: '低置信答复',
        detail: lowConfidenceHonestMessage(confidence),
      });
    }
  }
  if (routeSelected.intent === 'deep_report') {
    const reportStore = deps.deepReportStore ?? defaultDeepReportStore();
    const resumed = reportStore.findResumable(prepared.cleanQuery);
    if (resumed) safeProgress('report-resumed');
    const jobId = reportStore.start(prepared.cleanQuery, evidence.length, resumed ?? null);
    try {
      const report = await generateDeepReport(prepared.cleanQuery, evidence, {
        llm: deps.deepReportLlm ?? createDeepReportHeavyClient() ?? deps.llm,
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

  // E282：环境噪音显式化——窗口内 synthesis_timeout 占比达标时优先于其他工具告警
  if (opts.watchdog === true) {
    const watchdog = checkSynthesisHealth();
    if (watchdog.triggered && watchdog.message && !toolNotices.includes(watchdog.message)) {
      toolNotices.unshift(watchdog.message);
    }
  }

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
  // E309：§4.3.1 [P-47] 会话级连续失败计数（搜索全空或合成失败记失败，成功归零）
  if (conversationId) {
    const pipelineFailed = search.results.length === 0 || synthesized.synthesisFailed === true;
    if (pipelineFailed) escalationState.recordFailure(conversationId);
    else escalationState.recordSuccess(conversationId);
  }
  return {
    query,
    answer: final.answer,
    confidence: final.confidence,
    evidence: final.evidence,
    gate_triggered: final.gateTriggered as AnswerResult['gate_triggered'],
    elapsed_ms: final.elapsedMs,
    predicate: classifyPredicate(prepared.cleanQuery),
    mode: uiRoute.mode,
    submode: uiRoute.submode,
    videos: videoResults.length > 0 ? videoResults : undefined,
    ...(chatNotices.length > 0 ? { notice: chatNotices[0] } : {}),
    ...(toolNotices.length > 0 ? { toolNotice: toolNotices[0] } : {}),
  };
}

const ARTIFACT_PATH_RE = /[\w./\\:-]+\.(zip|kicad_sch|kicad_pcb|net|pdf|html?|md|txt)/i;

function extractArtifactPath(text: string): string | undefined {
  const match = ARTIFACT_PATH_RE.exec(text);
  return match?.[0];
}
