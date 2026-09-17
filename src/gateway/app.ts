/**
 * 单一共享 TurnLoop 网关（E106）
 * CLI / UI / 未来聊天频道都通过同一 pipeline；错误不向客户端泄露原始细节。
 */

import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { auditRouteCases } from '../agent/route-case-audit.js';
import { RouteCaseStore, type RouteCaseRecord, type RouteFeedback } from '../agent/route-case-store.js';
import { buildModelCatalog } from '../config/model-catalog.js';
import { PARAMS } from '../config/params.js';
import { defaultRegistry } from '../search/llm-registry.js';
import { OpenAiCompatibleClient } from '../search/llm-client.js';
import { parseModelId } from '../search/model-id.js';
import { pipeline, type PipelineDeps } from '../search/pipeline.js';
import { bochaBalanceWarning, queryBochaBalance } from '../search/balance.js';
import { listSkillMetadata } from '../skills/registry.js';
import { getSubAgents } from '../mcp/registry.js';
import { WorkflowPlanStore } from '../mcp/workflow-plan-store.js';
import { loadMcpAgentConfig } from '../mcp/config.js';
import { writeDisabledSkills } from '../config/skills-config.js';
import { readUsageBudget, writeUsageBudget } from '../config/usage-budget.js';
import { readSecurityConfig, writeSecurityConfig } from '../config/security-config.js';
import { DecisionLog, type AdjudicateResult, type DecisionLogEntry } from '../escalation/decision-log.js';
import { ExperienceManager } from '../memory/experience.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { SessionContextStore } from '../memory/session-context.js';
import {
  canAccessMemoryAsset,
  memoryAssetsForMode,
  memoryItemAsset,
  parseMemoryAccessMode,
} from '../memory/asset-acl.js';
import { handleSlashCommand } from '../slash/slash-commands.js';
import { aggregateUsage, readUsage } from '../usage/usage-store.js';
import { NotificationStore } from '../notifications/notification-store.js';
import { classifyEventPriority, renderNotificationDigest } from '../skills/market/notification-hub.js';
import { listProjectFiles, readHtmlArtifactRaw, readTextFilePreview, readXmindFilePreview } from './files.js';
import { listProjectChangeRecords } from './change-history.js';
import { ConcurrencyGate, RateLimiter } from './rate-limit.js';
import { classifyCommand, runCommand } from './terminal.js';
import { publishArtifactEvent, subscribeArtifactEvents } from './artifact-bus.js';
import type { RawFileLike } from '../skills/deps.js';
import { dataUrlToRawFile, type AttachmentPayload } from './attachments.js';
import { loadCredentials, saveCredentials, validateCredentials } from '../mail/credentials.js';
import { buildCalendarIcs, importIcsToDb, openCalendarDb } from '../skills/calendar-skill/index.js';
import { FeedbackStore, isAnswerFeedbackReason } from '../feedback/feedback-store.js';
import { detectCorrectionPattern, SkillCandidateStore } from '../feedback/skill-candidate-store.js';
import { buildSkillCandidateDraft } from '../feedback/skill-candidate-draft.js';
import { buildCorrectionPreferenceFact } from '../memory/persona-memory.js';
import {
  AnswerPostprocessRuleStore,
  PersistedAnswerPostprocessRuntime,
} from '../postprocess/answer-postprocess-store.js';
import {
  defaultPendingProjectTransactionStore,
  type PendingProjectTransactionStore,
  type PendingProjectTransactionResolution,
} from '../security/pending-project-transaction-store.js';

export interface GatewayOptions {
  deps?: PipelineDeps;
  defaultUserId?: string;
  sessionContext?: SessionContextStore;
  routeCaseStore?: RouteCaseStore;
  userContextStore?: UserContextStore;
  experienceManager?: ExperienceManager;
  securityConfigPath?: string;
  mailCredentialsPath?: string;
  calendarDbPath?: string;
  uiDistPath?: string;
  /** E320：通知库注入（测试隔离；缺省共享真实 data/notifications.jsonl） */
  notificationStore?: NotificationStore;
  /** E323：人类裁决记录库注入（测试隔离；缺省共享真实 data/decision-log.jsonl） */
  decisionLog?: DecisionLog;
  /** E399：project-writer prepared transaction 进程内仓库（测试可注入）。 */
  pendingProjectTransactionStore?: PendingProjectTransactionStore;
  /** E374：回复 👍/👎 本地反馈库（测试可注入）。 */
  feedbackStore?: FeedbackStore;
  /** E380：重复回复修订形成的待确认 Skill 候选库。 */
  skillCandidateStore?: SkillCandidateStore;
  /** E383：用户二次确认后的 answer_postprocess 规则账本。 */
  answerPostprocessRuleStore?: AnswerPostprocessRuleStore;
}

interface AskBody {
  query?: unknown;
  userId?: unknown;
  conversationId?: unknown;
  modelId?: unknown;
  tab?: unknown;
  mode?: unknown;
  attachments?: unknown;
}

