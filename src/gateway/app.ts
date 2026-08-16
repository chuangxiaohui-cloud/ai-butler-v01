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
import type { RawFileLike } from '../skills/deps.js';
import { dataUrlToRawFile, type AttachmentPayload } from './attachments.js';

export interface GatewayOptions {
  deps?: PipelineDeps;
  defaultUserId?: string;
  routeCaseStore?: RouteCaseStore;
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
