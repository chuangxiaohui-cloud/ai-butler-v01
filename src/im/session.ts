/**
 * v1.0 S5：IM 会话映射（§4.5 会话隔离）
 * 每个 IM 用户/群映射独立会话，记忆按会话隔离。
 * conversationId 由 platform + sessionKey 确定性派生（SHA-1 前缀），重启稳定。
 */

import { createHash } from 'node:crypto';
import type { ImInboundMessage, ImPlatform } from './types.js';

export class ImSessionMapper {
  conversationIdFor(message: Pick<ImInboundMessage, 'platform' | 'sessionKey'>): string {
    const digest = createHash('sha1')
      .update(`${message.platform}:${message.sessionKey}`)
      .digest('hex')
      .slice(0, 12);
    return `im-${message.platform}-${digest}`;
  }
}
