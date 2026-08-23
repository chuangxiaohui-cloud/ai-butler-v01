/**
 * v1.0 S5：远程对话通道类型（§4.5 微信/QQ/飞书）
 * IM 消息统一接入同一搜索问答接口契约，不另起一套行为逻辑。
 */

export type ImPlatform = 'wechat' | 'qq' | 'feishu';

export interface ImInboundMessage {
  id: string;
  platform: ImPlatform;
  /** 用户/群标识（会话隔离键：每个 IM 用户/群映射独立会话） */
  sessionKey: string;
  isGroup: boolean;
  text: string;
  ts: number;
}

export interface ImReply {
  text: string;
  /** 输出适配：长报告已截断 */
  truncated?: boolean;
  /** 附件/文件提示（真实 IM 接入后改发文件） */
  attachmentHint?: string;
}

export interface ImChannelConfig {
  platform: ImPlatform;
  displayName: string;
}
