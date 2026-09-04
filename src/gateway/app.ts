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
import { writeDisabledSkills } from '../config/skills-config.js';
import { readUsageBudget, writeUsageBudget } from '../config/usage-budget.js';
import { readSecurityConfig, writeSecurityConfig } from '../config/security-config.js';
import { DecisionLog, type AdjudicateResult, type DecisionLogEntry } from '../escalation/decision-log.js';
import { ExperienceManager } from '../memory/experience.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { SessionContextStore } from '../memory/session-context.js';
import { handleSlashCommand } from '../slash/slash-commands.js';
import { aggregateUsage, readUsage } from '../usage/usage-store.js';
import { NotificationStore } from '../notifications/notification-store.js';
import { classifyEventPriority, renderNotificationDigest } from '../skills/market/notification-hub.js';
import { listProjectFiles } from './files.js';
import { ConcurrencyGate, RateLimiter } from './rate-limit.js';
import { classifyCommand, runCommand } from './terminal.js';
import { publishArtifactEvent, subscribeArtifactEvents } from './artifact-bus.js';
import type { RawFileLike } from '../skills/deps.js';
import { dataUrlToRawFile, type AttachmentPayload } from './attachments.js';
import { loadCredentials, saveCredentials, validateCredentials } from '../mail/credentials.js';
import { buildCalendarIcs, importIcsToDb, openCalendarDb } from '../skills/calendar-skill/index.js';

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
    const skills = listSkillMetadata();
    res.json({
      total: skills.length,
      enabled: skills.filter((s) => s.enabled).length,
      skills,
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

  app.get('/api/usage/stats', (_req, res) => {
    res.json({
      stats: aggregateUsage(readUsage()),
      budget: readUsageBudget(),
    });
  });

  // E320：通知区只读 API（§11.3 秘书日报 / §4.1 右栏通知区；优先级复用 hub 纯函数单一判定口径）
  // E331：支持 page/pageSize 分页并回 total；摘要口径固定最近 200 条，与当前分页解耦。
  app.get('/api/notifications', (req, res) => {
    const pageRaw = Number(req.query.page ?? 1);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const sizeRaw = Number(req.query.pageSize ?? 20);
    const pageSize = Number.isFinite(sizeRaw) ? Math.min(Math.max(1, Math.floor(sizeRaw)), 200) : 20;
    const store = opts.notificationStore ?? new NotificationStore();
    try {
      const all = store.all();
      const total = all.length;
      const newestFirst = [...all]
        .reverse()
        .map((entry) => ({ ...entry, priority: classifyEventPriority(entry) }));
      const start = (page - 1) * pageSize;
      const entries = newestFirst.slice(start, start + pageSize);
      res.json({ entries, total, digest: renderNotificationDigest(all.slice(-200)) });
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
    const body = (req.body ?? {}) as { decision?: unknown; note?: unknown };
    const decision = body.decision;
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'decision 必须为 approve 或 reject' });
      return;
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;
    const store = opts.decisionLog ?? new DecisionLog();
    let result: AdjudicateResult;
    try {
      result = store.adjudicate(id, decision, { note });
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
      res.status(result.reason === 'not_found' ? 404 : 409).json({
        error: result.reason === 'not_found' ? '未找到待裁决记录' : '该裁决已处理',
      });
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
    } = { ok: true, entry: result.entry };
    if (result.resume) {
      payload.resume = result.resume;
      if (decision === 'approve') {
        try {
          const run = await pipeline(result.resume.query, opts.deps ?? {}, {
            userId: opts.defaultUserId ?? 'ui-user',
            conversationId: result.entry.conversationId,
            confirmResume: true,
            confirmResumeExecutor: result.resume.executor,
            confirmResumeIntent: result.resume.intent,
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

  app.get('/api/memory', (_req, res) => {
    const items: Array<{
      id: string;
      type: 'fact' | 'session' | 'experience';
      layer: 'L1' | 'L2';
      content: string;
      createdAt: number;
      lastAccessedAt: number;
      meta: string;
    }> = [];
    const userId = opts.defaultUserId ?? 'default';
    if (opts.userContextStore) {
      for (const fact of opts.userContextStore.listFacts(userId)) {
        items.push({
          id: `fact:${fact.id}`,
          type: 'fact',
          layer: 'L2',
          content: fact.content,
          createdAt: fact.createdAt,
          lastAccessedAt: fact.lastAccessedAt,
          meta: fact.source,
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
    if (opts.experienceManager) {
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
    res.json({ total: items.length, items });
  });

  app.post('/api/memory/forget', requireGatewayAuth, (req, res) => {
    const body = (req.body ?? {}) as { id?: unknown; type?: unknown };
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
      const result = await pipeline(query, opts.deps ?? {}, {
        userId,
        conversationId,
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
