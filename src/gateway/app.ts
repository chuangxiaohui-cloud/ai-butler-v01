/**
 * 单一共享 TurnLoop 网关（E106）
 * CLI / UI / 未来聊天频道都通过同一 pipeline；错误不向客户端泄露原始细节。
 */

import express from 'express';

import { auditRouteCases } from '../agent/route-case-audit.js';
import { RouteCaseStore, type RouteCaseRecord, type RouteFeedback } from '../agent/route-case-store.js';
import { buildModelCatalog } from '../config/model-catalog.js';
import { defaultRegistry } from '../search/llm-registry.js';
import { OpenAiCompatibleClient } from '../search/llm-client.js';
import { parseModelId } from '../search/model-id.js';
import { pipeline, type PipelineDeps } from '../search/pipeline.js';
import { listSkillMetadata } from '../skills/registry.js';
import { writeDisabledSkills } from '../config/skills-config.js';
import { readUsageBudget, writeUsageBudget } from '../config/usage-budget.js';
import { readSecurityConfig, writeSecurityConfig } from '../config/security-config.js';
import { ExperienceManager } from '../memory/experience.js';
import { UserContextStore } from '../memory/user-context-store.js';
import { aggregateUsage, readUsage } from '../usage/usage-store.js';
import { listProjectFiles } from './files.js';
import { runCommand } from './terminal.js';
import type { RawFileLike } from '../skills/deps.js';
import { dataUrlToRawFile, type AttachmentPayload } from './attachments.js';

export interface GatewayOptions {
  deps?: PipelineDeps;
  defaultUserId?: string;
  routeCaseStore?: RouteCaseStore;
  userContextStore?: UserContextStore;
  experienceManager?: ExperienceManager;
  securityConfigPath?: string;
}

interface AskBody {
  query?: unknown;
  userId?: unknown;
  modelId?: unknown;
  tab?: unknown;
  mode?: unknown;
  attachments?: unknown;
}

export function createGatewayApp(opts: GatewayOptions = {}): express.Express {
  const app = express();
  const routeCaseStore = opts.routeCaseStore ?? new RouteCaseStore();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'one-person-agent-gateway', contract: 'answer(query)' });
  });

  app.get('/api/model-providers', (_req, res) => {
    res.json(buildModelCatalog());
  });

  app.get('/api/files', (_req, res) => {
    const files = listProjectFiles(process.cwd());
    res.json({ total: files.length, files });
  });

  app.get('/api/providers', (_req, res) => {
    const registry = defaultRegistry();
    res.json({
      order: registry.order(),
      providers: registry.listStatuses(),
    });
  });

  app.post('/api/providers/default', (req, res) => {
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

  app.post('/api/providers/test', async (req, res) => {
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

  app.post('/api/skills/sync', (req, res) => {
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

  app.post('/api/memory/forget', (req, res) => {
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

  app.post('/api/security/persist', (req, res) => {
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
    };
    writeSecurityConfig(next, opts.securityConfigPath);
    res.json({ ok: true, security: next });
  });

  app.post('/api/terminal/exec', async (req, res) => {
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
    const result = await runCommand(command, { timeoutMs: 15000, cwd: process.cwd() });
    res.json({ command, ...result });
  });

  app.post('/api/usage/budget', (req, res) => {
    const body = (req.body ?? {}) as {
      budgetYuan?: unknown;
      degradeAtPercent?: unknown;
    };
    const current = readUsageBudget();
    const next: typeof current = {
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

  app.post('/api/routing/batch-mark', (req, res) => {
    const body = (req.body ?? {}) as {
      updates?: Array<{
        id?: unknown;
        feedback?: unknown;
        correctedRoute?: unknown;
      }>;
    };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const updated: string[] = [];
    const failed: string[] = [];
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
      if (routeCaseStore.recordFeedback(update.id, feedback as RouteFeedback, corrected)) {
        updated.push(update.id);
      } else {
        failed.push(update.id);
      }
    }
    res.json({ updated, failed });
  });

  app.post('/api/routing/export', (req, res) => {
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

  app.post('/api/ask', async (req, res) => {
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
        modelSelection,
        files,
      });
      res.json(result);
    } catch {
      res.status(500).json({
        error: '抱歉，系统在处理您的请求时遇到了一点小问题，请稍后再试。',
      });
    }
  });

  return app;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
