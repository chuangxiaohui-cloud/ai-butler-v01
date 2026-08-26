/**
 * OneBot 11 协议类型（E241，S5 真实平台适配器）
 * 对接 NapCat / go-cqhttp / Lagrange 等 OneBot 11 实现（QQ 机器人协议）。
 * 文档：https://github.com/botuniverse/onebot-11
 */

export interface OneBotMessageSegment {
  type: string;
  data?: Record<string, unknown>;
}

/** OneBot 消息：可以是含 CQ 码的字符串，或消息段数组 */
export type OneBotMessage = string | OneBotMessageSegment[];

/** OneBot 11 上报事件（只声明本适配器需要的字段） */
export interface OneBotEvent {
  post_type?: string;
  message_type?: 'private' | 'group';
  sub_type?: string;
  message_id?: number;
  user_id?: number;
  group_id?: number;
  message?: OneBotMessage;
  raw_message?: string;
  self_id?: number;
  time?: number;
}

/** OneBot HTTP API 响应 */
export interface OneBotApiResponse {
  status?: string;
  retcode?: number;
  data?: Record<string, unknown>;
  wording?: string;
}

/** OneBot 通道配置（configs/im-channels.json 的 onebot 段） */
export interface OneBotChannelConfig {
  /** HTTP API 基址（NapCat 默认 http://127.0.0.1:3000） */
  httpApiBase: string;
  /** 事件上报监听地址（§10：默认仅本机） */
  listenHost?: string;
  /** 事件上报监听端口（NapCat 配置的上报地址即 http://<listenHost>:<listenPort><listenPath>） */
  listenPort: number;
  /** 事件上报路径（默认 /onebot/qq） */
  listenPath?: string;
  /** OneBot access_token（§10：必填否则拒绝启动，防未授权设备调用） */
  accessToken: string;
  /** 自 ID（可选，校验上报 self_id） */
  selfId?: number;
}
