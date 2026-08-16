/**
 * 单一共享 TurnLoop 网关（E106）
 * CLI / UI / 未来聊天频道都通过同一 pipeline；错误不向客户端泄露原始细节。
 */

import express from 'express';

import { buildModelCatalog } from '../config/model-catalog.js';
import { parseModelId } from '../search/model-id.js';
import { pipeline, type PipelineDeps } from '../search/pipeline.js';
import type { RawFileLike } from '../skills/deps.js';
import { dataUrlToRawFile, type AttachmentPayload } from './attachments.js';

export interface GatewayOptions {
  deps?: PipelineDeps;
  defaultUserId?: string;
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
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'one-person-agent-gateway', contract: 'answer(query)' });
  });

  app.get('/api/model-providers', (_req, res) => {
    res.json(buildModelCatalog());
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
