/**
 * OneBot 11 HTTP 适配器（E241，S5 真实平台适配器——QQ）
 * 事件接收：本地 HTTP 端点接收 OneBot 实现（NapCat 等）POST 上报的 message 事件，
 *   剥 CQ 码后映射为 ImInboundMessage（私聊/群聊 → sessionKey 隔离）。
 * 消息发送：调 OneBot HTTP API（send_private_msg / send_group_msg），Bearer 鉴权。
 * 安全（§10）：监听默认仅 127.0.0.1；accessToken 必填（构造期校验）；上报鉴权失败 401；
 *   非 message 事件 / 空文本不回执处理；CQ 码不执行。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { ImChannel } from '../channel.js';
import type { ImInboundMessage, ImPlatform, ImReply } from '../types.js';
import { extractOneBotText } from './cq.js';
import type { OneBotApiResponse, OneBotChannelConfig, OneBotEvent } from './types.js';

type Fetcher = typeof fetch;

export interface OneBotChannelDeps {
  fetcher?: Fetcher;
}

export const DEFAULT_ONEBOT_LISTEN_PATH = '/onebot/qq';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return Buffer.compare(ba, bb) === 0;
}

/** 上报事件 → ImInboundMessage；非 message 事件或空文本返回 null */
export function parseOneBotEvent(event: OneBotEvent): ImInboundMessage | null {
  if (!event || event.post_type !== 'message') return null;
  const messageType = event.message_type;
  const userId = event.user_id;
  if (messageType !== 'private' && messageType !== 'group') return null;
  const text = extractOneBotText(event.message);
  if (!text) return null;
  const sessionKey = messageType === 'private' ? `private:${userId}` : `group:${event.group_id}`;
  return {
    id: `onebot-${event.message_id ?? event.time ?? Date.now()}`,
    platform: 'qq',
    sessionKey,
    isGroup: messageType === 'group',
    text,
    ts: (event.time ?? Date.now()) * 1000,
  };
}

export class OneBotChannel implements ImChannel {
  readonly id: string;
  readonly platform: ImPlatform = 'qq';
  private readonly cfg: OneBotChannelConfig;
  private readonly fetcher: Fetcher;
  private server: Server | null = null;
  private handler: ((message: ImInboundMessage) => Promise<ImReply | null>) | null = null;

  constructor(cfg: OneBotChannelConfig, deps: OneBotChannelDeps = {}) {
    if (!cfg.httpApiBase || !Number.isFinite(cfg.listenPort) || cfg.listenPort <= 0) {
      throw new Error('OneBotChannel: httpApiBase 与 listenPort 必填');
    }
    if (!cfg.accessToken) {
      throw new Error('OneBotChannel: accessToken 必填（§10 防未授权设备调用）');
    }
    this.cfg = { listenHost: '127.0.0.1', listenPath: DEFAULT_ONEBOT_LISTEN_PATH, ...cfg };
    this.fetcher = deps.fetcher ?? fetch;
    this.id = `qq-onebot:${this.cfg.listenHost}:${this.cfg.listenPort}`;
  }

  onMessage(handler: (message: ImInboundMessage) => Promise<ImReply | null>): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.cfg.listenPort, this.cfg.listenHost, () => {
        this.server!.removeListener('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // 有 keep-alive 连接时 close 可能挂起，兜底强制销毁
      setTimeout(() => resolve(), 1_000).unref();
    });
  }

  async send(reply: ImReply, message: ImInboundMessage): Promise<{ ok: boolean; error?: string }> {
    const target = this.targetFor(message);
    if (!target) return { ok: false, error: `无法解析会话目标：${message.sessionKey}` };
    const body =
      target.endpoint === 'send_private_msg'
        ? { user_id: target.id, message: reply.text }
        : { group_id: target.id, message: reply.text };
    try {
      const resp = await this.fetcher(`${this.cfg.httpApiBase}/${target.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => null)) as OneBotApiResponse | null;
      if (!resp.ok || data?.status !== 'ok') {
        return { ok: false, error: `OneBot API ${target.endpoint} 失败：${data?.wording ?? resp.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `OneBot API 调用异常：${(err as Error).message}` };
    }
  }

  /** sessionKey（private:<uid> / group:<gid>）→ OneBot 发送目标 */
  private targetFor(
    message: ImInboundMessage,
  ): { endpoint: 'send_private_msg'; id: number } | { endpoint: 'send_group_msg'; id: number } | null {
    if (message.sessionKey.startsWith('private:')) {
      const id = Number(message.sessionKey.slice('private:'.length));
      return Number.isFinite(id) ? { endpoint: 'send_private_msg', id } : null;
    }
    if (message.sessionKey.startsWith('group:')) {
      const id = Number(message.sessionKey.slice('group:'.length));
      return Number.isFinite(id) ? { endpoint: 'send_group_msg', id } : null;
    }
    return null;
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== this.cfg.listenPath) {
      res.writeHead(404);
      res.end();
      return;
    }
    const authorization = req.headers.authorization ?? '';
    const expected = `Bearer ${this.cfg.accessToken}`;
    if (!safeEqual(authorization, expected)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    // 上报必须回 200，否则 OneBot 实现会重复上报；解析失败同样回 200 空。
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      const event = JSON.parse(body || '{}') as OneBotEvent;
      const parsed = parseOneBotEvent(event);
      if (parsed && this.handler) {
        const reply = await this.handler(parsed);
        if (reply) await this.send(reply, parsed);
      }
    } catch {
      // 解析/处理失败不影响上报回执
    }
    res.end('{}');
  }
}
