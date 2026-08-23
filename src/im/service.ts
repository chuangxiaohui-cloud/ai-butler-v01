/**
 * v1.0 S5：远程对话服务（§4.5）
 * IM 消息路由：授权开关校验 → 会话映射（隔离）→ 复用同一搜索问答 pipeline
 * （不另起一套行为逻辑，§4.5 接口复用）→ 输出适配（短正文 / 长报告附件提示）。
 * 紧急通道语义保留：pipeline 内部规则③紧急分流不受 IM 层影响。
 */

import { ImGate } from './gate.js';
import { ImSessionMapper } from './session.js';
import { adaptReply, type ImReply } from './format.js';
import type { ImInboundMessage, ImPlatform } from './types.js';

/** 复用 pipeline 的问答契约（§4.2/§6.3 接口复用，注入方即 pipeline） */
export interface ImAsk {
  (text: string, conversationId: string): Promise<{ answer: string }>;
}

export interface ImServiceDeps {
  ask: ImAsk;
  gate?: ImGate;
  sessionMapper?: ImSessionMapper;
  /** 输出适配上限（缺省 500 字符） */
  maxLength?: number;
}

export interface ImServiceResult {
  ok: boolean;
  reply?: ImReply;
  /** 拒绝原因（授权未开 / 空消息） */
  error?: string;
  /** 实际使用的会话 id（会话隔离可审计） */
  conversationId?: string;
}

export class ImService {
  private readonly ask: ImAsk;
  private readonly gate: ImGate;
  private readonly sessionMapper: ImSessionMapper;
  private readonly maxLength: number;

  constructor(deps: ImServiceDeps) {
    this.ask = deps.ask;
    this.gate = deps.gate ?? new ImGate();
    this.sessionMapper = deps.sessionMapper ?? new ImSessionMapper();
    this.maxLength = deps.maxLength ?? 500;
  }

  async route(message: ImInboundMessage): Promise<ImServiceResult> {
    if (!message || !message.text || message.text.trim().length === 0) {
      return { ok: false, error: '空消息' };
    }
    if (!this.isAuthorized(message.platform)) {
      return { ok: false, error: `远程通道（${message.platform}）未授权，请先完成绑定/授权后启用` };
    }
    const conversationId = this.sessionMapper.conversationIdFor(message);
    const result = await this.ask(message.text.trim(), conversationId);
    return {
      ok: true,
      reply: adaptReply(result.answer ?? '', { maxLength: this.maxLength }),
      conversationId,
    };
  }

  private isAuthorized(platform: ImPlatform): boolean {
    return this.gate.isEnabled(platform);
  }
}