export function createGatewayApp(opts: GatewayOptions = {}): express.Express {
  const app = express();
  const routeCaseStore = opts.routeCaseStore ?? new RouteCaseStore();
  // 斜杠命令（E204）与 pipeline 的 E193 会话上下文同持久化（data/session-context/<id>.json）
  const sessionContext = opts.sessionContext ?? new SessionContextStore();
  const feedbackStore = opts.feedbackStore ?? new FeedbackStore();
  const skillCandidateStore = opts.skillCandidateStore ?? new SkillCandidateStore();
  const answerPostprocessRuleStore =
    opts.answerPostprocessRuleStore ?? new AnswerPostprocessRuleStore();
  const pendingProjectTransactionStore =
    opts.pendingProjectTransactionStore ?? defaultPendingProjectTransactionStore();
  const pipelineDeps: PipelineDeps = {
    ...(opts.deps ?? {}),
    pendingProjectTransactionStore,
    ...(opts.decisionLog || opts.deps?.escalation
      ? {
          escalation: {
            ...(opts.deps?.escalation ?? {}),
            ...(opts.decisionLog ? { decisionLog: opts.decisionLog } : {}),
          },
        }
      : {}),
    answerPostprocess:
      opts.deps?.answerPostprocess ??
      new PersistedAnswerPostprocessRuntime(answerPostprocessRuleStore),
  };
  app.use(express.json({ limit: '25mb' }));

  // SEV-1.4 + H3：网关鉴权（非 GET 端点统一挂载）+ /api/ask 速率限制
  const GATEWAY_AUTH_TOKEN = process.env.GATEWAY_AUTH_TOKEN ?? '';
  if (!GATEWAY_AUTH_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn(
      '[gateway] GATEWAY_AUTH_TOKEN 未设置：所有写端点将以 dev 模式开放。' +
        '生产或局域网暴露前必须设置。',
    );
  }
  // E341：开发期 CORS 白名单——Vite UI 开发源（5173）跨端口直连 gateway。
  // 仅未设置 GATEWAY_AUTH_TOKEN（dev 模式）时生效；生产/局域网暴露（带 token）不返回任何跨域头。
  const DEV_UI_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
  const corsWhitelist: express.RequestHandler = (req, res, next) => {
    if (GATEWAY_AUTH_TOKEN) return next();
    const origin = req.headers.origin;
    if (typeof origin === 'string' && DEV_UI_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  };
  app.use(corsWhitelist);

  const requireGatewayAuth: express.RequestHandler = (req, res, next) => {
    if (!GATEWAY_AUTH_TOKEN) return next(); // dev 模式放行
    const auth = req.headers['authorization'];
    const xToken = req.headers['x-session-token'];
    const candidate =
      typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : typeof xToken === 'string'
          ? xToken.trim()
          : '';
    // 恒定时间比较，避免时序侧信道
    const a = Buffer.from(candidate);
    const b = Buffer.from(GATEWAY_AUTH_TOKEN);
    const equal = a.length === b.length && timingSafeEqual(a, b);
    if (!equal) {
      res.status(401).json({ error: '未授权：缺少或无效 token' });
      return;
    }
    next();
  };

  // 按 IP 令牌桶限速 + 并发闸门（P16）：避免单 IP 风暴拖垮管线 / 并发打满 LLM 配额
  const RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.ASK_RATE_LIMIT_PER_MIN ?? '30'));
  const rateLimiter = new RateLimiter(RATE_LIMIT_PER_MIN);
  const askConcurrency = new ConcurrencyGate(PARAMS.askMaxConcurrent); // [P-115]
  const rateLimitAsk: express.RequestHandler = (req, res, next) => {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    if (!rateLimiter.allow(ip)) {
      res.status(429).json({ error: '请求过于频繁，请稍后再试', retryAfterSec: 60 });
      return;
    }
    next();
  };
  const concurrencyLimitAsk: express.RequestHandler = (req, res, next) => {
    if (!askConcurrency.tryAcquire()) {
      res.status(429).json({ error: '系统繁忙，请稍后再试', retryAfterSec: 5 });
      return;
    }
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      askConcurrency.release();
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'one-person-agent-gateway', contract: 'answer(query)' });
  });

  // §D.3 资源包健康检查：Bocha 余额只读查询（UI/运维可随时查看剩余次数）
  app.get('/api/bocha/balance', async (_req, res) => {
    const balance = await queryBochaBalance();
    res.json({
      ok: balance !== null,
      remainingYuan: balance?.remainingYuan ?? null,
      remainingCalls: balance?.remainingCalls ?? null,
      fetchedAt: balance?.fetchedAt ?? null,
      notice: balance ? bochaBalanceWarning(balance) : null,
    });
  });

  app.get('/api/model-providers', (_req, res) => {
    res.json(buildModelCatalog());
  });

  app.get('/api/files', (_req, res) => {
    const files = listProjectFiles(process.cwd());
    res.json({ total: files.length, files });
  });

  // E339：右栏产物区「变更记录」——projects/ watcher 差量内存环（新→旧，进程内保留，不落盘）
  app.get('/api/files/changes', (_req, res) => {
    res.json({ changes: listProjectChangeRecords() });
  });

  // E337：文件面板只读预览——只允许沙箱根内文件，防路径穿越；超 [P-151] 文本截断 / .xmind 整体拒绝
  // E345：.xmind（zip）按扩展名分发，解包读回大纲文本；损坏 zip / 超大 → 415
  app.get('/api/files/preview', async (req, res) => {
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    const isXmind = relPath.replace(/\\/g, '/').toLowerCase().endsWith('.xmind');
    const result = isXmind
      ? await readXmindFilePreview(process.cwd(), relPath, PARAMS.filePreviewMaxBytes)
      : readTextFilePreview(process.cwd(), relPath, PARAMS.filePreviewMaxBytes);
    if (!result.ok) {
      const status =
        result.error === 'bad_path' ? 400 : result.error === 'not_found' ? 404 : 415;
      const message =
        result.error === 'bad_path'
          ? '路径不合法：只允许 projects/sandbox/outputs/data/datasheets 内的相对路径'
          : result.error === 'not_found'
            ? '文件不存在'
            : result.error === 'not_file'
              ? '目标不是文件'
              : result.error === 'too_large'
                ? '文件过大，不支持预览'
                : result.error === 'bad_xmind'
                  ? '不是可读的 .xmind 文件'
                  : '不支持预览二进制文件';
      res.status(status).json({ error: message });
      return;
    }
    res.json(result);
  });


  // E354：产物 HTML 整文件只读回读——文件面板 iframe 渲染用（text/html；防穿越同 preview）
  app.get('/api/files/raw', (req, res) => {
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    const result = readHtmlArtifactRaw(process.cwd(), relPath);
    if (!result.ok) {
      const status =
        result.error === 'bad_path' ? 400 : result.error === 'not_found' ? 404 : 415;
      const message =
        result.error === 'bad_path'
          ? '路径不合法：只允许沙箱根内相对/绝对路径'
          : result.error === 'not_found'
            ? '文件不存在'
            : result.error === 'not_file'
              ? '目标不是文件'
              : result.error === 'not_html'
                ? '仅支持渲染 .html/.htm 产物'
                : '文件过大，不支持渲染';
      res.status(status).json({ error: message });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  });
  app.get('/api/events', requireGatewayAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (type: string, data: Record<string, unknown>) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('connected', { at: Date.now() });
    const unsubscribe = subscribeArtifactEvents((event) => {
      send(event.type, event.data);
    });
    req.on('close', unsubscribe);
  });

  app.get('/api/providers', (_req, res) => {
    const registry = defaultRegistry();
    res.json({
      order: registry.order(),
      providers: registry.listStatuses(),
    });
  });

  app.post('/api/providers/default', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { providerId?: unknown };
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
    const registry = defaultRegistry();
    if (!providerId || !registry.listStatuses().some((p) => p.id === providerId)) {
      res.status(400).json({ error: 'providerId 无效' });
      return;
    }
    try {
      const order = [providerId, ...registry.order().filter((id) => id !== providerId)];
      registry.setOrder(order);
      res.json({ ok: true, order });
    } catch {
      res.status(500).json({ error: '设置默认服务商失败' });
    }
  });

  app.post('/api/providers/test', requireGatewayAuth, async (req, res) => {
    const body = (req.body ?? {}) as { providerId?: unknown };
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
    const registry = defaultRegistry();
    const profile = providerId
      ? (registry.listProfiles('heavy').find((p) => p.id === providerId) ?? null)
      : null;
    if (!profile) {
      res.status(200).json({ ok: false, error: '未配置 API Key' });
      return;
    }
    const started = Date.now();
    try {
      const client = new OpenAiCompatibleClient({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.models.heavy,
        timeoutMs: 5000,
      });
      await client.complete([{ role: 'user', content: 'ping' }], { maxTokens: 1 });
      res.json({ ok: true, model: profile.models.heavy, latencyMs: Date.now() - started });
    } catch {
      res.json({ ok: false, error: '连接失败或 API Key 无效' });
    }
  });

  app.get('/api/skills', (_req, res) => {
    const lifecycle = new Map(
      (opts.deps?.skillLifecycle?.list?.() ?? []).map((stat) => [stat.name, stat]),
    );
    const skills = listSkillMetadata().map((skill) => {
      const stat = lifecycle.get(skill.name);
      return {
        ...skill,
        state: stat?.state ?? 'active',
        thumbsDownCount: stat?.thumbsDownCount ?? 0,
        consecutiveDown: stat?.consecutiveDown ?? 0,
        confidence: stat?.confidence ?? null,
      };
    });
    res.json({
      total: skills.length,
      enabled: skills.filter((s) => s.enabled).length,
      skills,
    });
  });

  app.get('/api/agents', (_req, res) => {
    const configuredIds = new Set(loadMcpAgentConfig().map((entry) => entry.id));
    const agents = getSubAgents().map((meta) => ({
      id: meta.id,
      name: meta.name,
      category: meta.category,
      available: configuredIds.has(meta.id),
    }));
    res.json({
      total: agents.length,
      available: agents.filter((agent) => agent.available).length,
      agents,
    });
  });

  app.post('/api/skills/sync', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { disabled?: unknown };
    const known = new Set(listSkillMetadata().map((s) => s.name));
    const disabled = Array.isArray(body.disabled)
      ? body.disabled.filter((item): item is string => typeof item === 'string')
      : [];
    if (disabled.some((name) => !known.has(name))) {
      res.status(400).json({ error: 'disabled 包含未知 Skill' });
      return;
    }
    writeDisabledSkills(disabled);
    res.json({ ok: true, disabled });
  });

  app.post('/api/skills/review', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { name?: unknown; action?: unknown };
    if (typeof body.name !== 'string' || body.action !== 'restore') {
      res.status(400).json({ ok: false, error: '复审操作参数非法' });
      return;
    }
    const restored = opts.deps?.skillLifecycle?.clearReview?.(body.name.trim());
    if (!restored) {
      res.status(404).json({ ok: false, error: '未找到 Skill 生命周期记录' });
      return;
    }
    res.json({ ok: true, skill: body.name.trim(), lifecycle: restored });
  });

  app.get('/api/usage/stats', (_req, res) => {
    res.json({
      stats: aggregateUsage(readUsage()),
      budget: readUsageBudget(),
    });
  });

  // E320：通知区只读 API（§11.3 秘书日报 / §4.1 右栏通知区；优先级复用 hub 纯函数单一判定口径）
  // E331：支持 page/pageSize 分页并回 total；摘要口径固定最近 200 条，与当前分页解耦。
  app.get('/api/notifications', (req, res) => {
    const userId =
      typeof req.query.userId === 'string' && req.query.userId.trim()
        ? req.query.userId.trim()
        : (opts.defaultUserId ?? 'default');
    const pageRaw = Number(req.query.page ?? 1);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const sizeRaw = Number(req.query.pageSize ?? 20);
    const pageSize = Number.isFinite(sizeRaw) ? Math.min(Math.max(1, Math.floor(sizeRaw)), 200) : 20;
    const store = opts.notificationStore ?? new NotificationStore();
    try {
      const all = store.all();
      // E336：已裁决（approve/reject）的 pending 不再展示对应「待你裁决」通知，消除裁决后残留
      const logStore = opts.decisionLog ?? new DecisionLog();
      const decided = new Set<string>();
      try {
        for (const row of logStore.all()) {
          if (row.refId) decided.add(row.refId);
        }
      } finally {
        try {
          logStore.close();
        } catch {
          // 读句柄关闭失败可忽略
        }
      }
      const visible = all.filter((entry) => !entry.decisionId || !decided.has(entry.decisionId));
      const total = visible.length;
      const newestFirst = [...visible]
        .reverse()
        .map((entry) => ({ ...entry, priority: classifyEventPriority(entry) }));
      const start = (page - 1) * pageSize;
      const entries = newestFirst.slice(start, start + pageSize);
      res.json({
        entries,
        total,
        digest: renderNotificationDigest(visible.slice(-200)),
        feedbackSummary: feedbackStore.dailySummary(userId),
      });
    } finally {
      store.close();
    }
  });

  // E323：人类裁决读 API（§2.3 记录侧）——待裁决队列只读展示，保持 append 顺序（最早在前）
  app.get('/api/decisions', (_req, res) => {
    const store = opts.decisionLog ?? new DecisionLog();
    try {
      res.json({ open: store.openDecisions() });
    } finally {
      store.close();
    }
  });

  // E323：人类批准/否决回填（§2.3 记录侧）——写端点挂网关鉴权；append 裁决事件，不改写原 pending 行
  // E324 第二刀：批准带 resume 载荷（confirm 真阻断挂起的写动作）的 pending 后，本端点直接恢复执行
  // （复用同一 pipeline + confirmResume 标记抑制二次拦截），响应带回执行回执 executed 供 UI 展示。
  app.post('/api/decisions/:id', requireGatewayAuth, async (req, res) => {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    const body = (req.body ?? {}) as {
      decision?: unknown;
      choice?: unknown;
      note?: unknown;
      mode?: unknown;
    };
    const decision = body.decision;
    const choice = typeof body.choice === 'string' && body.choice.trim() ? body.choice.trim() : undefined;
    if (!choice && decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'decision 必须为 approve/reject，或提供合法 choice' });
      return;
    }
    const mode = body.mode === undefined ? undefined : parseMemoryAccessMode(body.mode);
    if (body.mode !== undefined && !mode) {
      res.status(403).json({ error: '非法的记忆访问栏位' });
      return;
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;
    const store = opts.decisionLog ?? new DecisionLog();
    let result: AdjudicateResult;
    let projectTransaction: PendingProjectTransactionResolution | undefined;
    try {
      result = choice
        ? store.adjudicateChoice(id, choice, { note })
        : store.adjudicate(id, decision as 'approve' | 'reject', { note });
      if (
        result.ok &&
        result.entry.context?.kind === 'project_multifile_change_confirmation'
      ) {
        projectTransaction = pendingProjectTransactionStore.resolveInitialDecision(
          store,
          result.entry.id,
        );
      } else if (
        result.ok &&
        result.entry.context?.kind === 'project_transaction_conflict'
      ) {
        projectTransaction = pendingProjectTransactionStore.resolveConflictDecision(
          store,
          result.entry.id,
        );
      } else if (
        result.ok
        && decision === 'reject'
        && result.entry.context?.kind === 'mcp_domain_workflow_plan'
        && typeof result.entry.context.fingerprint === 'string'
      ) {
        try {
          (pipelineDeps.skillDeps?.workflowPlans ?? new WorkflowPlanStore())
            .markCancelled(result.entry.context.fingerprint);
        } catch {
          // 计划账本失败不阻塞否决回执
        }
      }
    } catch {
      try {
        store.close();
      } catch {
        // 记录库句柄关闭失败可忽略
      }
      res.status(500).json({ error: '裁决记录写入失败，请稍后重试' });
      return;
    }
    try {
      store.close();
    } catch {
      // 记录库句柄关闭失败可忽略，不影响裁决结果返回
    }
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'already_decided' ? 409 : 400;
      const error =
        result.reason === 'not_found'
          ? '未找到待裁决记录'
          : result.reason === 'already_decided'
            ? '该裁决已处理'
            : result.reason === 'choice_required'
              ? '该裁决必须提交明确 choice'
              : 'choice 不在待裁决选项中';
      res.status(status).json({ error });
      return;
    }
    const payload: {
      ok: true;
      entry: DecisionLogEntry;
      resume?: { query: string; executor: string; intent?: string };
      executed?: {
        answer?: string;
        confidence?: number;
        gate_triggered?: string;
        elapsed_ms?: number;
        mode?: string;
        submode?: string;
        error?: string;
      };
      projectTransaction?: PendingProjectTransactionResolution;
    } = { ok: true, entry: result.entry };
    if (projectTransaction) payload.projectTransaction = projectTransaction;
    if (result.resume) {
      payload.resume = result.resume;
      if (decision === 'approve') {
        try {
          const workflowFingerprint =
            result.entry.context?.kind === 'mcp_domain_workflow_plan'
            && typeof result.entry.context.fingerprint === 'string'
              ? result.entry.context.fingerprint
              : undefined;
          const run = await pipeline(result.resume.query, pipelineDeps, {
            userId: opts.defaultUserId ?? 'ui-user',
            conversationId: result.entry.conversationId,
            mode: mode ?? undefined,
            confirmResume: true,
            confirmResumeExecutor: result.resume.executor,
            confirmResumeIntent: result.resume.intent,
            confirmResumeWorkflowFingerprint: workflowFingerprint,
            watchdog: true,
            onProgress: (stage) => publishArtifactEvent('progress', { stage, at: Date.now() }),
            onArtifact: (event) => publishArtifactEvent('artifact', { ...event, at: Date.now() }),
          });
          payload.executed = {
            answer: run.answer,
            confidence: run.confidence,
            gate_triggered: run.gate_triggered,
            elapsed_ms: run.elapsed_ms,
            mode: run.mode,
            submode: run.submode,
          };
        } catch {
          payload.executed = { error: '批准已记录，但自动恢复执行失败，请稍后在对话中重试。' };
        }
      }
    }
    res.json(payload);
  });

  app.get('/api/memory', (req, res) => {
    const mode = parseMemoryAccessMode(req.query.mode);
    if (!mode) {
      res.status(403).json({ error: '缺少或非法的记忆访问栏位' });
      return;
    }
    const items: Array<{
      id: string;
      type: 'fact' | 'session' | 'experience';
      layer: 'L1' | 'L2';
      content: string;
      createdAt: number;
      lastAccessedAt: number;
      meta: string;
      stale?: boolean;
      expiresAt?: number | null;
    }> = [];
    const userId = opts.defaultUserId ?? 'default';
    if (canAccessMemoryAsset(mode, 'chat_memory') && opts.userContextStore) {
      for (const fact of opts.userContextStore.listFacts(userId, mode)) {
        items.push({
          id: `fact:${fact.id}`,
          type: 'fact',
          layer: fact.layer,
          content: fact.content,
          createdAt: fact.createdAt,
          lastAccessedAt: fact.lastAccessedAt,
          meta: `${fact.source} · ${fact.kind} · ${fact.scope}`,
          stale: fact.stale,
          expiresAt: fact.expiresAt,
        });
      }
      for (const session of opts.userContextStore.listSessions(userId)) {
        items.push({
          id: `session:${session.sessionId}`,
          type: 'session',
          layer: 'L1',
          content: session.summary,
          createdAt: session.createdAt,
          lastAccessedAt: session.createdAt,
          meta: session.topics.join('/'),
        });
      }
    }
    if (canAccessMemoryAsset(mode, 'skill') && opts.experienceManager) {
      for (const entry of opts.experienceManager.list()) {
        items.push({
          id: `experience:${entry.id}`,
          type: 'experience',
          layer: 'L1',
          content: entry.content,
          createdAt: entry.createdAt,
          lastAccessedAt: entry.lastUsedAt ?? entry.createdAt,
          meta: entry.skillName,
        });
      }
    }
    res.json({ mode, assets: memoryAssetsForMode(mode), total: items.length, items });
  });

  app.get('/api/feedback', requireGatewayAuth, (_req, res) => {
    const entries = feedbackStore.all();
    res.json({ entries, latest: feedbackStore.latest(), stats: feedbackStore.stats() });
  });

  app.get('/api/skill-candidates', requireGatewayAuth, (req, res) => {
    const userId =
      typeof req.query.userId === 'string' && req.query.userId.trim()
        ? req.query.userId.trim()
        : (opts.defaultUserId ?? 'default');
    const rulesByCandidate = new Map(
      answerPostprocessRuleStore
        .latest()
        .filter((entry) => entry.userId === userId)
        .map((entry) => [entry.candidateId, entry]),
    );
    const latestFeedback = feedbackStore.latest().filter((entry) => entry.userId === userId);
    const candidates = skillCandidateStore
      .latest()
      .filter((entry) => entry.userId === userId)
      .map((entry) => {
        const rule = rulesByCandidate.get(entry.id);
        const latestNegativeFeedback = rule?.needsReview
          ? latestFeedback
              .filter(
                (item) =>
                  item.feedback === 'reject' &&
                  item.postprocessSkillNames?.includes(rule.name),
              )
              .reduce<(ReturnType<FeedbackStore['latest']>[number]) | null>(
                (latest, item) =>
                  !latest || item.createdAt >= latest.createdAt ? item : latest,
                null,
              )
          : null;
        return {
          ...entry,
          ruleEnabled: rule?.status === 'enabled',
          ruleLifecycle: rule
            ? {
                usageCount: rule.usageCount,
                thumbsDownCount: rule.thumbsDownCount,
                consecutiveDown: rule.consecutiveDown,
                needsReview: rule.needsReview,
              }
            : null,
          latestNegativeFeedback: latestNegativeFeedback
            ? {
                reason: latestNegativeFeedback.reason,
                note: latestNegativeFeedback.note,
                query: latestNegativeFeedback.query,
                answer: latestNegativeFeedback.answer,
                createdAt: latestNegativeFeedback.createdAt,
              }
            : null,
        };
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);
    res.json({ candidates });
  });

  app.get('/api/skill-candidates/:id/draft', requireGatewayAuth, (req, res) => {
    const userId =
      typeof req.query.userId === 'string' && req.query.userId.trim()
        ? req.query.userId.trim()
        : (opts.defaultUserId ?? 'default');
    const current = skillCandidateStore
      .latest()
      .find((entry) => entry.id === req.params.id && entry.userId === userId);
    if (!current) {
      res.status(404).json({ error: '候选不存在' });
      return;
    }
    if (current.status !== 'accepted') {
      res.status(409).json({ error: '仅已保留候选可生成草案' });
      return;
    }
    res.json({ draft: buildSkillCandidateDraft(current) });
  });

  app.post('/api/skill-candidates/:id', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId =
      typeof body.userId === 'string' && body.userId.trim()
        ? body.userId.trim()
        : (opts.defaultUserId ?? 'default');
    const current = skillCandidateStore
      .latest()
      .find((entry) => entry.id === req.params.id && entry.userId === userId);
    if (!current || (body.decision !== 'accept' && body.decision !== 'reject')) {
      res.status(current ? 400 : 404).json({ error: current ? '候选决定非法' : '候选不存在' });
      return;
    }
    const candidate = skillCandidateStore.decide(
      current.id,
      body.decision === 'accept' ? 'accepted' : 'rejected',
    );
    res.json({ ok: true, candidate });
  });

  app.post('/api/skill-candidates/:id/rule', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId =
      typeof body.userId === 'string' && body.userId.trim()
        ? body.userId.trim()
        : (opts.defaultUserId ?? 'default');
    const candidate = skillCandidateStore
      .latest()
      .find((entry) => entry.id === req.params.id && entry.userId === userId);
    if (!candidate) {
      res.status(404).json({ error: '候选不存在' });
      return;
    }
    if (body.action === 'enable') {
      const rule = answerPostprocessRuleStore.enable(candidate);
      if (!rule) {
        res.status(409).json({ error: '该候选尚未接受或不支持确定性执行' });
        return;
      }
      res.json({ ok: true, rule });
      return;
    }
    if (body.action === 'disable') {
      const current = answerPostprocessRuleStore.latest().find(
        (entry) => entry.candidateId === candidate.id && entry.userId === userId,
      );
      const rule = current
        ? answerPostprocessRuleStore.disable(current.id, userId)
        : null;
      if (!rule) {
        res.status(404).json({ error: '规则不存在' });
        return;
      }
      res.json({ ok: true, rule });
      return;
    }
    if (body.action === 'restore_review') {
      const current = answerPostprocessRuleStore.latest().find(
        (entry) => entry.candidateId === candidate.id && entry.userId === userId,
      );
      const rule = current
        ? answerPostprocessRuleStore.clearReview(current.id, userId)
        : null;
      if (!rule) {
        res.status(404).json({ error: '规则不存在' });
        return;
      }
      res.json({ ok: true, rule });
      return;
    }
    res.status(400).json({ error: '规则操作非法' });
  });

  app.post('/api/feedback', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const feedback = body.feedback;
    const mode = parseMemoryAccessMode(body.mode);
    const reason = body.reason === undefined || body.reason === '' ? undefined : body.reason;
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;
    const correctedAnswer =
      typeof body.correctedAnswer === 'string' && body.correctedAnswer.trim()
        ? body.correctedAnswer.trim()
        : undefined;
    const skillName =
      typeof body.skillName === 'string' && body.skillName.trim()
        ? body.skillName.trim()
        : undefined;
    const postprocessSkillNames = Array.isArray(body.postprocessSkillNames)
      ? [...new Set(body.postprocessSkillNames.map((name) =>
          typeof name === 'string' ? name.trim() : '',
        ))].filter(Boolean)
      : undefined;
    if (
      (feedback !== 'accept' && feedback !== 'reject' && feedback !== 'correct') ||
      !mode ||
      typeof body.messageId !== 'string' ||
      !body.messageId.trim() ||
      typeof body.query !== 'string' ||
      typeof body.answer !== 'string' ||
      (body.skillName !== undefined && !skillName) ||
      (body.postprocessSkillNames !== undefined &&
        (!Array.isArray(body.postprocessSkillNames) ||
          postprocessSkillNames?.length !== body.postprocessSkillNames.length)) ||
      (reason !== undefined && !isAnswerFeedbackReason(reason)) ||
      (body.note !== undefined && typeof body.note !== 'string') ||
      (feedback === 'accept' && (reason !== undefined || note !== undefined || correctedAnswer !== undefined)) ||
      (feedback === 'reject' && correctedAnswer !== undefined) ||
      (feedback === 'correct' &&
        (!correctedAnswer || correctedAnswer === body.answer || reason !== undefined || note !== undefined))
    ) {
      res.status(400).json({ error: '反馈字段不完整或非法' });
      return;
    }
    const entry = feedbackStore.record({
      userId:
        typeof body.userId === 'string' && body.userId.trim()
          ? body.userId.trim()
          : (opts.defaultUserId ?? 'default'),
      conversationId:
        typeof body.conversationId === 'string' ? body.conversationId : '',
      messageId: body.messageId.trim(),
      mode,
      query: body.query,
      answer: body.answer,
      ...(skillName !== undefined ? { skillName } : {}),
      ...(postprocessSkillNames?.length ? { postprocessSkillNames } : {}),
      feedback,
      ...(reason !== undefined ? { reason } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(correctedAnswer !== undefined ? { correctedAnswer } : {}),
    });
    let memorySaved = false;
    if (feedback === 'correct' && correctedAnswer && opts.userContextStore) {
      try {
        opts.userContextStore.addFact(
          entry.userId,
          buildCorrectionPreferenceFact(correctedAnswer),
          'corrected',
          entry.createdAt,
          undefined,
          mode,
        );
        memorySaved = true;
      } catch {
        // 反馈审计已落盘；记忆写入失败通过返回字段披露。
      }
    }
    let skillCandidate = null;
    if (feedback === 'correct' && correctedAnswer) {
      const pattern = detectCorrectionPattern(body.answer, correctedAnswer);
      if (pattern) {
        const matchingCorrections = feedbackStore.latest().filter((item) => {
          if (item.userId !== entry.userId || item.feedback !== 'correct' || !item.correctedAnswer) {
            return false;
          }
          return detectCorrectionPattern(item.answer, item.correctedAnswer)?.key === pattern.key;
        });
        if (matchingCorrections.length >= PARAMS.feedbackCandidateThreshold) {
          skillCandidate = skillCandidateStore.propose({
            userId: entry.userId,
            pattern: pattern.key,
            title: pattern.title,
            description: pattern.description,
            sampleCount: matchingCorrections.length,
            latestSample: correctedAnswer,
          }, entry.createdAt);
        }
      }
    }
    let skillReview: { needsReview: boolean; consecutiveDown: number } | null = null;
    if (skillName && opts.deps?.skillLifecycle?.syncReviewSignals) {
      const skillEntries = feedbackStore.latest().filter((item) => item.skillName === skillName);
      const thumbsDownCount = skillEntries.filter((item) => item.feedback === 'reject').length;
      let consecutiveDown = 0;
      for (let index = skillEntries.length - 1; index >= 0; index -= 1) {
        if (skillEntries[index].feedback !== 'reject') break;
        consecutiveDown += 1;
      }
      skillReview = opts.deps.skillLifecycle.syncReviewSignals(
        skillName,
        thumbsDownCount,
        consecutiveDown,
        entry.createdAt,
      );
    }
    const postprocessRuleReviews = (postprocessSkillNames ?? []).flatMap((name) => {
      const ruleEntries = feedbackStore.latest().filter(
        (item) => item.userId === entry.userId && item.postprocessSkillNames?.includes(name),
      );
      const thumbsDownCount = ruleEntries.filter((item) => item.feedback === 'reject').length;
      let consecutiveDown = 0;
      for (let index = ruleEntries.length - 1; index >= 0; index -= 1) {
        if (ruleEntries[index].feedback !== 'reject') break;
        consecutiveDown += 1;
      }
      const rule = answerPostprocessRuleStore.syncReviewSignals(
        name,
        entry.userId,
        thumbsDownCount,
        consecutiveDown,
        entry.createdAt,
      );
      return rule ? [{ name, lifecycle: rule }] : [];
    });
    res.json({
      ok: true,
      entry,
      memorySaved,
      skillReview,
      postprocessRuleReviews,
      skillCandidate,
      stats: feedbackStore.stats(),
    });
  });

  app.post('/api/memory/forget', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { id?: unknown; type?: unknown; mode?: unknown };
    const mode = parseMemoryAccessMode(body.mode);
    const asset = memoryItemAsset(body.type);
    if (!mode || !asset || !canAccessMemoryAsset(mode, asset)) {
      res.status(403).json({ ok: false, error: '当前栏位无权管理该记忆资产' });
      return;
    }
    const id = typeof body.id === 'string' ? body.id : '';
    const type = body.type;
    if (type === 'fact' && opts.userContextStore) {
      const factId = Number(id.replace(/^fact:/, ''));
      const ok = Number.isFinite(factId) && opts.userContextStore.deleteFact(
        opts.defaultUserId ?? 'default',
        factId,
      );
      res.json({ ok, error: ok ? undefined : '未找到记忆' });
      return;
    }
    if (type === 'experience' && opts.experienceManager) {
      const ok = opts.experienceManager.remove(id.replace(/^experience:/, ''));
      res.json({ ok, error: ok ? undefined : '未找到记忆' });
      return;
    }
    res.json({ ok: false, error: '不支持的记忆类型' });
  });

  app.get('/api/security', (_req, res) => {
    res.json(readSecurityConfig(opts.securityConfigPath));
  });

  app.post('/api/security/persist', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as Partial<Record<string, unknown>>;
    const current = readSecurityConfig(opts.securityConfigPath);
    const next = {
      shellEnabled: typeof body.shellEnabled === 'boolean' ? body.shellEnabled : current.shellEnabled,
      fileAccess: body.fileAccess === 'all' ? ('all' as const) : current.fileAccess,
      externalApiEnabled:
        typeof body.externalApiEnabled === 'boolean'
          ? body.externalApiEnabled
          : current.externalApiEnabled,
      illegalEnabled:
        typeof body.illegalEnabled === 'boolean' ? body.illegalEnabled : current.illegalEnabled,
      personalEmergencyEnabled:
        typeof body.personalEmergencyEnabled === 'boolean'
          ? body.personalEmergencyEnabled
          : current.personalEmergencyEnabled,
      propertyEmergencyEnabled:
        typeof body.propertyEmergencyEnabled === 'boolean'
          ? body.propertyEmergencyEnabled
          : current.propertyEmergencyEnabled,
      allowedCommandPrefixes: Array.isArray(body.allowedCommandPrefixes)
        ? body.allowedCommandPrefixes.filter((item): item is string => typeof item === 'string')
        : current.allowedCommandPrefixes,
    };
    writeSecurityConfig(next, opts.securityConfigPath);
    res.json({ ok: true, security: next });
  });

  app.get('/api/mail/credentials', requireGatewayAuth, (_req, res) => {
    const creds = loadCredentials(opts.mailCredentialsPath);
    if (!creds) {
      res.json({ configured: false });
      return;
    }
    res.json({
      configured: true,
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      user: creds.user,
      from: creds.from,
    });
  });

  app.post('/api/mail/credentials', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const missing = validateCredentials(body);
    if (missing.length > 0) {
      res.status(400).json({ error: `SMTP 凭据缺少字段：${missing.join(', ')}` });
      return;
    }
    try {
      saveCredentials(
        {
          host: String(body.host).trim(),
          port: Number(body.port),
          secure: Boolean(body.secure),
          user: String(body.user).trim(),
          pass: String(body.pass),
          from: String(body.from).trim(),
        },
        opts.mailCredentialsPath,
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: '保存 SMTP 凭据失败' });
    }
  });

  app.get('/api/calendar/export', (_req, res) => {
    let database: ReturnType<typeof openCalendarDb> | null = null;
    try {
      database = openCalendarDb(opts.calendarDbPath);
      const { ics, count } = buildCalendarIcs(database);
      if (count === 0) {
        res.status(404).json({ error: '暂无日程可导出' });
        return;
      }
      res
        .type('text/calendar')
        .setHeader('Content-Disposition', 'attachment; filename="ai-butler-calendar.ics"')
        .send(`${ics}\r\n`);
    } catch {
      res.status(500).json({ error: '日历导出失败' });
    } finally {
      database?.close();
    }
  });

  app.post('/api/calendar/import', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { ics?: unknown };
    const text = typeof body.ics === 'string' ? body.ics.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'ics 内容不能为空' });
      return;
    }
    let database: ReturnType<typeof openCalendarDb> | null = null;
    try {
      database = openCalendarDb(opts.calendarDbPath);
      const { imported, skipped, total } = importIcsToDb(database, text);
      if (total === 0) {
        res.status(400).json({ error: '未解析到可导入的日程' });
        return;
      }
      res.json({ ok: true, imported, skipped });
    } catch {
      res.status(500).json({ error: '日历导入失败' });
    } finally {
      database?.close();
    }
  });

  app.post('/api/terminal/exec', requireGatewayAuth, async (req, res) => {
    const body = (req.body ?? {}) as { command?: unknown };
    const command = typeof body.command === 'string' ? body.command.trim() : '';
    if (!command) {
      res.status(400).json({ error: 'command 不能为空' });
      return;
    }
    const security = readSecurityConfig(opts.securityConfigPath);
    if (!security.shellEnabled) {
      res.status(403).json({ error: 'Shell 权限未开启，请先到安全中心开启' });
      return;
    }
    // H3：§10.2 硬编码拒绝表先行（rm -rf <根>、del /S、sudo、powershell -enc 等）
    const policy = classifyCommand(command);
    if (policy.hardDenied) {
      res.status(403).json({ error: `命令被安全策略拒绝：${policy.hardDenied}` });
      return;
    }
    const allowlist = (security.allowedCommandPrefixes ?? [])
      .map((prefix) => prefix.trim().toLowerCase())
      .filter(Boolean);
    // H3：白名单 default-deny——空列表 = 拒绝所有命令（§10.2 "仅允许白名单内命令"）
    if (allowlist.length === 0) {
      res.status(403).json({
        error: 'Shell 命令白名单为空，默认拒绝所有命令。请先在安全中心配置 allowedCommandPrefixes。',
      });
      return;
    }
    if (!allowlist.some((prefix) => command.toLowerCase().startsWith(prefix))) {
      res.status(403).json({
        error: `命令不在白名单：允许前缀 ${allowlist.join(' / ')}`,
      });
      return;
    }
    // H3：解释器通道（node -e、python -c、powershell -Command 等）需白名单显式写全通道
    const channel = policy.interpreterChannel;
    if (channel && !allowlist.some((prefix) => prefix.startsWith(channel))) {
      res.status(403).json({
        error: `解释器通道（${channel}）需在白名单中显式配置，例如 "${channel}"。`,
      });
      return;
    }
    const result = await runCommand(command, { timeoutMs: 15000, cwd: process.cwd() });
    res.json({ command, ...result });
  });

  app.post('/api/usage/budget', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as {
      budgetYuan?: unknown;
      degradeAtPercent?: unknown;
    };
    const current = readUsageBudget();
    const next: typeof current = {
      ...current,
      budgetYuan:
        typeof body.budgetYuan === 'number' && body.budgetYuan >= 0
          ? body.budgetYuan
          : current.budgetYuan,
      degradeAtPercent:
        typeof body.degradeAtPercent === 'number' &&
        body.degradeAtPercent > 0 &&
        body.degradeAtPercent <= 100
          ? body.degradeAtPercent
          : current.degradeAtPercent,
    };
    writeUsageBudget(next);
    res.json({ ok: true, budget: next });
  });

  app.get('/api/routing/cases', (_req, res) => {
    const records = routeCaseStore.list();
    res.json({
      total: records.length,
      audit: auditRouteCases(records),
      records,
    });
  });

  app.post('/api/routing/batch-mark', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as {
      updates?: Array<{
        id?: unknown;
        feedback?: unknown;
        correctedRoute?: unknown;
      }>;
    };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const failed: string[] = [];
    const valid: Array<{
      id: string;
      feedback: RouteFeedback;
      correctedRoute?: { primaryLens?: string; intent?: string };
    }> = [];
    for (const update of updates) {
      if (typeof update?.id !== 'string') continue;
      const feedback = update.feedback;
      if (feedback !== 'accept' && feedback !== 'reject' && feedback !== 'correct') {
        failed.push(update.id);
        continue;
      }
      const corrected =
        typeof update.correctedRoute === 'object' && update.correctedRoute !== null
          ? {
              primaryLens:
                typeof (update.correctedRoute as { primaryLens?: unknown }).primaryLens === 'string'
                  ? ((update.correctedRoute as { primaryLens?: string }).primaryLens as string)
                  : undefined,
              intent:
                typeof (update.correctedRoute as { intent?: unknown }).intent === 'string'
                  ? ((update.correctedRoute as { intent?: string }).intent as string)
                  : undefined,
            }
          : undefined;
      valid.push({
        id: update.id,
        feedback: feedback as RouteFeedback,
        ...(corrected ? { correctedRoute: corrected } : {}),
      });
    }
    // P13：单趟读 + 单趟写批量回写，不再 O(m×n) 循环全文重写
    const result = routeCaseStore.batchMarkFeedback(valid);
    res.json({ updated: result.updated, failed: [...failed, ...result.failed] });
  });

  app.post('/api/routing/export', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { format?: unknown };
    const format = body.format === 'json' ? 'json' : 'csv';
    const records = routeCaseStore.list();
    if (format === 'json') {
      res
        .type('application/json')
        .setHeader('Content-Disposition', 'attachment; filename="route-cases.json"')
        .send(JSON.stringify(records, null, 2));
      return;
    }
    const header = 'id,timestamp,query,decision,primaryLens,intent,confidence';
    const rows = records.map((r: RouteCaseRecord) =>
      [
        r.id,
        r.timestamp,
        csvCell(r.query),
        r.result.decision.type,
        r.result.decision.type === 'direct' || r.result.decision.type === 'confirm'
          ? r.result.decision.selected.primaryLens
          : '',
        r.result.decision.type === 'direct' || r.result.decision.type === 'confirm'
          ? r.result.decision.selected.intent
          : '',
        r.result.confidence,
      ].join(','),
    );
    res
      .type('text/csv')
      .setHeader('Content-Disposition', 'attachment; filename="route-cases.csv"')
      .send([header, ...rows].join('\n'));
  });

  app.post('/api/ask', requireGatewayAuth, rateLimitAsk, concurrencyLimitAsk, async (req, res) => {
    const body = (req.body ?? {}) as AskBody;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      res.status(400).json({ error: 'query 不能为空' });
      return;
    }
    const mode = body.mode === undefined ? undefined : parseMemoryAccessMode(body.mode);
    if (body.mode !== undefined && !mode) {
      res.status(403).json({ error: '非法的记忆访问栏位' });
      return;
    }
    const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
    const modelSelection = parseModelId(modelId) ?? undefined;
    const userId =
      typeof body.userId === 'string' ? body.userId : (opts.defaultUserId ?? 'ui-user');
    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId : undefined;
    // 斜杠命令层（E204）：/context 与 /compact 不进入问答管线
    const slashResult = await handleSlashCommand(query, conversationId, {
      sessionContext,
      llm: opts.deps?.llm,
    });
    if (slashResult) {
      publishArtifactEvent('progress', { stage: 'slash', at: Date.now() });
      res.json(slashResult);
      return;
    }
    const files: RawFileLike[] = [];
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    for (const item of rawAttachments) {
      if (typeof item !== 'object' || item === null) {
        res.status(400).json({ error: '附件格式不正确' });
        return;
      }
      const payload = item as Partial<AttachmentPayload>;
      if (typeof payload.dataUrl !== 'string' || typeof payload.name !== 'string') {
        res.status(400).json({ error: '附件格式不正确' });
        return;
      }
      try {
        files.push(
          dataUrlToRawFile({
            name: payload.name,
            type: typeof payload.type === 'string' ? payload.type : '',
            dataUrl: payload.dataUrl,
          }),
        );
      } catch {
        res.status(400).json({ error: '附件格式不正确' });
        return;
      }
    }
    try {
      const result = await pipeline(query, pipelineDeps, {
        userId,
        conversationId,
        mode: mode ?? undefined,
        modelSelection,
        files,
        watchdog: true,
        onProgress: (stage) =>
          publishArtifactEvent('progress', { stage, at: Date.now() }),
        onArtifact: (event) =>
          publishArtifactEvent('artifact', { ...event, at: Date.now() }),
      });
      publishArtifactEvent('files_changed', { at: Date.now() });
      res.json(result);
    } catch {
      res.status(500).json({
        error: '抱歉，系统在处理您的请求时遇到了一点小问题，请稍后再试。',
      });
    }
  });

  const distPath =
    opts.uiDistPath ??
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'prototype', 'dist');
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    app.use(express.static(distPath, { index: 'index.html' }));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        return res.sendFile(indexPath);
      }
      next();
    });
  }

  return app;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
