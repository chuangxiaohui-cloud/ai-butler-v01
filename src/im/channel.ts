/**
 * v1.0 S5：真实 IM 平台通道抽象（§4.5 远程对话通道）
 * E224 骨架只提供 ImService（消息路由），真实平台适配器需实现 ImChannel：
 * start/stop 管理平台连接，onMessage 注册消息回调，send 把回复发回原会话。
 * 通道与 ImService 的装配：channel.onMessage(msg => service.route(msg))，
 * route 返回 reply 后由装配方调用 channel.send(reply, msg)。
 */

import type { ImInboundMessage, ImPlatform, ImReply } from './types.js';

/** 消息回调：返回 null 表示不回复（如未授权拒绝） */
export type ImChannelMessageHandler = (message: ImInboundMessage) => Promise<ImReply | null>;

export interface ImChannel {
  /** 通道标识（如 qq-onebot） */
  readonly id: string;
  /** 平台（§4.5：wechat/qq/feishu） */
  readonly platform: ImPlatform;
  /** 启动平台连接（幂等；失败抛错） */
  start(): Promise<void>;
  /** 停止平台连接并释放资源（幂等） */
  stop(): Promise<void>;
  /** 注册消息回调（一次通道一个装配方） */
  onMessage(handler: ImChannelMessageHandler): void;
  /** 把回复发回原会话（message 为收到时的原消息） */
  send(reply: ImReply, message: ImInboundMessage): Promise<{ ok: boolean; error?: string }>;
}
