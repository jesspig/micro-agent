/**
 * QQ 频道机器人类型定义
 */

import type { ChannelConfig } from "../../../runtime/channel/types.js";

// ============================================================================
// 常量定义
// ============================================================================

/** API 基础地址 */
export const API_BASE = "https://api.sgroup.qq.com";
export const SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";
export const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

/** WebSocket OP Codes */
export const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

/** 默认心跳间隔 */
export const DEFAULT_HEARTBEAT_INTERVAL = 41250;

/** 最大重连次数 */
export const MAX_RECONNECT_COUNT = 5;

/** processedIds 最大容量 */
export const MAX_PROCESSED_IDS = 1000;

/** processedIds 过期时间（毫秒）- 24小时 */
export const PROCESSED_IDS_MAX_AGE = 24 * 60 * 60 * 1000;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * QQ API 通用响应
 */
export interface QQApiResponse {
  id?: string;
  code?: number;
  message?: string;
  data?: unknown;
}

/**
 * QQ 频道机器人配置
 */
export interface QQBotConfig extends ChannelConfig {
  /** AppID（机器人ID） */
  appId: string;
  /** ClientSecret（机器人密钥） */
  clientSecret: string;
  /** 是否沙箱环境 */
  sandbox?: boolean | undefined;
  /** 允许发送消息的频道列表 */
  allowChannels?: string[] | undefined;
  /** 允许发送消息的用户列表 */
  allowFrom?: string[] | undefined;
}

/**
 * AccessToken 响应
 */
export interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Gateway 响应
 */
export interface GatewayResponse {
  url: string;
  shards?: number;
  session_start_limit?: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
}

/**
 * WebSocket 消息
 */
export interface WSMessage {
  op: number;
  d: unknown;
  s?: number;
  t?: string;
}

/**
 * 频道消息数据
 */
export interface ChannelMessageData {
  id: string;
  channel_id: string;
  guild_id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot: boolean;
  };
  timestamp: string;
}

/**
 * 群聊消息数据
 */
export interface GroupMessageData {
  id: string;
  group_id: string;
  group_openid: string;
  content: string;
  author: {
    id: string;
    member_openid: string;
    bot: boolean;
  };
  timestamp: string;
}

/**
 * 单聊消息数据
 */
export interface C2CMessageData {
  id: string;
  content: string;
  author: {
    id: string;
    user_openid: string;
    bot: boolean;
  };
  timestamp: string;
}

/**
 * Hello 消息数据
 */
export interface HelloData {
  heartbeat_interval?: number;
}

/**
 * Ready 事件数据
 */
export interface ReadyData {
  session_id?: string;
}

/**
 * WebSocket 连接状态
 */
export interface WSConnectionState {
  ws: WebSocket | null;
  sequence: number | null;
  heartbeatTimer: Timer | null;
  heartbeatInterval: number;
  reconnectTimer: Timer | null;
  running: boolean;
  reconnectCount: number;
}

/**
 * 消息处理器类型
 */
export type MessageHandler = (
  eventType: string,
  data: unknown
) => void;

/**
 * WebSocket 事件处理器
 */
export interface WSEventHandlers {
  onOpen: () => void;
  onMessage: (msg: WSMessage) => void;
  onError: (error: Event) => void;
  onClose: (event: CloseEvent) => void;
}

/**
 * 消息 ID 解析结果
 */
export interface ParsedMessageId {
  type: "channel" | "group" | "c2c" | "dms";
  targetId: string;
  messageId: string;
}

/**
 * 解析消息 ID
 * 
 * 格式：
 * - 频道消息: `{channel_id}:{message_id}`
 * - 群聊消息: `group:{group_id}:{message_id}`
 * - 单聊消息: `c2c:{user_openid}:{message_id}`
 * - 私聊消息: `dms:{user_id}:{message_id}`
 */
export function parseMessageId(messageId: string): ParsedMessageId | null {
  const parts = messageId.split(":");

  // 频道消息: {channel_id}:{message_id}
  if (parts.length === 2) {
    return { type: "channel", targetId: parts[0]!, messageId: parts[1]! };
  }

  // 带类型前缀的消息
  if (parts.length === 3) {
    const prefix = parts[0];
    if (prefix === "group") {
      return { type: "group", targetId: parts[1]!, messageId: parts[2]! };
    }
    if (prefix === "c2c") {
      return { type: "c2c", targetId: parts[1]!, messageId: parts[2]! };
    }
    if (prefix === "dms") {
      return { type: "dms", targetId: parts[1]!, messageId: parts[2]! };
    }
  }

  return null;
}
